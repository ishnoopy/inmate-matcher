// apps/web/lib/ratelimit/index.ts
// Simple in-memory rate limiter using sliding window algorithm
// For production with multiple instances, migrate to Redis-based (e.g., @upstash/ratelimit)

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
  limit: number;
}

class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private config: RateLimitConfig;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.startCleanup();
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const windowStart = now - this.config.windowMs;

      for (const [key, entry] of this.store.entries()) {
        entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);
        if (entry.timestamps.length === 0) {
          this.store.delete(key);
        }
      }
    }, this.config.windowMs);
  }

  check(identifier: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    let entry = this.store.get(identifier);

    if (!entry) {
      entry = { timestamps: [] };
      this.store.set(identifier, entry);
    }

    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

    const remaining = Math.max(0, this.config.maxRequests - entry.timestamps.length);
    const oldestTimestamp = entry.timestamps[0] || now;
    const reset = Math.ceil((oldestTimestamp + this.config.windowMs - now) / 1000);

    if (entry.timestamps.length >= this.config.maxRequests) {
      return {
        success: false,
        remaining: 0,
        reset: reset,
        limit: this.config.maxRequests,
      };
    }

    entry.timestamps.push(now);

    return {
      success: true,
      remaining: remaining - 1,
      reset: Math.ceil(this.config.windowMs / 1000),
      limit: this.config.maxRequests,
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}

const MINUTE = 60 * 1000;

export const ingestRateLimiter = new RateLimiter({
  windowMs: MINUTE,
  maxRequests: 15,
});

export const generalRateLimiter = new RateLimiter({
  windowMs: MINUTE,
  maxRequests: 50,
});

export function getClientIdentifier(request: Request, userId?: string): string {
  if (userId) {
    return `user:${userId}`;
  }

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return `ip:${ip}`;
}

export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    "X-RateLimit-Limit": result.limit.toString(),
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": result.reset.toString(),
  };
}

export { RateLimiter, type RateLimitConfig, type RateLimitResult };
