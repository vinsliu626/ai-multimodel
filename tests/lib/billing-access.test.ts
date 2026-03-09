import { describe, expect, it } from "vitest";
import type { UserEntitlement } from "@prisma/client";
import { resolveEffectiveAccessFromEntitlement } from "@/lib/billing/access";

function entitlement(overrides: Partial<UserEntitlement> = {}): UserEntitlement {
  return {
    id: "ent_1",
    userId: "user@example.com",
    plan: "basic",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    stripeCustomerId: null,
    stripeStatus: null,
    stripeSubId: null,
    canSeeSuspiciousSentences: false,
    chatPerDay: 10,
    detectorWordsPerWeek: 5000,
    noteSecondsPerWeek: 7200,
    unlimited: false,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    dailyUsageKey: null,
    unlimitedSource: null,
    weeklyUsageKey: null,
    usedChatCountToday: 0,
    usedDetectorWordsThisWeek: 0,
    usedNoteSecondsThisWeek: 0,
    developerBypass: false,
    developerBypassSetAt: null,
    developerBypassNote: null,
    promoPlan: null,
    promoAccessStartAt: null,
    promoAccessEndAt: null,
    promoAccessActive: false,
    ...overrides,
  };
}

describe("resolveEffectiveAccessFromEntitlement", () => {
  it("uses developer override as top priority", () => {
    const ent = entitlement({
      developerBypass: true,
      plan: "pro",
      stripeStatus: "active",
      stripeSubId: "sub_123",
    });
    const access = resolveEffectiveAccessFromEntitlement("user@example.com", ent, new Date("2026-03-06T00:00:00.000Z"));
    expect(access.source).toBe("developer_override");
    expect(access.plan).toBe("ultra");
    expect(access.unlimited).toBe(true);
  });

  it("supports developer bypass allowlist via env", () => {
    process.env.PREMIUM_BYPASS_USER_IDS = "internal@example.com,other@example.com";
    const ent = entitlement();
    const access = resolveEffectiveAccessFromEntitlement("internal@example.com", ent, new Date("2026-03-06T00:00:00.000Z"));
    expect(access.source).toBe("developer_override");
    expect(access.plan).toBe("ultra");
    delete process.env.PREMIUM_BYPASS_USER_IDS;
  });

  it("prefers paid subscription over promo grant", () => {
    const ent = entitlement({
      plan: "pro",
      stripeSubId: "sub_123",
      stripeStatus: "active",
      currentPeriodEnd: new Date("2026-05-01T00:00:00.000Z"),
      promoAccessActive: true,
      promoPlan: "pro",
      promoAccessEndAt: new Date("2026-04-01T00:00:00.000Z"),
    });
    const access = resolveEffectiveAccessFromEntitlement("user@example.com", ent, new Date("2026-03-06T00:00:00.000Z"));
    expect(access.source).toBe("paid_subscription");
    expect(access.plan).toBe("pro");
  });

  it("does not grant pro when promo entitlement is expired", () => {
    const ent = entitlement({
      promoAccessActive: true,
      promoPlan: "pro",
      promoAccessEndAt: new Date("2026-03-01T00:00:00.000Z"),
    });
    const access = resolveEffectiveAccessFromEntitlement("user@example.com", ent, new Date("2026-03-06T00:00:00.000Z"));
    expect(access.source).toBe("free");
    expect(access.plan).toBe("basic");
  });
});
