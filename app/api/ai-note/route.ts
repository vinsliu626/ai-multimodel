// app/api/ai-note/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { runAiNotePipeline } from "@/lib/aiNote/pipeline";
import { getYoutubeTranscriptText } from "@/lib/youtube/transcript";
import { transcribeAudioToText } from "@/lib/asr/transcribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JsonBodySchema = z.object({
  inputType: z.enum(["text", "youtube"]),
  text: z.string().optional(),
  youtubeUrl: z.string().optional(),
});

function ok(data: any) {
  return NextResponse.json({ ok: true, ...data });
}
function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function getStringFormValue(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";

    // ---------- JSON: text / youtube ----------
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => null);
      const parsed = JsonBodySchema.safeParse(body);
      if (!parsed.success) return bad("Invalid JSON payload");

      if (parsed.data.inputType === "text") {
        const text = (parsed.data.text || "").trim();
        if (!text) return bad("Missing text");
        const note = await runAiNotePipeline(text);
        return ok({ note });
      }

      // youtube
      const url = (parsed.data.youtubeUrl || "").trim();
      if (!url) return bad("Missing youtubeUrl");

      const transcript = await getYoutubeTranscriptText(url);
      if (!transcript.trim()) {
        // 这里先不自动转 ASR（因为需要下载 YouTube 音频，涉及额外实现与合规/部署问题）
        return bad("No transcript found for this YouTube video.");
      }

      const note = await runAiNotePipeline(transcript);
      return ok({ note, transcriptChars: transcript.length });
    }

    // ---------- multipart: upload / record ----------
    // NoteUI 会用 FormData 发：inputType=upload/record + model=... + file=...
    if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();

      const inputType = getStringFormValue(fd, "inputType"); // "upload" | "record"
      const file = fd.get("file");

      if (!inputType) return bad("Missing inputType in form-data");
      if (!(file instanceof File)) return bad("Missing file in form-data");

      // ✅ 统一：所有音频都先走 ASR，再走笔记流水线
      const transcript = await transcribeAudioToText(file);
      if (!transcript.trim()) return bad("ASR returned empty transcript.");

      const note = await runAiNotePipeline(transcript);
      return ok({
        note,
        transcriptChars: transcript.length,
        fileName: file.name,
        fileType: file.type || "",
      });
    }

    return bad("Unsupported Content-Type");
  } catch (e: any) {
    console.error("[ai-note] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Internal error" },
      { status: 500 }
    );
  }
}
