import { prisma } from "../lib/prisma";

type ArgMap = Record<string, string>;

function parseArgs(argv: string[]): ArgMap {
  const out: ArgMap = {};
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const i = raw.indexOf("=");
    if (i < 0) {
      out[raw.slice(2)] = "true";
      continue;
    }
    out[raw.slice(2, i)] = raw.slice(i + 1);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const userId = (args.userId ?? "").trim();
  if (!userId) {
    throw new Error("Missing --userId=<email-or-session-id>");
  }

  const enable = (args.enable ?? "true").toLowerCase() !== "false";
  const note = args.note?.trim();

  const ent = await prisma.userEntitlement.upsert({
    where: { userId },
    update: {
      developerBypass: enable,
      developerBypassSetAt: enable ? new Date() : null,
      developerBypassNote: note ?? null,
    },
    create: {
      userId,
      plan: "basic",
      developerBypass: enable,
      developerBypassSetAt: enable ? new Date() : null,
      developerBypassNote: note ?? null,
    },
  });

  console.log("[promo-dev-access] updated", {
    userId: ent.userId,
    developerBypass: ent.developerBypass,
    developerBypassSetAt: ent.developerBypassSetAt?.toISOString() ?? null,
  });
}

main()
  .catch((error) => {
    console.error("[promo-dev-access] failed", error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

