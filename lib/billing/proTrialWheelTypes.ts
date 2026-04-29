export const PRO_TRIAL_WHEEL_PRIZES = [
  {
    durationDays: 3,
    weight: 55,
    label: "3 Days",
    tier: "Common",
    color: "#2563eb",
    accent: "rgba(147,197,253,0.34)",
  },
  {
    durationDays: 7,
    weight: 25,
    label: "7 Days",
    tier: "Uncommon",
    color: "#0f766e",
    accent: "rgba(94,234,212,0.28)",
  },
  {
    durationDays: 14,
    weight: 14,
    label: "14 Days",
    tier: "Rare",
    color: "#7c3aed",
    accent: "rgba(196,181,253,0.3)",
  },
  {
    durationDays: 20,
    weight: 5,
    label: "20 Days",
    tier: "Epic",
    color: "#ea580c",
    accent: "rgba(253,186,116,0.3)",
  },
  {
    durationDays: 30,
    weight: 1,
    label: "30 Days",
    tier: "Legendary",
    color: "#ca8a04",
    accent: "rgba(253,224,71,0.32)",
  },
] as const;

export type ProTrialWheelStatus = {
  ok: true;
  userId: string;
  canSpin: boolean;
  devUnlimitedSpins: boolean;
  hasSpun: boolean;
  spinUsedAt: string | null;
  activeTrialEndsAt: string | null;
};

export type ProTrialWheelSpinResult = {
  ok: true;
  prizeDurationDays: number;
  code: string;
  codeExpiresAt: string;
  status: ProTrialWheelStatus;
};
