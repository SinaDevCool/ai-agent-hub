import type { RequestHandler } from "express";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

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
const redis = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN })
  : null;
const distributedLimiters = new Map<string, Ratelimit>();

function getClientKey(req: Parameters<RequestHandler>[0], bucket: string) {
  return `${bucket}:${req.userId ?? req.ip ?? "unknown"}`;
}

function pruneExpired(now: number) {
  if (buckets.size < 1000) return;
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
  while (buckets.size > 10_000) {
    const oldest = buckets.keys().next().value as string | undefined;
    if (!oldest) break;
    buckets.delete(oldest);
  }
}

export function rateLimit(options: RateLimitOptions): RequestHandler {
  const distributed = redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.fixedWindow(options.max, `${options.windowMs} ms`),
        prefix: `ai-agent-hub:rate-limit:${options.bucket}`,
        analytics: true
      })
    : null;
  if (distributed) distributedLimiters.set(options.bucket, distributed);
  return async (req, res, next) => {
    const now = Date.now();
    const identifier = req.userId ?? req.ip ?? "unknown";
    if (distributed) {
      try {
        const result = await distributed.limit(identifier);
        res.setHeader("x-ratelimit-limit", String(result.limit));
        res.setHeader("x-ratelimit-remaining", String(result.remaining));
        res.setHeader("x-ratelimit-reset", String(result.reset));
        if (result.success) return next();
        res.setHeader("retry-after", String(Math.max(1, Math.ceil((result.reset - now) / 1000))));
        return res.status(429).json({ error: { message: "Too many requests. Try again soon.", code: "rate_limited", requestId: req.requestId } });
      } catch (error) {
        logger.error({ error, bucket: options.bucket }, "distributed rate limiter unavailable; using bounded local fallback");
      }
    }
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
