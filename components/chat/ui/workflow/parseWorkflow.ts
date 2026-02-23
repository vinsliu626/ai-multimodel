import type { Stage, WorkflowMessage } from "./types";
import { uid } from "./types";

export function tryParseWorkflowReply(reply: string): WorkflowMessage[] | null {
  if (!reply) return null;
  const t = reply.trim();
  if (!(t.startsWith("{") || t.startsWith("["))) return null;

  try {
    const obj: any = JSON.parse(t);

    // 1) { steps: [{stage,title,subtitle,content}, ...] }
    if (obj && Array.isArray(obj.steps)) {
      const steps = obj.steps
        .map((s: any) => {
          const stage: Stage = (String(s.stage || "assistant").toLowerCase() as Stage) || "assistant";
          const content = typeof s.content === "string" ? s.content : "";
          if (!content) return null;
          return {
            id: uid(),
            stage,
            title: s.title,
            subtitle: s.subtitle,
            content,
          } satisfies WorkflowMessage;
        })
        .filter(Boolean) as WorkflowMessage[];

      return steps.length ? steps : null;
    }

    // 2) { outline, draft, review, final }
    if (obj && (obj.outline || obj.draft || obj.review || obj.final)) {
      const arr: WorkflowMessage[] = [];
      if (obj.outline) arr.push({ id: uid(), stage: "planner", title: "Planner", subtitle: "Outline", content: String(obj.outline) });
      if (obj.draft) arr.push({ id: uid(), stage: "writer", title: "Writer", subtitle: "Draft", content: String(obj.draft) });
      if (obj.review) {
        const reviewText = Array.isArray(obj.review) ? obj.review.map(String).join("\n") : String(obj.review);
        arr.push({ id: uid(), stage: "reviewer", title: "Reviewer", subtitle: "Review", content: reviewText });
      }
      if (obj.final) arr.push({ id: uid(), stage: "final", title: obj.title || "Final", subtitle: "Final", content: String(obj.final) });
      return arr.length ? arr : null;
    }

    return null;
  } catch {
    return null;
  }
}
