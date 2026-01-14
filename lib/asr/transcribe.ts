// lib/asr/transcribe.ts
export async function transcribeAudioToText(file: File): Promise<string> {
  const base = process.env.ASR_URL?.trim();
  if (!base) {
    throw Object.assign(new Error("Missing ASR_URL env. Set ASR_URL in Vercel env vars."), {
      code: "MISSING_ASR_URL",
    });
  }

  // ✅ 统一拼接，避免 ASR_URL 末尾带不带 / 导致路径错
  const url = base.endsWith("/") ? `${base}transcribe` : `${base}/transcribe`;

  // 这里用 FormData 传文件（最通用）
  const fd = new FormData();
  fd.append("file", file, file.name || "audio.webm");

  let res: Response;
  try {
    res = await fetch(url, { method: "POST", body: fd });
  } catch (e: any) {
    throw new Error(`ASR network error: ${e?.message || String(e)}`);
  }

  const raw = await res.text();
  if (!res.ok) {
    // ✅ 把 raw 带上，方便你看 ASR 真实返回
    throw new Error(`ASR HTTP error: ${res.status} ${res.statusText}. body=${raw?.slice(0, 300)}`);
  }

  // ✅ 兼容 JSON 返回
  let json: any = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {}

  // 你可以让 ASR 返回：{ text: "..." } 或 { transcript: "..." }
  const text = (json?.text || json?.transcript || raw || "").trim();
  return text;
}
