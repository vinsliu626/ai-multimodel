import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const getServerSession = vi.fn();
  const prisma = {
    userEntitlement: {
      upsert: vi.fn(),
      update: vi.fn(),
    },
  };
  const stripe = {
    customers: {
      create: vi.fn(),
      retrieve: vi.fn(),
    },
    checkout: {
      sessions: {
        create: vi.fn(),
      },
    },
  };
  return { getServerSession, prisma, stripe };
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

vi.mock("@/lib/stripe", () => ({
  stripe: mocks.stripe,
}));

describe("POST /api/billing/checkout", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.STRIPE_PRICE_PRO = "price_pro_test";
    process.env.STRIPE_PRICE_ULTRA = "price_ultra_test";
    process.env.NEXTAUTH_URL = "http://localhost:3000";
  });

  it("creates a Stripe Checkout Session for pro plan using configured price ID", async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.prisma.userEntitlement.upsert.mockResolvedValue({
      userId: "user_1",
      stripeCustomerId: null,
    });
    mocks.stripe.customers.create.mockResolvedValue({ id: "cus_123" });
    mocks.stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.test/session/abc" });

    const { POST } = await import("@/app/api/billing/checkout/route");
    const req = new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: "pro" }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, url: "https://checkout.stripe.test/session/abc" });
    expect(mocks.stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        customer: "cus_123",
        line_items: [{ price: "price_pro_test", quantity: 1 }],
        success_url: "http://localhost:3000/chat?success=1&plan=pro",
        cancel_url: "http://localhost:3000/chat?canceled=1",
      })
    );
  });
});
