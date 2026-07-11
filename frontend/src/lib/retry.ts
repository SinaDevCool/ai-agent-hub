export type RetryOptions = {
  maxAttempts?: number;
  retryDelayMs?: number;
  onRetry?: (retry: { attempt: number; delayMs: number; error: unknown; maxAttempts: number }) => void;
};

function wait(delayMs: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

export async function runWithRetry<T>(operation: () => Promise<T>, options: RetryOptions = {}) {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 1);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 1000);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) break;
      options.onRetry?.({ attempt, delayMs: retryDelayMs, error, maxAttempts });
      if (retryDelayMs > 0) await wait(retryDelayMs);
    }
  }

  throw lastError;
}
