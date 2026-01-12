import { YoutubeTranscript } from "youtube-transcript";

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    // youtu.be/<id>
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id || null;
    }
    // youtube.com/watch?v=<id>
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    // youtube.com/shorts/<id>
    const parts = u.pathname.split("/").filter(Boolean);
    const shortsIndex = parts.indexOf("shorts");
    if (shortsIndex >= 0 && parts[shortsIndex + 1]) return parts[shortsIndex + 1];
    return null;
  } catch {
    return null;
  }
}

export async function getYoutubeTranscriptText(youtubeUrl: string): Promise<string> {
  const id = extractVideoId(youtubeUrl);
  if (!id) throw new Error("Invalid YouTube URL");

  // youtube-transcript 会尝试抓字幕（包括自动字幕，取决于视频是否开放）
  const items = await YoutubeTranscript.fetchTranscript(id).catch(() => []);
  if (!items || items.length === 0) return "";

  // 拼成一段干净文本
  const text = items
    .map((x) => (x.text || "").trim())
    .filter(Boolean)
    .join(" ");

  return text.trim();
}
