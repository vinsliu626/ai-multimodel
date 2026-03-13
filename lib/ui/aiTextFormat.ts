const MARKER_PREFIXES = ["⭐", "📘", "⚡", "🧪", "⚠️"] as const;

const HEADING_LABELS = new Set([
  "tl;dr",
  "key points",
  "key point",
  "action items",
  "action item",
  "review checklist",
  "self-quiz",
  "quick quiz",
  "outline",
  "outline & notes",
  "key terms",
  "summary",
  "important",
  "warning",
  "example",
  "concept",
]);

function normalizeMarkerLine(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return "";

  if (MARKER_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
    return trimmed;
  }

  const markdownHeading = trimmed.match(/^(?:\*{3,}\s*|#{1,6}\s*)(.+)$/);
  if (markdownHeading?.[1]) {
    return `⭐ ${markdownHeading[1].trim()}`;
  }

  const bullet = trimmed.match(/^(?:[-*•–—]\s+)(.+)$/);
  if (bullet?.[1]) {
    return `⚡ Tip: ${bullet[1].trim()}`;
  }

  const labeledImportant = trimmed.match(/^(?:\p{Extended_Pictographic}\s*)?(?:key idea|key insight|important)\s*[:：-]\s*(.+)$/iu);
  if (labeledImportant?.[1]) {
    return `⭐ Important: ${labeledImportant[1].trim()}`;
  }

  const labeledConcept = trimmed.match(/^(?:\p{Extended_Pictographic}\s*)?(?:concept|definition)\s*[:：-]\s*(.+)$/iu);
  if (labeledConcept?.[1]) {
    return `📘 Concept: ${labeledConcept[1].trim()}`;
  }

  const labeledTip = trimmed.match(/^(?:\p{Extended_Pictographic}\s*)?(?:tip|takeaway|action step)\s*[:：-]\s*(.+)$/iu);
  if (labeledTip?.[1]) {
    return `⚡ Tip: ${labeledTip[1].trim()}`;
  }

  const labeledExample = trimmed.match(/^(?:\p{Extended_Pictographic}\s*)?(?:example|sample|case)\s*[:：-]\s*(.+)$/iu);
  if (labeledExample?.[1]) {
    return `🧪 Example: ${labeledExample[1].trim()}`;
  }

  const labeledWarning = trimmed.match(/^(?:\p{Extended_Pictographic}\s*)?(?:warning|caution|critical)\s*[:：-]\s*(.+)$/iu);
  if (labeledWarning?.[1]) {
    return `⚠️ Warning: ${labeledWarning[1].trim()}`;
  }

  const important = trimmed.match(/^(?:important|key idea|key insight|key takeaway)\s*[:：-]?\s*(.*)$/i);
  if (important) {
    return important[1] ? `⭐ Important: ${important[1].trim()}` : "⭐ Important";
  }

  const concept = trimmed.match(/^(?:concept|definition)\s*[:：-]?\s*(.*)$/i);
  if (concept) {
    return concept[1] ? `📘 Concept: ${concept[1].trim()}` : "📘 Concept";
  }

  const tip = trimmed.match(/^(?:tip|takeaway|step|action)\s*[:：-]?\s*(.*)$/i);
  if (tip) {
    return tip[1] ? `⚡ Tip: ${tip[1].trim()}` : "⚡ Tip";
  }

  const example = trimmed.match(/^(?:example|sample|case)\s*[:：-]?\s*(.*)$/i);
  if (example) {
    return example[1] ? `🧪 Example: ${example[1].trim()}` : "🧪 Example";
  }

  const warning = trimmed.match(/^(?:warning|caution|critical|watch out)\s*[:：-]?\s*(.*)$/i);
  if (warning) {
    return warning[1] ? `⚠️ Warning: ${warning[1].trim()}` : "⚠️ Warning";
  }

  if (HEADING_LABELS.has(trimmed.toLowerCase())) {
    return `⭐ ${trimmed}`;
  }

  return trimmed;
}

export function normalizeAiText(text: string) {
  const rewritten = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\b(?:one key idea is|the key idea is|key idea:)\b/gi, "\n\n⭐ Important: ")
    .replace(/\b(?:a central concept is|the concept is|concept:)\b/gi, "\n\n📘 Concept: ")
    .replace(/\b(?:a useful tip is|tip:|takeaway:|action step:)\b/gi, "\n\n⚡ Tip: ")
    .replace(/\b(?:an example is|example:|for example,)\b/gi, "\n\n🧪 Example: ")
    .replace(/\b(?:warning:|caution:|critical note:)\b/gi, "\n\n⚠️ Warning: ");

  const normalized = rewritten
    .split("\n")
    .map(normalizeMarkerLine)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized;
}

export type MarkerKind = "important" | "concept" | "tip" | "example" | "warning" | "plain";

export function detectAiMarker(line: string): { kind: MarkerKind; text: string } {
  const trimmed = line.trim();
  if (!trimmed) return { kind: "plain", text: "" };
  if (trimmed.startsWith("⭐")) return { kind: "important", text: trimmed };
  if (trimmed.startsWith("📘")) return { kind: "concept", text: trimmed };
  if (trimmed.startsWith("⚡")) return { kind: "tip", text: trimmed };
  if (trimmed.startsWith("🧪")) return { kind: "example", text: trimmed };
  if (trimmed.startsWith("⚠️")) return { kind: "warning", text: trimmed };
  return { kind: "plain", text: trimmed };
}
