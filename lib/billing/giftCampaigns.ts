export type GiftCampaignPolicy = {
  plan: "pro";
  grantDurationDays: number;
  codeExpiresAt: Date;
};

const DEFAULT_GIFT_CAMPAIGN_POLICY: GiftCampaignPolicy = {
  plan: "pro",
  grantDurationDays: 7,
  codeExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
};

const GIFT_CAMPAIGN_BY_CODE: Record<string, GiftCampaignPolicy> = {
  HELLO_WORLD: {
    plan: "pro",
    grantDurationDays: 7,
    codeExpiresAt: new Date("2026-03-09T00:00:00.000Z"),
  },
  NEWAPP: {
    plan: "pro",
    grantDurationDays: 7,
    codeExpiresAt: new Date("2026-03-19T04:58:40.202Z"),
  },
};

export function getGiftCampaignPolicies() {
  return { ...GIFT_CAMPAIGN_BY_CODE };
}

export function getGiftCampaignPolicy(code: string) {
  return GIFT_CAMPAIGN_BY_CODE[code] ?? null;
}

export function resolveGiftCampaignPolicy(code: string): GiftCampaignPolicy {
  return GIFT_CAMPAIGN_BY_CODE[code] ?? DEFAULT_GIFT_CAMPAIGN_POLICY;
}
