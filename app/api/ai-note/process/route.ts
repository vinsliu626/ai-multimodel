// app/api/ai-note/process/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { callGroqTranscribe, callGroqChat } from "@/lib/ai/groq";
import { callOpenRouterChat, shouldFallback, type ChatMessage } from "@/lib/ai/openrouter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApiErr =
  | "AUTH_REQUIRED"
  | "MISSING_NOTE_ID"
  | "FORBIDDEN"
  | "NO_CHUNKS"
  | "MISSING_KEYS"
  | "ASR_FAILED"
  | "LLM_FAILED"
  | "INTERNAL_ERROR";

function bad(code: ApiErr, status = 400, message?: string, extra?: any) {
  return NextResponse.json({ ok: false, error: code, message: message ?? code, ...(extra ? { extra } : {}) }, { status });
}

function splitByChars(s: string, partChars: number) {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    out.push(s.slice(i, i + partChars));
    i += partChars;
  }
  return out;
}

async function llmWithFallback(opts: {
  messages: ChatMessage[];
  openrouterKey?: string;
  openrouterCandidates: string[];
  groqKey: string;
  groqModel: string;
}) {
  // 1) OpenRouter free 优先
  if (opts.openrouterKey) {
    for (const mid of opts.openrouterCandidates) {
      try {
        const r = await callOpenRouterChat({
          apiKey: opts.openrouterKey,
          modelId: mid,
          messages: opts.messages,
        });
        return { provider: "openrouter" as const, model: r.modelUsed, content: r.content };
      } catch (e: any) {
        console.warn("[ai-note] openrouter failed:", mid, e?.code || e?.message, e?.httpStatus);
        if (!shouldFallback(e)) throw e;
      }
    }
  }

  // 2) Groq 兜底
  const g = await callGroqChat({
    apiKey: opts.groqKey,
    modelId: opts.groqModel,
    messages: opts.messages,
  });

  return { provider: "groq" as const, model: g.modelUsed, content: g.content };
}

// 你可以按自己 UI 调整这个“最终笔记格式”
function systemNoteWriter(isZh: boolean) {
  return isZh
    ? [
        "你是一个专业的课堂/会议笔记整理助手。",
        "输入是一段语音转写文本（可能有口语、重复、错别字）。",
        "输出必须是可直接给用户的“最终笔记”，结构固定如下（必须包含这些标题）：",
        "1) TL;DR（3-6条）",
        "2) Outline（分层列表）",
        "3) Key Points（要点，带小标题）",
        "4) Action Items（如果没有就写 None）",
        "5) Glossary（术语解释：可选，没有就写 None）",
        "要求：尽量保留事实与数字；不要胡编；不确定就标注“(unclear)”；语言用中文。",
      ].join("\n")
    : [
        "You are a professional note-taking assistant.",
        "Input is ASR transcript (may be messy).",
        "Output must be final notes with headings:",
        "1) TL;DR (3-6 bullets)",
        "2) Outline (nested)",
        "3) Key Points (with mini headings)",
        "4) Action Items (or None)",
        "5) Glossary (or None)",
        "Rules: don't invent facts; mark unclear as (unclear).",
      ].join("\n");
}

// 分段：把每段压成“段落摘要+要点”，最后再合并
function systemPartSummarizer(isZh: boolean) {
  return isZh
    ? [
        "你是分段笔记压缩器。",
        "给你一段转写文本，请输出：",
        "- 段落摘要（1-3句）",
        "- 段落要点（最多8条）",
        "不要写最终 TL;DR，不要写 Action Items。",
        "只输出纯文本，不要 JSON。",
      ].join("\n")
    : [
        "You summarize one transcript part.",
        "Output: short summary + bullet key points (<=8). No final TL;DR. Plain text only.",
      ].join("\n");
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return bad("AUTH_REQUIRED", 401);

    const body = (await req.json().catch(() => null)) as null | { noteId?: string; lang?: "zh" | "en" };
    const noteId = String(body?.noteId || "").trim();
    if (!noteId) return bad("MISSING_NOTE_ID", 400);

    const isZh = body?.lang === "zh";

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return bad("MISSING_KEYS", 500, "Missing GROQ_API_KEY");

    const openrouterKey = process.env.OPENROUTER_API_KEY || undefined;

    // ✅ ownership
    const note = await prisma.aiNoteSession.findUnique({
      where: { id: noteId },
      select: { userId: true },
    });

    if (!note) return bad("NO_CHUNKS", 404, "Note session not found (upload chunks first).");
    if (note.userId !== userId) return bad("FORBIDDEN", 403);

    // ✅ fetch chunks
    const chunks = await prisma.aiNoteChunk.findMany({
      where: { noteId },
      orderBy: { chunkIndex: "asc" },
      select: { chunkIndex: true, mime: true, data: true, size: true },
    });

    if (!chunks.length) return bad("NO_CHUNKS", 400, "No chunks uploaded yet.");

    // 合并
    const mime = chunks.find((c) => c.mime)?.mime || "audio/webm";
    const totalBytes = chunks.reduce((a, c) => a + (c.size || 0), 0);

    const buffers = chunks.map((c) => Buffer.from(c.data as any));
    const audio = Buffer.concat(buffers);

    // 1) ASR
    let transcript = "";
    try {
      const asr = await callGroqTranscribe({
        apiKey: groqKey,
        audio,
        mime,
        filename: mime.includes("mp4") ? "audio.mp4" : "audio.webm",
        model: process.env.AI_NOTE_ASR_MODEL || "whisper-large-v3",
      });
      transcript = asr.text;
    } catch (e: any) {
      console.error("[ai-note] ASR failed:", e?.code || e?.message, e?.extra);
      return bad("ASR_FAILED", 502, "ASR failed", { code: e?.code, message: e?.message, extra: e?.extra });
    }

    // 2) transcript 分段
    const partChars = Number(process.env.AI_NOTE_TRANSCRIPT_CHARS_PER_PART || 6000);
    const parts = splitByChars(transcript, partChars);

    // 3) 每段压缩
    const partNotes: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      const msgs: ChatMessage[] = [
        { role: "system", content: systemPartSummarizer(isZh) },
        {
          role: "user",
          content: `这是第 ${i + 1}/${parts.length} 段转写：\n\n${part}`,
        },
      ];

      const out = await llmWithFallback({
        messages: msgs,
        openrouterKey,
        openrouterCandidates: [
          // ✅ 你测试里“200 且快”的放前面（更稳）
          "liquid/lfm-2.5-1.2b-instruct:free",
          "google/gemma-3n-e4b-it:free",
          "google/gemma-3n-e2b-it:free",
          "arcee-ai/trinity-large-preview:free",
          "google/gemma-3-4b-it:free",
          "google/gemma-3-27b-it:free",
          // 最终兜底
          "openrouter/free",
        ],
        groqKey,
        groqModel: "llama-3.1-8b-instant",
      });

      partNotes.push(out.content);
    }

    // 4) 最终合并生成最终笔记
    const finalMsgs: ChatMessage[] = [
      { role: "system", content: systemNoteWriter(isZh) },
      {
        role: "user",
        content:
          `请根据“分段摘要与要点”合并成一份最终笔记。\n\n` +
          `【分段内容】\n` +
          partNotes.map((t, idx) => `--- Part ${idx + 1}/${partNotes.length} ---\n${t}`).join("\n\n"),
      },
    ];

    let finalNote = "";
    try {
      const out = await llmWithFallback({
        messages: finalMsgs,
        openrouterKey,
        openrouterCandidates: [
          "google/gemma-3-27b-it:free", // 你测试里慢一点但更“会写”
          "arcee-ai/trinity-large-preview:free",
          "google/gemma-3-12b-it:free",
          "openrouter/free",
        ],
        groqKey,
        groqModel: "llama-3.3-70b-versatile",
      });
      finalNote = out.content;
    } catch (e: any) {
      console.error("[ai-note] LLM final failed:", e?.code || e?.message, e?.extra);
      return bad("LLM_FAILED", 502, "LLM failed", { code: e?.code, message: e?.message, extra: e?.extra });
    }

    // 5) 写回 DB（字段名你按自己 schema 调整）
    await prisma.aiNoteSession.update({
      where: { id: noteId },
      data: {
        transcript,
        notes: finalNote,
        bytes: totalBytes,
        mime,
        // updatedAt: new Date(),
      } as any,
    });

    return NextResponse.json({
      ok: true,
      noteId,
      bytes: totalBytes,
      mime,
      transcriptChars: transcript.length,
      parts: parts.length,
      notes: finalNote,
    });
  } catch (e: any) {
    console.error("[ai-note/process] error:", e?.message || e);
    return bad("INTERNAL_ERROR", 500, e?.message || "Internal error");
  }
}