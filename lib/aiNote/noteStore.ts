// lib/aiNote/noteStore.ts
import fs from "node:fs/promises";
import path from "node:path";

export type NoteChunkMeta = {
  chunkIndex: number;
  filePath: string;      // 本地磁盘路径（dev）；生产可换成 url/key
  size: number;
  mime: string;
  createdAt: number;
};

export type NoteMeta = {
  noteId: string;
  userId: string;
  createdAt: number;
  chunks: NoteChunkMeta[];
};

const ROOT = process.env.AI_NOTE_TMP_DIR || path.join(process.cwd(), ".tmp", "ai-note");
const META_DIR = path.join(ROOT, "meta");

async function ensureDirs() {
  await fs.mkdir(META_DIR, { recursive: true });
  await fs.mkdir(ROOT, { recursive: true });
}

function metaFile(noteId: string) {
  return path.join(META_DIR, `${noteId}.json`);
}

export async function createNote(noteId: string, userId: string) {
  await ensureDirs();
  const meta: NoteMeta = { noteId, userId, createdAt: Date.now(), chunks: [] };
  await fs.writeFile(metaFile(noteId), JSON.stringify(meta, null, 2), "utf-8");
  return meta;
}

export async function getNote(noteId: string): Promise<NoteMeta | null> {
  try {
    await ensureDirs();
    const raw = await fs.readFile(metaFile(noteId), "utf-8");
    return JSON.parse(raw) as NoteMeta;
  } catch {
    return null;
  }
}

export async function addChunk(noteId: string, chunk: NoteChunkMeta) {
  const meta = await getNote(noteId);
  if (!meta) throw Object.assign(new Error("NOTE_NOT_FOUND"), { code: "NOTE_NOT_FOUND" });

  // 去重：同 index 覆盖
  const next = meta.chunks.filter((c) => c.chunkIndex !== chunk.chunkIndex);
  next.push(chunk);
  next.sort((a, b) => a.chunkIndex - b.chunkIndex);
  meta.chunks = next;

  await fs.writeFile(metaFile(noteId), JSON.stringify(meta, null, 2), "utf-8");
}

export async function deleteNote(noteId: string) {
  try {
    await fs.unlink(metaFile(noteId));
  } catch {}
}

export function getNoteRootDir(noteId: string) {
  return path.join(ROOT, noteId);
}
