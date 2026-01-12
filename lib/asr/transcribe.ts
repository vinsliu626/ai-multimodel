// lib/asr/transcribe.ts
export async function transcribeAudioToText(file: File): Promise<string> {
  const base = process.env.ASR_URL;
  if (!base) {
    throw new Error("Missing ASR_URL env. Set ASR_URL in Vercel env vars.");
  }

  // 统一拼出 endpoint
  const endpoint = `${base.replace(/\/$/, "")}/transcribe`;

  const fd = new FormData();
  fd.append("file", file, file.name || "audio");

  const headers: Record<string, string> = {};
  // 如果 Space 私有：在 Vercel 设置 HF_TOKEN
  if (process.env.HF_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.HF_TOKEN}`;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: fd,
    cache: "no-store",
  });

  const data: any = await res.json().catch(() => ({}));

  // 先看 HTTP，再看 ok 字段
  if (!res.ok) {
    const msg =
      data?.error ||
      data?.detail ||
      `ASR HTTP error: ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  if (data?.ok === false) {
    throw new Error(data?.error || "ASR returned ok=false");
  }

  const text = String(data?.text ?? data?.transcript ?? data?.result ?? "").trim();
  if (!text) throw new Error("ASR returned empty transcript.");
  return text;
}
