const buckets = new Map();
export function checkRateLimit(key, limit, windowMs) {
    const now = Date.now();
    const arr = buckets.get(key) || [];
    const pruned = arr.filter((ts) => ts > now - windowMs);
    pruned.push(now);
    buckets.set(key, pruned);
    return pruned.length <= limit;
}
