export type NoteInputMode = "text" | "audio";

export type NoteResult = {
  ok: true;
  title?: string;
  summary: string;
  bullets?: string[];
  actionItems?: string[];
};

export type NoteError = {
  ok: false;
  error: string;
};