// lib/aiNote/sessionStore.ts

export type NoteSession = {
  userId: string;
  createdAt: number;
  transcripts: Map<number, string>; // chunkIndex -> transcript
};

const g = globalThis as any;

// ✅ 全局唯一 store：避免 dev 热更新 / 重复导入导致 sessions 丢失
if (!g.__aiNoteSessions) g.__aiNoteSessions = new Map<string, NoteSession>();
const sessions: Map<string, NoteSession> = g.__aiNoteSessions;

// ✅ 简单 TTL：超过这个时间还没 finalize，就当作过期（可按需调）
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [noteId, s] of sessions.entries()) {
    if (now - s.createdAt > SESSION_TTL_MS) {
      sessions.delete(noteId);
    }
  }
}

export function createNoteSession(noteId: string, userId: string) {
  cleanupExpiredSessions();

  sessions.set(noteId, {
    userId,
    createdAt: Date.now(),
    transcripts: new Map(),
  });

  return sessions.get(noteId)!;
}

export function getNoteSession(noteId: string) {
  cleanupExpiredSessions();
  return sessions.get(noteId);
}

export function saveChunkTranscript(noteId: string, chunkIndex: number, transcript: string) {
  cleanupExpiredSessions();

  const s = sessions.get(noteId);
  if (!s) throw new Error("SESSION_NOT_FOUND");

  s.transcripts.set(chunkIndex, transcript);
  return true;
}

export function buildFullTranscript(noteId: string) {
  cleanupExpiredSessions();

  const s = sessions.get(noteId);
  if (!s) throw new Error("SESSION_NOT_FOUND");

  const entries = [...s.transcripts.entries()].sort((a, b) => a[0] - b[0]);
  return entries.map(([, t]) => t).join("\n");
}

export function deleteSession(noteId: string) {
  sessions.delete(noteId);
}
