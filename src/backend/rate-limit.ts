import { NextResponse } from "next/server";

type Bucket = { count: number; resetAt: number };

// In-memory, so each serverless instance keeps its own counters. That still
// stops a single client hammering one instance; swap for Upstash if abuse grows.
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export function clientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  return { ok: true };
}

export function rateLimitedResponse(retryAfterSec: number) {
  return NextResponse.json(
    { error: `Слишком много запросов. Подождите ${retryAfterSec} сек.`, code: "RATE_LIMITED" },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}
