import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const getServerSession = vi.fn();
  const prisma = {
    aiNoteSession: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    aiNoteChunk: {
      upsert: vi.fn(),
      count: vi.fn(),
    },
  };
  return { getServerSession, prisma };
});

vi.mock("next-auth", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/auth/devBypass", () => ({
  devBypassUserId: () => null,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prisma,
}));

describe("POST /api/ai-note/chunk noteId validation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects non-UUID noteId to prevent unsafe path usage", async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: "user_1" } });

    const { POST } = await import("@/app/api/ai-note/chunk/route");
    const req = new Request("http://localhost/api/ai-note/chunk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        noteId: "..\\..\\evil",
        chunkIndex: 0,
        mime: "audio/webm",
        encoding: "base64",
        data: "AA==",
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("INVALID_NOTE_ID");
    expect(mocks.prisma.aiNoteSession.upsert).not.toHaveBeenCalled();
  });
});
