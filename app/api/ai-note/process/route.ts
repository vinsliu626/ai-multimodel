import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { devBypassUserId } from "@/lib/auth/devBypass";

import { callGroqTranscribe, callGroqChat } from "@/lib/ai/groq";
import { callOpenRouterChat, shouldFallback, type ChatMessage } from "@/lib/ai/openrouter";
import { parseEnvInt } from "@/lib/env/number";
import { buildLegacyFinalWriterPrompt, buildLegacyPartSummarizerPrompt } from "@/lib/aiNote/prompts";

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

function asErrorInfo(error: unknown) {
  if (!error || typeof error !== "object") return {};
  const value = error as { code?: unknown; message?: unknown; extra?: unknown; httpStatus?: unknown };
  return {
    code: value.code,
    message: value.message,
    extra: value.extra,
    httpStatus: value.httpStatus,
  };
}

function bad(code: ApiErr, status = 400, message?: string, extra?: unknown) {
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
  if (opts.openrouterKey) {
    for (const mid of opts.openrouterCandidates) {
      try {
        const r = await callOpenRouterChat({
          apiKey: opts.openrouterKey,
          modelId: mid,
          messages: opts.messages,
        });
        return { provider: "openrouter" as const, model: r.modelUsed, content: r.content };
      } catch (e: unknown) {
        const info = asErrorInfo(e);
        console.warn("[ai-note] openrouter failed:", mid, info.code || info.message, info.httpStatus);
        if (!shouldFallback(e)) throw e;
      }
    }
  }

  const g = await callGroqChat({
    apiKey: opts.groqKey,
    modelId: opts.groqModel,
    messages: opts.messages,
  });

  return { provider: "groq" as const, model: g.modelUsed, content: g.content };
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = ((session as { user?: { id?: string } } | null)?.user?.id as string | undefined) ?? devBypassUserId();
    if (!userId) return bad("AUTH_REQUIRED", 401);

    const body = (await req.json().catch(() => null)) as null | { noteId?: string; lang?: "zh" | "en" };
    const noteId = String(body?.noteId || "").trim();
    if (!noteId) return bad("MISSING_NOTE_ID", 400);

    const isZh = body?.lang === "zh";
    const language = isZh ? "zh" : "en";
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return bad("MISSING_KEYS", 500, "Missing GROQ_API_KEY");
    const openrouterKey = process.env.OPENROUTER_API_KEY || undefined;

    const note = await prisma.aiNoteSession.findUnique({
      where: { id: noteId },
      select: { userId: true },
    });

    if (!note) return bad("NO_CHUNKS", 404, "Note session not found (upload chunks first).");
    if (note.userId !== userId) return bad("FORBIDDEN", 403);

    const chunks = await prisma.aiNoteChunk.findMany({
      where: { noteId },
      orderBy: { chunkIndex: "asc" },
      select: { chunkIndex: true, mime: true, data: true, size: true },
    });

    if (!chunks.length) return bad("NO_CHUNKS", 400, "No chunks uploaded yet.");

    const mime = chunks.find((c) => c.mime)?.mime || "audio/webm";
    const totalBytes = chunks.reduce((a, c) => a + (c.size || 0), 0);
    const buffers = chunks.map((c) => Buffer.from(c.data as Uint8Array));
    const audio = Buffer.concat(buffers);

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
    } catch (e: unknown) {
      const info = asErrorInfo(e);
      console.error("[ai-note] ASR failed:", info.code || info.message, info.extra);
      return bad("ASR_FAILED", 502, "ASR failed", { code: info.code, message: info.message, extra: info.extra });
    }

    const partChars = parseEnvInt("AI_NOTE_TRANSCRIPT_CHARS_PER_PART", 6000);
    const parts = splitByChars(transcript, partChars);

    const partNotes: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const msgs: ChatMessage[] = [
        { role: "system", content: buildLegacyPartSummarizerPrompt(language) },
        {
          role: "user",
          content: isZh
            ? `这是第 ${i + 1}/${parts.length} 段转写内容。请提炼出后续可以合成为高质量学习笔记的内容。\n\n${part}`
            : `This is transcript part ${i + 1}/${parts.length}. Extract the material that should survive into a high-quality study note document.\n\n${part}`,
        },
      ];

      const out = await llmWithFallback({
        messages: msgs,
        openrouterKey,
        openrouterCandidates: [
          "liquid/lfm-2.5-1.2b-instruct:free",
          "google/gemma-3n-e4b-it:free",
          "google/gemma-3n-e2b-it:free",
          "arcee-ai/trinity-large-preview:free",
          "google/gemma-3-4b-it:free",
          "google/gemma-3-27b-it:free",
          "openrouter/free",
        ],
        groqKey,
        groqModel: "llama-3.1-8b-instant",
      });

      partNotes.push(out.content);
    }

    const finalMsgs: ChatMessage[] = [
      { role: "system", content: buildLegacyFinalWriterPrompt(language) },
      {
        role: "user",
        content:
          (isZh ? "请将以下分段笔记整合为一份最终高质量笔记文档。\n\n[分段笔记]\n" : "Merge the staged notes below into one final high-quality note document.\n\n[Segment notes]\n") +
          partNotes.map((t, idx) => `--- Part ${idx + 1}/${partNotes.length} ---\n${t}`).join("\n\n"),
      },
    ];

    let finalNote = "";
    try {
      const out = await llmWithFallback({
        messages: finalMsgs,
        openrouterKey,
        openrouterCandidates: [
          "google/gemma-3-27b-it:free",
          "arcee-ai/trinity-large-preview:free",
          "google/gemma-3-12b-it:free",
          "openrouter/free",
        ],
        groqKey,
        groqModel: "llama-3.3-70b-versatile",
      });
      finalNote = out.content;
    } catch (e: unknown) {
      const info = asErrorInfo(e);
      console.error("[ai-note] LLM final failed:", info.code || info.message, info.extra);
      return bad("LLM_FAILED", 502, "LLM failed", { code: info.code, message: info.message, extra: info.extra });
    }

    await prisma.aiNoteSession.update({
      where: { id: noteId },
      data: {
        transcript,
        notes: finalNote,
        bytes: totalBytes,
        mime,
      } as { transcript: string; notes: string; bytes: number; mime: string },
    });

    return NextResponse.json({
      ok: true,
      noteId,
      bytes: totalBytes,
      transcriptChars: transcript.length,
      parts: parts.length,
      notes: finalNote,
    });
  } catch (e: unknown) {
    const info = asErrorInfo(e);
    console.error("[/api/ai-note/process] fatal:", info.code || info.message, info.extra);
    return bad("INTERNAL_ERROR", 500, typeof info.message === "string" ? info.message : "Internal error");
  }
}
