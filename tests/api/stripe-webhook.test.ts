import { beforeEach, describe, expect, it, vi } from "vitest";
import { planToFlags } from "@/lib/billing/planFlags";

const mocks = vi.hoisted(() => {
  const prisma = {
    processedStripeEvent: {
      create: vi.fn(),
      delete: vi.fn(),
    },
    userEntitlement: {
      findFirst: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
  };
  const stripe = {
    webhooks: {
      constructEvent: vi.fn(),
    },
    subscriptions: {
      retrieve: vi.fn(),
    },
  };
  return { prisma, stripe };
});

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prisma,
}));

vi.mock("@/lib/stripe", () => ({
  stripe: mocks.stripe,
}));

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";
    process.env.STRIPE_PRICE_PRO = "price_pro_test";
    process.env.STRIPE_PRICE_ULTRA = "price_ultra_test";
  });

  it("verifies signature and fulfills entitlement on invoice.paid", async () => {
    const event = {
      id: "evt_1",
      type: "invoice.paid",
      data: {
        object: {
          customer: "cus_123",
          subscription: "sub_123",
          lines: {
            data: [{ price: { id: "price_pro_test" } }],
          },
        },
      },
    };

    mocks.stripe.webhooks.constructEvent.mockReturnValue(event);
    mocks.prisma.processedStripeEvent.create.mockResolvedValue({ id: "pse_1" });
    mocks.prisma.processedStripeEvent.delete.mockResolvedValue({ id: "pse_1" });
    mocks.prisma.userEntitlement.findFirst.mockResolvedValue({ userId: "user_1" });
    mocks.stripe.subscriptions.retrieve.mockResolvedValue({
      status: "active",
      cancel_at_period_end: false,
      current_period_end: 1_700_000_000,
    });
    mocks.prisma.userEntitlement.update.mockResolvedValue({});

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const rawBody = JSON.stringify({ any: "payload" });
    const req = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: {
        "stripe-signature": "t=123,v1=testsig",
      },
      body: rawBody,
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mocks.stripe.webhooks.constructEvent).toHaveBeenCalledWith(rawBody, "t=123,v1=testsig", "whsec_test_123");
    expect(mocks.prisma.userEntitlement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_1" },
        data: expect.objectContaining({
          plan: "pro",
          canSeeSuspiciousSentences: true,
          stripeStatus: "active",
          stripeSubId: "sub_123",
          stripeCustomerId: "cus_123",
          cancelAtPeriodEnd: false,
        }),
      })
    );
    const updateArg = mocks.prisma.userEntitlement.update.mock.calls[0][0];
    expect(updateArg.data.currentPeriodEnd).toBeInstanceOf(Date);
  });

  it("returns 400 for invalid webhook signatures", async () => {
    mocks.stripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error("invalid signature");
    });

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const req = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: {
        "stripe-signature": "t=123,v1=bad",
      },
      body: "{}",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("INVALID_SIGNATURE");
  });

  it("downgrades to basic on invoice.payment_failed", async () => {
    const event = {
      id: "evt_failed_1",
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_123",
          subscription: "sub_123",
        },
      },
    };

    mocks.stripe.webhooks.constructEvent.mockReturnValue(event);
    mocks.prisma.processedStripeEvent.create.mockResolvedValue({ id: "pse_2" });
    mocks.prisma.userEntitlement.findFirst.mockResolvedValue({ userId: "user_2" });
    mocks.prisma.userEntitlement.update.mockResolvedValue({});

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const req = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: {
        "stripe-signature": "t=123,v1=testsig",
      },
      body: "{}",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mocks.prisma.userEntitlement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_2" },
        data: expect.objectContaining({
          ...planToFlags("basic"),
          stripeStatus: "past_due",
        }),
      })
    );
  });

  it("releases dedup lock when handler fails so Stripe can retry", async () => {
    const event = {
      id: "evt_retry_1",
      type: "invoice.paid",
      data: {
        object: {
          customer: "cus_456",
          subscription: "sub_456",
          lines: {
            data: [{ price: { id: "price_pro_test" } }],
          },
        },
      },
    };

    mocks.stripe.webhooks.constructEvent.mockReturnValue(event);
    mocks.prisma.processedStripeEvent.create.mockResolvedValue({ id: "pse_3" });
    mocks.prisma.userEntitlement.findFirst.mockResolvedValue({ userId: "user_3" });
    mocks.stripe.subscriptions.retrieve.mockResolvedValue({
      status: "active",
      cancel_at_period_end: false,
      current_period_end: 1_700_000_001,
    });
    mocks.prisma.userEntitlement.update.mockRejectedValue(new Error("db write failed"));
    mocks.prisma.processedStripeEvent.delete.mockResolvedValue({ id: "pse_3" });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const req = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: {
        "stripe-signature": "t=123,v1=testsig",
      },
      body: "{}",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("WEBHOOK_HANDLER_FAILED");
    expect(mocks.prisma.processedStripeEvent.delete).toHaveBeenCalledWith({
      where: { eventId: "evt_retry_1" },
    });
    consoleErrorSpy.mockRestore();
  });
});
