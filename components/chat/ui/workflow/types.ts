export type ChatMode = "workflow" | "normal" | "detector" | "note";
export type Lang = "zh" | "en";

export type Stage = "user" | "planner" | "writer" | "reviewer" | "final" | "assistant";

export type WorkflowMessage = {
  id: string;
  stage: Stage;
  title?: string;
  subtitle?: string;
  content: string;

  // ✅ only for final (or any group)
  children?: WorkflowMessage[];
  collapsed?: boolean; // default true
};

export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
