import { describe, expect, it, vi } from "vitest";
import { isTransientPrismaConnectionError, withPrismaConnectionRetry } from "@/lib/prismaRetry";

describe("prisma retry helper", () => {
  it("retries once for transient errors and succeeds", async () => {
    const op = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("terminating connection due to administrator command (SQLSTATE E57P01)"))
      .mockResolvedValueOnce("ok");

    const result = await withPrismaConnectionRetry(op, { maxRetries: 1, retryDelayMs: 0 });

    expect(result).toBe("ok");
    expect(op).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-transient errors", async () => {
    const op = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error("validation failed"));

    await expect(withPrismaConnectionRetry(op, { maxRetries: 1, retryDelayMs: 0 })).rejects.toThrow(
      "validation failed"
    );
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("identifies transient Prisma/Postgres connection errors", () => {
    expect(
      isTransientPrismaConnectionError({
        code: "E57P01",
        message: "terminating connection due to administrator command",
      })
    ).toBe(true);
    expect(isTransientPrismaConnectionError(new Error("read ECONNRESET"))).toBe(true);
    expect(isTransientPrismaConnectionError(new Error("some other failure"))).toBe(false);
  });
});
