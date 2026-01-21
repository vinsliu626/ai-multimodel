// lib/asr/transcribe.ts
import "server-only";

type BinaryLike = ArrayBuffer | Uint8Array; // ✅ 删掉 Buffer 类型，避免客户端/类型炸（Buffer 也属于 Uint8Array）

function resolveAsrUrl(base: string) {
  const b = base.trim();
  if (!b) throw new Error("Missing ASR_URL env. Set ASR_URL in env vars.");
  return b.endsWith("/") ? `${b}transcribe` : `${b}/transcribe`;
}

function guessExt(mime?: string, fallback = "webm") {
  const m = (mime || "").toLowerCase();
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "mp4";
  if (m.includes("webm")) return "webm";
  return fallback;
}

// ✅ BlobLike 检测：不要用 instanceof Blob（不同实现可能不等）
function isBlobLike(x: any): x is Blob {
  return !!x && typeof x === "object" && typeof x.arrayBuffer === "function" && typeof x.stream === "function";
}

function ensureBlob(input: any, mime = "audio/webm"): Blob {
  if (typeof Blob === "undefined") {
    throw new Error("Blob is not available in this runtime. Ensure runtime=nodejs, not edge.");
  }

  // Blob / File
  if (isBlobLike(input)) return input as Blob;

  // Uint8Array（Buffer 在 Node 里也是 Uint8Array 子类，所以也能进来）
    // Uint8Array（Buffer 在 Node 里也是 Uint8Array 子类，所以也能进来）
  // Uint8Array（Buffer 在 Node 里也是 Uint8Array 子类，所以也能进来）
  if (input instanceof Uint8Array) {
    // ✅ 强制拷贝到“真正的 ArrayBuffer”，避免 SharedArrayBuffer / ArrayBufferLike 类型冲突
    const ab = new ArrayBuffer(input.byteLength);
    new Uint8Array(ab).set(input);
    return new Blob([ab], { type: mime });
  }



  // ArrayBuffer
  if (input instanceof ArrayBuffer) {
    return new Blob([new Uint8Array(input)], { type: mime });
  }

  // Prisma Bytes 有时是 { type:'Buffer', data:[...] }
  if (input && typeof input === "object" && input.type === "Buffer" && Array.isArray(input.data)) {
    return new Blob([new Uint8Array(input.data)], { type: mime });
  }

  throw new Error(
    `transcribeAudioToText: unsupported input type. ` +
      `typeof=${typeof input}, ctor=${input?.constructor?.name}, ` +
      `keys=${input ? Object.keys(input).slice(0, 20).join(",") : ""}`
  );
}

export async function transcribeAudioToText(
  input: Blob | BinaryLike,
  opts?: {
    filename?: string;
    mime?: string;
    language?: string;
    task?: "transcribe" | "translate";
    vad_filter?: boolean;
    beam_size?: number;
  }
): Promise<string> {
  const base = process.env.ASR_URL?.trim();
  if (!base) throw new Error("Missing ASR_URL env. Set ASR_URL in env vars.");

  const url = resolveAsrUrl(base);

  const mime =
    opts?.mime ||
    (isBlobLike(input) ? (input as any).type : "") ||
    "audio/webm";

  const ext = guessExt(mime, "webm");
  const filename = opts?.filename || `audio.${ext}`;

  const blob = ensureBlob(input, mime);

  const fd = new FormData();
  fd.append("file", blob, filename);

  if (opts?.language) fd.append("language", opts.language);
  if (opts?.task) fd.append("task", opts.task);
  if (typeof opts?.vad_filter === "boolean") fd.append("vad_filter", String(opts.vad_filter));
  if (typeof opts?.beam_size === "number") fd.append("beam_size", String(opts.beam_size));

  let res: Response;
  try {
    res = await fetch(url, { method: "POST", body: fd });
  } catch (e: any) {
    throw new Error(`ASR network error: ${e?.message || String(e)} url=${url}`);
  }

  const raw = await res.text();

  if (!res.ok) {
    throw new Error(`ASR HTTP error: ${res.status} ${res.statusText}. url=${url} body=${raw.slice(0, 1200)}`);
  }

  let json: any = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {}

  return String(json?.text || json?.transcript || raw || "").trim();
}
