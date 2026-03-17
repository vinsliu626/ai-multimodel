const MARKER_PREFIXES = ["⭐", "📌", "⚡", "🧪", "⚠️"] as const;

export type MarkerKind = "important" | "concept" | "tip" | "example" | "warning" | "plain";

function normalizeLabelLine(trimmed: string) {
  const labeledImportant = trimmed.match(/^(?:important|key idea|key insight)\s*[:：]\s*(.+)$/i);
  if (labeledImportant?.[1]) return `⭐ Important: ${labeledImportant[1].trim()}`;

  const labeledConcept = trimmed.match(/^(?:concept|definition)\s*[:：]\s*(.+)$/i);
  if (labeledConcept?.[1]) return `📌 Concept: ${labeledConcept[1].trim()}`;

  const labeledTip = trimmed.match(/^(?:tip|takeaway|memory hook|action step)\s*[:：]\s*(.+)$/i);
  if (labeledTip?.[1]) return `⚡ Tip: ${labeledTip[1].trim()}`;

  const labeledExample = trimmed.match(/^(?:example|sample|case)\s*[:：]\s*(.+)$/i);
  if (labeledExample?.[1]) return `🧪 Example: ${labeledExample[1].trim()}`;

  const labeledWarning = trimmed.match(/^(?:warning|caution|common confusion|watch out)\s*[:：]\s*(.+)$/i);
  if (labeledWarning?.[1]) return `⚠️ Warning: ${labeledWarning[1].trim()}`;

  return trimmed;
}

export function normalizeAiText(text: string) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => normalizeLabelLine(line.trimEnd()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function detectAiMarker(line: string): { kind: MarkerKind; text: string } {
  const trimmed = line.trim();
  if (!trimmed) return { kind: "plain", text: "" };
  if (trimmed.startsWith(MARKER_PREFIXES[0])) return { kind: "important", text: trimmed };
  if (trimmed.startsWith(MARKER_PREFIXES[1])) return { kind: "concept", text: trimmed };
  if (trimmed.startsWith(MARKER_PREFIXES[2])) return { kind: "tip", text: trimmed };
  if (trimmed.startsWith(MARKER_PREFIXES[3])) return { kind: "example", text: trimmed };
  if (trimmed.startsWith(MARKER_PREFIXES[4])) return { kind: "warning", text: trimmed };
  return { kind: "plain", text: trimmed };
}
