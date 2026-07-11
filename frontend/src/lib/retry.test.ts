import { describe, expect, it, vi } from "vitest";
import { runWithRetry } from "./retry";

describe("runWithRetry", () => {
  it("retries a failed operation and returns the successful result", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error("service waking"))
      .mockResolvedValueOnce("ready");
    const onRetry = vi.fn();

    await expect(runWithRetry(operation, { maxAttempts: 2, retryDelayMs: 0, onRetry })).resolves.toBe("ready");

    expect(operation).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({
      attempt: 1,
      delayMs: 0,
      maxAttempts: 2
    }));
  });

  it("throws the last error after exhausting attempts", async () => {
    const firstError = new Error("first failure");
    const lastError = new Error("last failure");
    const operation = vi.fn()
      .mockRejectedValueOnce(firstError)
      .mockRejectedValueOnce(lastError);

    await expect(runWithRetry(operation, { maxAttempts: 2, retryDelayMs: 0 })).rejects.toThrow("last failure");
  });
});
