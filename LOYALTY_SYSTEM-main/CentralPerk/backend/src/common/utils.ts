export function cleanString(value: unknown) {
  const text = Array.isArray(value) ? value[0] : value;
  const normalized = typeof text === "string" ? text.trim() : "";
  return normalized.includes("{{") || normalized.includes("}}") ? "" : normalized;
}

export function numberValue(value: unknown, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function normalizeTier(points: number) {
  if (points >= 1500) return "Platinum";
  if (points >= 750) return "Gold";
  if (points >= 250) return "Silver";
  return "Bronze";
}

export function nowIso() {
  return new Date().toISOString();
}

export function hasTemplateToken(value: unknown) {
  return typeof value === "string" && (value.includes("{{") || value.includes("}}"));
}
