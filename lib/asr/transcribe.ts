function env(name: string) {
  return (process.env[name] || "").trim();
}

/**
 * 完全免费（本地）路线：
 * - 你已经在本地跑了 faster-whisper FastAPI 服务
 * - 默认 endpoint: http://127.0.0.1:9000/transcribe
 *
 * 如需自定义，再在 .env.local 设置：
 *   ASR_ENDPOINT=http://127.0.0.1:9000/transcribe
 *   ASR_API_KEY=xxx   (可选)
 */
export async function transcribeAudioToText(file: File): Promise<string> {
  const endpoint = env("ASR_ENDPOINT") || "http://127.0.0.1:9000/transcribe";
  const apiKey = env("ASR_API_KEY");

  const fd = new FormData();
  fd.append("file", file, file.name);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    body: fd,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || `ASR error (${res.status})`);
  }

  const text = String(data?.text || data?.transcript || "").trim();
  if (!text) throw new Error("ASR returned empty transcript.");
  return text;
}
