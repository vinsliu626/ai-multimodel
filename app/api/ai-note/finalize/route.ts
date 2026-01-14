// app/api/ai-note/finalize/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getNoteSession, buildFullTranscript, deleteSession } from "@/lib/aiNote/sessionStore";
import { assertQuotaOrThrow, QuotaError } from "@/lib/billing/guard";
import { addUsageEvent } from "@/lib/billing/usage";
import { runAiNotePipeline } from "@/lib/aiNote/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
function estimateSecondsByTranscript(transcript: string) {
  const w = countWords(transcript);
  return Math.max(1, Math.round(w / 2.5));
}

// 简单字符切块（先跑通；后续可改 token 切块）
function chunkText(text: string, maxChars = 12000, overlap = 800) {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(text.length, i + maxChars);
    chunks.push(text.slice(i, end));
    i = end - overlap;
    if (i < 0) i = 0;
  }
  return chunks;
}

async function runAiNotePipelineChunked(transcript: string) {
  const chunks = chunkText(transcript);

  const partials: string[] = [];
  for (let idx = 0; idx < chunks.length; idx++) {
    const c = chunks[idx];
    const part = await runAiNotePipeline(
      `你是会议纪要助手。以下是第 ${idx + 1}/${chunks.length} 段转写，请输出：
- 要点（bullet）
- 决策
- 行动项（含负责人/截止时间如有）
- 问题与待确认事项
正文：
${c}`
    );
    partials.push(part);
  }

  const merged = partials.join("\n\n---\n\n");
  const final = await runAiNotePipeline(
    `下面是多段摘要，请合并去重、按主题重排，生成最终笔记（含目录、要点、行动项清单、风险/待确认）：
${merged}`
  );
  return final;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return bad("AUTH_REQUIRED", 401);

    const body = await req.json().catch(() => null);
    const noteId = String(body?.noteId || "").trim();
    if (!noteId) return bad("MISSING_NOTE_ID");

    console.log("[ai-note/finalize] pid=", process.pid, "noteId=", noteId);

    const s = getNoteSession(noteId);
    if (!s) return bad("SESSION_NOT_FOUND", 404);
    if (s.userId !== userId) return bad("FORBIDDEN", 403);

    let transcript = "";
    try {
      transcript = buildFullTranscript(noteId);
    } catch {
      return bad("SESSION_NOT_FOUND", 404);
    }

    if (!transcript.trim()) return bad("EMPTY_TRANSCRIPT", 400);

    // 配额：按转写估算秒数（或你也可以在 chunk 上传时累计 duration）
    const seconds = estimateSecondsByTranscript(transcript);
    try {
      await assertQuotaOrThrow({ userId, action: "note", amount: seconds });
    } catch (e) {
      if (e instanceof QuotaError) {
        return NextResponse.json({ ok: false, error: e.code, message: e.message }, { status: 429 });
      }
      throw e;
    }

    // 关键：长文本走 chunked pipeline，避免 payload/token 过大
    const note =
      transcript.length > 30_000
        ? await runAiNotePipelineChunked(transcript)
        : await runAiNotePipeline(transcript);

    await addUsageEvent(userId, "note_seconds", seconds).catch(() => {});
    deleteSession(noteId);

    return NextResponse.json({ ok: true, note, secondsBilled: seconds, transcriptChars: transcript.length });
  } catch (e: any) {
    console.error("[ai-note/finalize] error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Internal error" }, { status: 500 });
  }
}
