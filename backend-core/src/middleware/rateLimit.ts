import type { RequestHandler } from "express";

type RateLimitOptions = {
  windowMs: number;
  max: number;
  bucket: string;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitEntry>();

function getClientKey(req: Parameters<RequestHandler>[0], bucket: string) {
  return `${bucket}:${req.userId ?? req.ip ?? "unknown"}`;
}

function pruneExpired(now: number) {
  if (buckets.size < 1000) return;
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}

export function rateLimit(options: RateLimitOptions): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    pruneExpired(now);
    const key = getClientKey(req, options.bucket);
    const existing = buckets.get(key);
    const entry = existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + options.windowMs };
    entry.count += 1;
    buckets.set(key, entry);

    if (entry.count <= options.max) return next();

    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.setHeader("retry-after", String(retryAfterSeconds));
    return res.status(429).json({
      error: {
        message: "Too many requests. Try again soon.",
        code: "rate_limited",
        requestId: req.requestId
      }
    });
  };
}

export const generalApiRateLimit = rateLimit({
  bucket: "api",
  windowMs: 5 * 60 * 1000,
  max: 300
});

export const agentRuntimeRateLimit = rateLimit({
  bucket: "agent-runtime",
  windowMs: 5 * 60 * 1000,
  max: 60
});

export const sensitiveActionRateLimit = rateLimit({
  bucket: "sensitive-action",
  windowMs: 10 * 60 * 1000,
  max: 30
});

export function createRateLimitForTest(options: RateLimitOptions) {
  return rateLimit(options);
}

export function resetRateLimitsForTest() {
  buckets.clear();
}
