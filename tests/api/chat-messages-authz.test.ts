import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const getServerSession = vi.fn();
  const prisma = {
    chatSession: {
      findFirst: vi.fn(),
    },
    chatMessage: {
      findMany: vi.fn(),
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

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prisma,
}));

describe("GET /api/chat/messages authz", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.getServerSession.mockResolvedValue(null);
    const { GET } = await import("@/app/api/chat/messages/route");

    const req = new NextRequest("http://localhost/api/chat/messages?sessionId=s1");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("AUTH_REQUIRED");
  });

  it("returns 404 for non-owned chat session", async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: "user_a" } });
    mocks.prisma.chatSession.findFirst.mockResolvedValue(null);
    const { GET } = await import("@/app/api/chat/messages/route");

    const req = new NextRequest("http://localhost/api/chat/messages?sessionId=s_other");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("SESSION_NOT_FOUND");
    expect(mocks.prisma.chatMessage.findMany).not.toHaveBeenCalled();
  });

  it("returns messages for owned chat session", async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: "user_a" } });
    mocks.prisma.chatSession.findFirst.mockResolvedValue({ id: "s1" });
    mocks.prisma.chatMessage.findMany.mockResolvedValue([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ]);

    const { GET } = await import("@/app/api/chat/messages/route");
    const req = new NextRequest("http://localhost/api/chat/messages?sessionId=s1");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.messages).toHaveLength(2);
  });
});
