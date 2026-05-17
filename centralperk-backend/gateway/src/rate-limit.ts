type Key = string;
const buckets: Map<Key, number[]> = new Map();

export function checkRateLimit(key: Key, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = buckets.get(key) || [];
  const pruned = arr.filter((ts) => ts > now - windowMs);
  pruned.push(now);
  buckets.set(key, pruned);
  return pruned.length <= limit;
}
