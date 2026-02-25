// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { assertQuotaOrThrow, QuotaError } from "@/lib/billing/guard";
import { addUsageEvent } from "@/lib/billing/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type Mode = "single" | "team" | "detector";
type ModelKind = "fast" | "quality";
type Stage = "planner" | "writer" | "reviewer";

const FAST_MODEL = "llama-3.1-8b-instant";
const QUALITY_MODEL = "llama-3.3-70b-versatile";

/**
 * ✅ OpenRouter: 只用你实测 OK=200 的免费模型池（稳定优先）
 */
const OR_STABLE_FREE = [
  "liquid/lfm-2.5-1.2b-instruct:free",
  "google/gemma-3n-e4b-it:free",
  "google/gemma-3n-e2b-it:free",
  "arcee-ai/trinity-large-preview:free",
  "google/gemma-3-4b-it:free",
  "google/gemma-3-27b-it:free",
  "google/gemma-3-12b-it:free",
  "openrouter/free",
];

const OR_PLANNER_CANDIDATES = OR_STABLE_FREE;
const OR_WRITER_CANDIDATES = OR_STABLE_FREE;
const OR_REVIEWER_CANDIDATES = OR_STABLE_FREE;

// ===================== error helpers =====================
function jsonErr(status: number, code: string, message: string, extra?: any) {
  return NextResponse.json(
    { ok: false, error: code, message, ...(extra ? { extra } : {}) },
    { status }
  );
}

function mapUpstreamError(e: any): { status: number; error: string; message: string; extra?: any } {
  const code = String(e?.code || "");
  const httpStatus = Number(e?.httpStatus || 0);

  if (code === "OR_CREDIT_DEPLETED" || httpStatus === 402) {
    return { status: 402, error: "OR_CREDIT_DEPLETED", message: "OpenRouter credit depleted.", extra: e?.extra };
  }
  if (code === "UPSTREAM_RATE_LIMIT" || httpStatus === 429) {
    return { status: 429, error: "UPSTREAM_RATE_LIMIT", message: "Upstream rate limited. Please retry later.", extra: e?.extra };
  }
  if (code === "UPSTREAM_OVERLOADED" || httpStatus === 503) {
    return { status: 503, error: "UPSTREAM_OVERLOADED", message: "Upstream overloaded. Please retry later.", extra: e?.extra };
  }
  if (code === "MODEL_NOT_SUPPORTED" || httpStatus === 400) {
    return { status: 502, error: "MODEL_NOT_SUPPORTED", message: "Upstream model not supported.", extra: e?.extra };
  }
  if (code === "OPENROUTER_TIMEOUT" || httpStatus === 504) {
    return { status: 504, error: "OPENROUTER_TIMEOUT", message: "OpenRouter timeout.", extra: e?.extra };
  }

  return {
    status: 500,
    error: "INTERNAL_ERROR",
    message: e?.message ?? "Unknown error",
    extra: e?.extra,
  };
}

function shouldFallback(e: any) {
  const httpStatus = Number(e?.httpStatus || 0);
  const code = String(e?.code || "");

  if (httpStatus === 402 || httpStatus === 429 || httpStatus === 503) return true;
  if (httpStatus === 400 && (code === "MODEL_NOT_SUPPORTED" || String(e?.message || "").includes("model_not_supported"))) return true;
  if (httpStatus === 502) return true;
  if (code === "MODEL_NOT_SUPPORTED" || code === "UPSTREAM_RATE_LIMIT" || code === "UPSTREAM_OVERLOADED") return true;
  if (code === "OPENROUTER_NO_RESPONSE" || code === "OPENROUTER_BAD_JSON" || code === "OPENROUTER_TIMEOUT") return true;

  return false;
}

// ===================== SSE helpers =====================
function sseHeaders() {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  } as Record<string, string>;
}

function sseEvent(event: string, data: any) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function wantsSSE(req: Request) {
  const accept = req.headers.get("accept") || "";
  return accept.includes("text/event-stream");
}

// ===================== utilities =====================
function getLastUserText(messages: ChatMessage[]) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  return (lastUser?.content || "").trim();
}

function trimHistory(messages: ChatMessage[], max = 20) {
  const nonSystem = messages.filter((m) => m.role !== "system");
  return nonSystem.slice(-max);
}

// ===================== prompts =====================
function systemPlanner(isZh: boolean) {
  return isZh
    ? [
        "你是 Planner（规划/拆解专家）。",
        "你的目标：把用户需求拆成一份【可执行写作计划】，让 Writer 按计划写草稿、Reviewer 输出最终报告。",
        "",
        "输出格式（纯文本，不要 JSON，不要代码块）：",
        "【Plan】",
        "1) 目标（一句话）",
        "2) 读者/场景（如：作业报告/科普文章/政策建议）",
        "3) 报告结构（用 5-8 个小标题，按顺序列出）",
        "4) 每个小标题要点（每节 2-4 条要点，短句即可）",
        "5) 需要补充的信息（最多 3 条；如果不需要就写“无”）",
        "",
        "强约束：",
        "- 不要写完整正文，不要写结论段，不要出现“我将/我会”这种过程描述。",
        "- 不要引用具体数据或论文（除非用户给了来源）。",
        "- 语言风格：客观、清晰、可交付。",
      ].join("\n")
    : [
        "You are Planner.",
        "Goal: produce an actionable writing plan so Writer can draft and Reviewer can deliver the final report.",
        "",
        "Output format (plain text only, no JSON, no code blocks):",
        "[Plan]",
        "1) Goal (one sentence)",
        "2) Audience/context",
        "3) Structure (5-8 section headings in order)",
        "4) Key points per section (2-4 bullets each, short)",
        "5) Missing info (max 3; or 'None')",
        "",
        "Constraints:",
        "- Do not write the full report.",
        "- Do not add citations or specific statistics unless user provided sources.",
        "- Tone: objective and deliverable.",
      ].join("\n");
}

function systemWriter(isZh: boolean) {
  return isZh
    ? [
        "你是 Writer（写作/实现专家）。",
        "任务：严格按照 Planner 的【Plan】写一份【草稿 Draft】。",
        "",
        "输出格式（纯文本，不要 JSON，不要代码块）：",
        "【Draft】",
        "- 按 Plan 的结构写，每个小标题下写成段落。",
        "- 允许写得比较完整，但不要写“最终版/结论总结”。",
        "- 如果信息不足，可以做合理假设，但必须用“【假设】...”标注（最多 3 条）。",
        "",
        "强约束：",
        "- 不要输出 Review，不要输出 Conclusion。",
        "- 不要提及“Planner/Writer/Reviewer”这些角色词。",
        "- 语言：中文自然表达，逻辑清楚，避免空话。",
      ].join("\n")
    : [
        "You are Writer.",
        "Task: write a Draft strictly following the Planner's Plan.",
        "",
        "Output format (plain text only, no JSON, no code blocks):",
        "[Draft]",
        "- Follow the plan structure with headings and paragraphs.",
        "- Make it reasonably complete, but do NOT write the final conclusion/final version.",
        "- If info is missing, add up to 3 assumptions labeled as [Assumption] ...",
        "",
        "Constraints:",
        "- Do not output Review or Conclusion.",
        "- Do not mention Planner/Writer/Reviewer.",
      ].join("\n");
}

function systemReviewer(isZh: boolean) {
  return isZh
    ? [
        "你是 Reviewer（审阅/交付专家）。",
        "任务：",
        "1) 检查 Draft 是否遵循 Plan、是否遗漏关键点、是否逻辑矛盾、是否啰嗦/空话；",
        "2) 基于审阅建议，对 Draft 进行“实质性改写与增强”，输出改好的正文；",
        "3) 在改好的正文基础上，输出最终的 Conclusion（完整可交付）。",
        "",
        "输出格式（必须严格遵循，纯文本，不要 JSON，不要代码块）：",
        "【Review】",
        "- 3-8 条：问题/风险点 + 修改建议（务必可执行）",
        "",
        "【Revised Draft】",
        "- 根据 Review 建议改写后的正文（结构要与 Plan 保持一致）。",
        "",
        "【Conclusion】",
        "- 最终可交付报告正文：标题、摘要、背景、主要问题、成因机制、风险群体、分层建议（家庭/学校/政策）、结论。",
        "",
        "强约束：",
        "- 不要杜撰具体统计数字或具体论文结论；只能一般性描述或用“可能/常见/研究普遍认为”。",
        "- 不要出现“我认为/我将/我会”。",
        "- 不要提及角色词。",
      ].join("\n")
    : [
        "You are Reviewer.",
        "Tasks:",
        "1) Check whether the Draft follows the Plan, missing key points, logic conflicts, verbosity/empty talk;",
        "2) Substantially revise and improve the Draft;",
        "3) Produce the final deliverable Conclusion based on the revised draft.",
        "",
        "Output format (plain text only, no JSON, no code blocks):",
        "[Review]",
        "- 3-8 actionable issues + fixes",
        "",
        "[Revised Draft]",
        "- Revised version of the Draft (keep the plan structure).",
        "",
        "[Conclusion]",
        "- Final deliverable report including: title, abstract, background, main issues, mechanisms, at-risk groups, recommendations (family/school/policy), conclusion.",
        "",
        "Constraints:",
        "- No fabricated statistics or fake citations.",
        "- Do not mention role words.",
      ].join("\n");
}

function buildStageMessages(baseHistory: ChatMessage[], system: string, userTask: string): ChatMessage[] {
  return [{ role: "system", content: system }, ...trimHistory(baseHistory, 20), { role: "user", content: userTask }];
}

// ===================== persistence =====================
async function ensureSessionId(opts: { userId: string; chatSessionId: string | null; userRequest: string }) {
  const { userId, chatSessionId, userRequest } = opts;

  if (chatSessionId) {
    const s = await prisma.chatSession.findFirst({
      where: { id: chatSessionId, userId },
      select: { id: true },
    });
    if (s) return chatSessionId;
  }

  const title = userRequest.slice(0, 40) || "New Chat";
  const created = await prisma.chatSession.create({
    data: { userId, title },
    select: { id: true },
  });
  return created.id;
}

async function saveChatMessage(chatSessionId: string, role: "user" | "assistant" | "system", content: string) {
  if (!content?.trim()) return;
  await prisma.chatMessage.create({
    data: { chatSessionId, role, content },
    select: { id: true },
  });
}

async function safeSave(fn: () => Promise<any>) {
  try {
    await fn();
  } catch (e) {
    console.error("save failed:", e);
  }
}

// ===================== provider calls =====================
async function callGroqChat(apiKey: string, modelId: string, messages: ChatMessage[]) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: modelId, messages }),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    const err: any = new Error(`GROQ_HTTP_${res.status}`);
    err.httpStatus = res.status;
    err.code = `GROQ_HTTP_${res.status}`;
    err.extra = { head: text.slice(0, 1200) };
    throw err;
  }

  let data: any;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    const err: any = new Error("GROQ_BAD_JSON");
    err.httpStatus = 502;
    err.code = "GROQ_BAD_JSON";
    err.extra = { head: text.slice(0, 1200) };
    throw err;
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    const err: any = new Error("GROQ_NO_RESPONSE");
    err.httpStatus = 502;
    err.code = "GROQ_NO_RESPONSE";
    err.extra = data;
    throw err;
  }

  return { content: String(content), modelUsed: modelId };
}

function withTimeout(ms: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  return { controller, cancel: () => clearTimeout(t) };
}

async function callOpenRouterChat(apiKey: string, modelId: string, messages: ChatMessage[], timeoutMs = 25000) {
  const siteUrl = process.env.OPENROUTER_SITE_URL || "http://localhost:3000";
  const appName = process.env.OPENROUTER_APP_NAME || "ai-multimodel";

  const { controller, cancel } = withTimeout(timeoutMs);

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": siteUrl,
        "X-Title": appName,
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        max_tokens: 800,
      }),
      signal: controller.signal,
    });

    const text = await res.text().catch(() => "");

    if (!res.ok) {
      const head = text.slice(0, 1200);
      const err: any = new Error(`OPENROUTER_HTTP_${res.status}: ${head || "(empty body)"}`);
      err.httpStatus = res.status;

      if (res.status === 402) err.code = "OR_CREDIT_DEPLETED";
      else if (res.status === 429) err.code = "UPSTREAM_RATE_LIMIT";
      else if (res.status === 503) err.code = "UPSTREAM_OVERLOADED";
      else if (res.status === 400) err.code = "MODEL_NOT_SUPPORTED";
      else if (res.status === 502) err.code = "OPENROUTER_NO_RESPONSE";
      else err.code = `OPENROUTER_HTTP_${res.status}`;

      err.extra = { modelId, status: res.status, head };
      throw err;
    }

    let data: any;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      const err: any = new Error("OPENROUTER_BAD_JSON");
      err.httpStatus = 502;
      err.code = "OPENROUTER_BAD_JSON";
      err.extra = { modelId, head: text.slice(0, 1200) };
      throw err;
    }

    const content = data?.choices?.[0]?.message?.content;
    const actualModel = data?.model || modelId;

    if (!content) {
      const err: any = new Error("OPENROUTER_NO_RESPONSE");
      err.httpStatus = 502;
      err.code = "OPENROUTER_NO_RESPONSE";
      err.extra = { modelId, data };
      throw err;
    }

    return { content: String(content), modelUsed: String(actualModel) };
  } catch (e: any) {
    if (e?.name === "AbortError") {
      const err: any = new Error("OPENROUTER_TIMEOUT");
      err.httpStatus = 504;
      err.code = "OPENROUTER_TIMEOUT";
      err.extra = { modelId, timeoutMs };
      throw err;
    }
    throw e;
  } finally {
    cancel();
  }
}

async function tryWithFallback(opts: {
  stage: Stage;
  messages: ChatMessage[];
  groqKey: string;
  groqModel: string;
  openrouterKey?: string;
  openrouterCandidates: string[];
}) {
  const { stage, messages, groqKey, groqModel, openrouterKey, openrouterCandidates } = opts;

  if (openrouterKey) {
    for (const mid of openrouterCandidates) {
      try {
        const out = await callOpenRouterChat(openrouterKey, mid, messages);
        return { stage, provider: "openrouter" as const, model: out.modelUsed, content: out.content };
      } catch (e: any) {
        console.warn(`[${stage}] OpenRouter failed:`, mid, e?.code || e?.message, e?.httpStatus);
        if (!shouldFallback(e)) throw e;
      }
    }
  }

  const g = await callGroqChat(groqKey, groqModel, messages);
  return { stage, provider: "groq" as const, model: g.modelUsed, content: g.content };
}

// ===================== parse reviewer output =====================
function splitReviewerTriplet(text: string) {
  const t = text.trim();

  const pick = (label: string) => {
    const i = t.indexOf(label);
    return i >= 0 ? i : -1;
  };

  const iReview = pick("【Review】") >= 0 ? pick("【Review】") : pick("[Review]");
  const iRevised = pick("【Revised Draft】") >= 0 ? pick("【Revised Draft】") : pick("[Revised Draft]");
  const iConclusion = pick("【Conclusion】") >= 0 ? pick("【Conclusion】") : pick("[Conclusion]");

  if (iReview < 0 && iRevised < 0 && iConclusion < 0) {
    return { review: "", revisedDraft: "", conclusion: t };
  }

  const slice = (from: number, to: number) =>
    from >= 0 ? t.slice(from, to >= 0 ? to : undefined).trim() : "";

  const review = slice(iReview, iRevised >= 0 ? iRevised : iConclusion);
  const revisedDraft = slice(iRevised, iConclusion);
  const conclusion = slice(iConclusion, -1);

  return { review, revisedDraft, conclusion };
}

// ===================== POST /api/chat =====================
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      messages?: ChatMessage[];
      model?: ModelKind;
      mode?: Mode;
      chatSessionId?: string | null;
      lang?: "zh" | "en";
    };

    const messages = body.messages;
    const mode = body.mode ?? "single";
    const modelKind = body.model ?? "fast";
    let chatSessionId = body.chatSessionId ?? null;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return jsonErr(400, "MISSING_MESSAGES", "Missing messages");
    }

    if (mode === "detector") {
      return jsonErr(400, "DETECTOR_MODE_NOT_ALLOWED", "Detector mode uses /api/ai-detector.");
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return jsonErr(500, "MISSING_GROQ_API_KEY", "Missing GROQ_API_KEY");
    const openrouterKey = process.env.OPENROUTER_API_KEY;

    const groqModel = modelKind === "quality" ? QUALITY_MODEL : FAST_MODEL;

    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;

    const shouldSaveChat = Boolean(userId) && (mode === "single" || mode === "team");
    const shouldBillChat = Boolean(userId) && (mode === "single" || mode === "team");

    if (shouldBillChat) {
      try {
        await assertQuotaOrThrow({ userId: userId!, action: "chat", amount: 1 });
      } catch (e) {
        if (e instanceof QuotaError) {
          return NextResponse.json({ ok: false, error: e.code, message: e.message }, { status: e.status ?? 429 });
        }
        throw e;
      }
    }

    const isZh = body.lang === "zh" || /[\u4e00-\u9fff]/.test(getLastUserText(messages));
    const userRequest = getLastUserText(messages);
    if (!userRequest) return jsonErr(400, "NO_USER_INPUT", "No user message found");

    // ========= SSE 模式 =========
    if (wantsSSE(request)) {
      const encoder = new TextEncoder();

      const stream = new ReadableStream<Uint8Array>({
        start: async (controller) => {
          const send = (event: string, payload: any) =>
            controller.enqueue(encoder.encode(sseEvent(event, payload)));

          try {
            send("status", { ok: true, stage: "thinking", message: isZh ? "思考中…" : "Thinking…" });

            // ✅ 确保 session & 保存用户消息（仅登录用户）
            if (shouldSaveChat) {
              chatSessionId = await ensureSessionId({ userId: userId!, chatSessionId, userRequest });
              await safeSave(() => saveChatMessage(chatSessionId!, "user", userRequest));
            }

            // ✅ single：只跑一次 writer（更稳）
            if (mode === "single") {
              send("stage_start", { stage: "writer" });

              const writerMsgs = buildStageMessages(
                messages,
                systemWriter(isZh),
                isZh
                  ? `用户需求：\n${userRequest}\n\n请直接给出最终回答。`
                  : `User request:\n${userRequest}\n\nGive the final answer.`
              );

              const writer = await tryWithFallback({
                stage: "writer",
                messages: writerMsgs,
                groqKey,
                groqModel,
                openrouterKey,
                openrouterCandidates: OR_WRITER_CANDIDATES,
              });

              send("stage_done", writer);

              // ✅ 保存 assistant
              if (shouldSaveChat && chatSessionId) {
                await safeSave(() => saveChatMessage(chatSessionId!, "assistant", writer.content));
              }

              if (shouldBillChat) {
                addUsageEvent(userId!, "chat_count", 1).catch((e) => console.error("usageEvent 写入失败：", e));
              }

              send("done", { ok: true, chatSessionId, stages: [writer], reply: writer.content });
              controller.close();
              return;
            }

            // ✅ team：三段 pipeline
            send("stage_start", { stage: "planner" });
            const plannerMsgs = buildStageMessages(
              messages,
              systemPlanner(isZh),
              isZh
                ? `用户需求：\n${userRequest}\n\n请输出 plan（只要计划/大纲）。`
                : `User request:\n${userRequest}\n\nOutput a plan/outline only.`
            );

            const planner = await tryWithFallback({
              stage: "planner",
              messages: plannerMsgs,
              groqKey,
              groqModel,
              openrouterKey,
              openrouterCandidates: OR_PLANNER_CANDIDATES,
            });
            send("stage_done", planner);

            send("stage_start", { stage: "writer" });
            const writerMsgs = buildStageMessages(
              messages,
              systemWriter(isZh),
              isZh
                ? `下面是 Planner 的计划：\n\n${planner.content}\n\n请严格按计划写出主体内容。`
                : `Planner plan:\n\n${planner.content}\n\nWrite the main content strictly following it.`
            );

            const writer = await tryWithFallback({
              stage: "writer",
              messages: writerMsgs,
              groqKey,
              groqModel,
              openrouterKey,
              openrouterCandidates: OR_WRITER_CANDIDATES,
            });
            send("stage_done", writer);

            send("stage_start", { stage: "reviewer" });
            const reviewerMsgs = buildStageMessages(
              messages,
              systemReviewer(isZh),
              isZh
                ? `【Planner】\n${planner.content}\n\n【Writer】\n${writer.content}\n\n请按要求输出 Review + Revised Draft + Conclusion。`
                : `【Planner】\n${planner.content}\n\n【Writer】\n${writer.content}\n\nOutput Review + Revised Draft + Conclusion.`
            );

            const reviewer = await tryWithFallback({
              stage: "reviewer",
              messages: reviewerMsgs,
              groqKey,
              groqModel,
              openrouterKey,
              openrouterCandidates: OR_REVIEWER_CANDIDATES,
            });

            const { review, revisedDraft, conclusion } = splitReviewerTriplet(reviewer.content);
            send("stage_done", { ...reviewer, review, revisedDraft, conclusion });

            const finalReply = [revisedDraft, conclusion].filter(Boolean).join("\n\n") || reviewer.content;

            // ✅ 保存 assistant（存最终交付内容）
            if (shouldSaveChat && chatSessionId) {
              await safeSave(() => saveChatMessage(chatSessionId!, "assistant", finalReply));
            }

            if (shouldBillChat) {
              addUsageEvent(userId!, "chat_count", 1).catch((e) => console.error("usageEvent 写入失败：", e));
            }

            send("done", {
              ok: true,
              chatSessionId,
              stages: [planner, writer, { ...reviewer, review, revisedDraft, conclusion }],
              reply: finalReply,
            });

            controller.close();
          } catch (err: any) {
            console.error("[/api/chat] pipeline error:", err?.message || err);
            const mapped = mapUpstreamError(err);
            send("error", { ok: false, error: mapped.error, message: mapped.message, extra: mapped.extra });
            controller.close();
          }
        },
      });

      return new Response(stream, { headers: sseHeaders() });
    }

    // ========= 非 SSE：一次性 JSON 返回 =========

    // ✅ 确保 session & 保存用户消息（仅登录用户）
    if (shouldSaveChat) {
      chatSessionId = await ensureSessionId({ userId: userId!, chatSessionId, userRequest });
      await safeSave(() => saveChatMessage(chatSessionId!, "user", userRequest));
    }

    // ✅ single：只跑一次 writer
    if (mode === "single") {
      const writerMsgs = buildStageMessages(
        messages,
        systemWriter(isZh),
        isZh ? `用户需求：\n${userRequest}\n\n请直接给出最终回答。` : `User request:\n${userRequest}\n\nGive the final answer.`
      );

      const writer = await tryWithFallback({
        stage: "writer",
        messages: writerMsgs,
        groqKey,
        groqModel,
        openrouterKey,
        openrouterCandidates: OR_WRITER_CANDIDATES,
      });

      // ✅ 保存 assistant
      if (shouldSaveChat && chatSessionId) {
        await safeSave(() => saveChatMessage(chatSessionId!, "assistant", writer.content));
      }

      if (shouldBillChat) {
        addUsageEvent(userId!, "chat_count", 1).catch((e) => console.error("usageEvent 写入失败：", e));
      }

      return NextResponse.json({
        ok: true,
        chatSessionId,
        stages: [writer],
        reply: writer.content,
      });
    }

    // ✅ team：三段 pipeline
    const plannerMsgs = buildStageMessages(
      messages,
      systemPlanner(isZh),
      isZh ? `用户需求：\n${userRequest}\n\n请输出 plan（只要计划/大纲）。` : `User request:\n${userRequest}\n\nOutput a plan/outline only.`
    );

    const planner = await tryWithFallback({
      stage: "planner",
      messages: plannerMsgs,
      groqKey,
      groqModel,
      openrouterKey,
      openrouterCandidates: OR_PLANNER_CANDIDATES,
    });

    const writerMsgs = buildStageMessages(
      messages,
      systemWriter(isZh),
      isZh ? `下面是 Planner 的计划：\n\n${planner.content}\n\n请严格按计划写出主体内容。` : `Planner plan:\n\n${planner.content}\n\nWrite the main content strictly following it.`
    );

    const writer = await tryWithFallback({
      stage: "writer",
      messages: writerMsgs,
      groqKey,
      groqModel,
      openrouterKey,
      openrouterCandidates: OR_WRITER_CANDIDATES,
    });

    const reviewerMsgs = buildStageMessages(
      messages,
      systemReviewer(isZh),
      isZh
        ? `【Planner】\n${planner.content}\n\n【Writer】\n${writer.content}\n\n请按要求输出 Review + Revised Draft + Conclusion。`
        : `【Planner】\n${planner.content}\n\n【Writer】\n${writer.content}\n\nOutput Review + Revised Draft + Conclusion.`
    );

    const reviewer = await tryWithFallback({
      stage: "reviewer",
      messages: reviewerMsgs,
      groqKey,
      groqModel,
      openrouterKey,
      openrouterCandidates: OR_REVIEWER_CANDIDATES,
    });

    const { review, revisedDraft, conclusion } = splitReviewerTriplet(reviewer.content);

    const finalReply = [revisedDraft, conclusion].filter(Boolean).join("\n\n") || reviewer.content;

    // ✅ 保存 assistant（存最终交付内容）
    if (shouldSaveChat && chatSessionId) {
      await safeSave(() => saveChatMessage(chatSessionId!, "assistant", finalReply));
    }

    if (shouldBillChat) {
      addUsageEvent(userId!, "chat_count", 1).catch((e) => console.error("usageEvent 写入失败：", e));
    }

    return NextResponse.json({
      ok: true,
      chatSessionId,
      stages: [planner, writer, { ...reviewer, review, revisedDraft, conclusion }],
      reply: finalReply,
    });
  } catch (err: any) {
    console.error("[/api/chat] error:", err?.message || err);
    const mapped = mapUpstreamError(err);
    return jsonErr(mapped.status, mapped.error, mapped.message, mapped.extra);
  }
}