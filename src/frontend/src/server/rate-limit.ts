type RateBucket = {
  count: number;
  resetsAt: number;
};

const globalForRateLimit = globalThis as typeof globalThis & {
  __centralPerkRateLimitMap?: Map<string, RateBucket>;
};

const bucketMap = globalForRateLimit.__centralPerkRateLimitMap ?? new Map<string, RateBucket>();
globalForRateLimit.__centralPerkRateLimitMap = bucketMap;

export function checkRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
}) {
  const now = Date.now();

  for (const [bucketKey, bucket] of bucketMap.entries()) {
    if (bucket.resetsAt <= now) {
      bucketMap.delete(bucketKey);
    }
  }

  const current = bucketMap.get(input.key);
  if (!current || current.resetsAt <= now) {
    const freshBucket: RateBucket = {
      count: 1,
      resetsAt: now + input.windowMs,
    };
    bucketMap.set(input.key, freshBucket);
    return {
      allowed: true,
      remaining: Math.max(0, input.limit - freshBucket.count),
      resetAt: freshBucket.resetsAt,
    };
  }

  if (current.count >= input.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: current.resetsAt,
    };
  }

  current.count += 1;
  bucketMap.set(input.key, current);

  return {
    allowed: true,
    remaining: Math.max(0, input.limit - current.count),
    resetAt: current.resetsAt,
  };
}
