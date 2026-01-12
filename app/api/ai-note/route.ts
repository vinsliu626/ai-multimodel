// app/api/ai-note/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { runAiNotePipeline } from "@/lib/aiNote/pipeline";
import { transcribeAudioToText } from "@/lib/asr/transcribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JsonBodySchema = z.object({
  inputType: z.literal("text"),
  text: z.string().optional(),
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

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";

    // ---------- JSON: text ----------
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => null);
      const parsed = JsonBodySchema.safeParse(body);
      if (!parsed.success) return bad("Invalid JSON payload");

      const text = (parsed.data.text || "").trim();
      if (!text) return bad("Missing text");

      const note = await runAiNotePipeline(text);
      return ok({ note });
    }

    // ---------- multipart: upload / record ----------
    if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();

      const inputType = getStringFormValue(fd, "inputType"); // upload | record
      const file = fd.get("file");

      if (!inputType) return bad("Missing inputType in form-data");
      if (!(file instanceof File)) return bad("Missing file in form-data");

      // ✅ 防炸：限制 25MB（你可以调大/调小）
      const MAX_BYTES = 25 * 1024 * 1024;
      if (file.size > MAX_BYTES) {
        return bad("Audio file too large. Please keep it under 25MB.", 413);
      }

      const transcript = await transcribeAudioToText(file);
      if (!transcript.trim()) return bad("ASR returned empty transcript.", 500);

      const note = await runAiNotePipeline(transcript);

      return ok({
        note,
        transcriptChars: transcript.length,
        fileName: file.name,
        fileType: file.type || "",
        inputType,
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
