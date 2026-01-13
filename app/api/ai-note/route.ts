// app/api/ai-note/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth"; // 路径按你项目改

import { assertQuotaOrThrow, QuotaError } from "@/lib/billing/guard";
import { addUsageEvent } from "@/lib/billing/usage";

import { runAiNotePipeline } from "@/lib/aiNote/pipeline";
import { transcribeAudioToText } from "@/lib/asr/transcribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JsonBodySchema = z.object({
  inputType: z.literal("text"),
  text: z.string().optional(),
  // ✅ 允许前端传音频时长（秒），文本模式也可以传
  durationSec: z.number().int().positive().optional(),
});

function ok(data: any) {
  return NextResponse.json({ ok: true, ...data });
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function getStringFormValue(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function getIntFormValue(fd: FormData, key: string) {
  const v = fd.get(key);
  const n = typeof v === "string" ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : null;
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ✅ 用文本粗略估算语音时长（150 wpm ≈ 2.5 words/sec）
function estimateSecondsByTranscript(transcript: string) {
  const w = countWords(transcript);
  return Math.max(1, Math.round(w / 2.5));
}

export async function POST(req: Request) {
  try {
    // ✅ 必须登录（你要求：不登录不能用除聊天外的功能）
    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return bad("AUTH_REQUIRED", 401);

    const contentType = req.headers.get("content-type") || "";

    // ---------- JSON: text ----------
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => null);
      const parsed = JsonBodySchema.safeParse(body);
      if (!parsed.success) return bad("Invalid JSON payload");

      const text = (parsed.data.text || "").trim();
      if (!text) return bad("Missing text");

      // ✅ 配额：note_seconds
      const seconds = parsed.data.durationSec ?? estimateSecondsByTranscript(text);
      try {
        await assertQuotaOrThrow({ userId, action: "note", amount: seconds });
      } catch (e) {
        if (e instanceof QuotaError) {
          return NextResponse.json({ ok: false, error: e.code, message: e.message }, { status: 429 });
        }
        throw e;
      }

      const note = await runAiNotePipeline(text);

      await addUsageEvent(userId, "note_seconds", seconds).catch((err) =>
        console.error("[ai-note] usageEvent write failed:", err)
      );

      return ok({ note, secondsBilled: seconds, inputType: "text" });
    }

    // ---------- multipart: upload / record ----------
    if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();

      const inputType = getStringFormValue(fd, "inputType"); // upload | record
      const file = fd.get("file");

      if (!inputType) return bad("Missing inputType in form-data");
      if (!(file instanceof File)) return bad("Missing file in form-data");

      // ✅ 防炸：限制 25MB
      const MAX_BYTES = 25 * 1024 * 1024;
      if (file.size > MAX_BYTES) return bad("Audio file too large. Please keep it under 25MB.", 413);

      // ✅ 推荐：前端传 durationSec（秒）
      const durationSec = getIntFormValue(fd, "durationSec");

      // 1) ASR
      const transcript = await transcribeAudioToText(file);
      if (!transcript.trim()) return bad("ASR returned empty transcript.", 500);

      // 2) 配额检查（用 durationSec 优先，否则用 transcript 估算）
      const seconds = durationSec ?? estimateSecondsByTranscript(transcript);
      try {
        await assertQuotaOrThrow({ userId, action: "note", amount: seconds });
      } catch (e) {
        if (e instanceof QuotaError) {
          return NextResponse.json({ ok: false, error: e.code, message: e.message }, { status: 429 });
        }
        throw e;
      }

      // 3) Note pipeline
      const note = await runAiNotePipeline(transcript);

      // ✅ 成功后记用量
      await addUsageEvent(userId, "note_seconds", seconds).catch((err) =>
        console.error("[ai-note] usageEvent write failed:", err)
      );

      return ok({
        note,
        secondsBilled: seconds,
        transcriptChars: transcript.length,
        fileName: file.name,
        fileType: file.type || "",
        inputType,
        durationSec: durationSec ?? null,
      });
    }

    return bad("Unsupported Content-Type");
  } catch (e: any) {
    console.error("[ai-note] error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Internal error" }, { status: 500 });
  }
}
