// In-memory sliding-window-ish rate limiter. Each key gets a counter that
// resets after its window expires. Lazy cleanup on access keeps the map from
// growing unbounded.
//
// Per-process: works for single-instance deploys (the demo). For horizontal
// scale (multiple Vercel functions / serverless workers), swap to Redis
// (Upstash). The call sites only need to keep using the same function shape.

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();

// Sweep stale entries on every Nth access to keep cleanup cheap.
let opsSinceSweep = 0;
const SWEEP_EVERY = 256;
function maybeSweep(now: number) {
  if (++opsSinceSweep < SWEEP_EVERY) return;
  opsSinceSweep = 0;
  for (const [k, b] of store) {
    if (b.resetAt <= now) store.delete(k);
  }
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
};

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  maybeSweep(now);
  const existing = store.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt, retryAfterSec: 0 };
  }
  if (existing.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return {
    ok: true,
    remaining: limit - existing.count,
    resetAt: existing.resetAt,
    retryAfterSec: 0,
  };
}

// Convenience: pull a best-effort client IP off a Next.js Request.
// `x-forwarded-for` is what Vercel sets; if it's missing fall back to a
// constant so we still rate-limit (poorly) instead of opening the floodgates.
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}
