const DEFAULT_TIER_RULES = [
    { tier_label: "Gold", min_points: 750 },
    { tier_label: "Silver", min_points: 250 },
    { tier_label: "Bronze", min_points: 0 },
];
export function normalizeTierLabel(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (raw === "silver")
        return "Silver";
    if (raw === "gold")
        return "Gold";
    return "Bronze";
}
export function normalizeTierRules(rules) {
    const source = rules && rules.length > 0 ? rules : DEFAULT_TIER_RULES;
    const filtered = source
        .map((r) => ({
        tier_label: normalizeTierLabel(r.tier_label),
        min_points: Math.max(0, Number(r.min_points) || 0),
        is_active: r.is_active ?? true,
    }))
        .filter((r) => r.tier_label === "Bronze" || r.tier_label === "Silver" || r.tier_label === "Gold");
    const hasBronze = filtered.some((r) => r.tier_label === "Bronze");
    const bronzeRule = { tier_label: "Bronze", min_points: 0, is_active: true };
    const withBronze = hasBronze ? filtered : [...filtered, bronzeRule];
    return withBronze.sort((a, b) => b.min_points - a.min_points);
}
export function resolveTier(points, rules) {
    const normalized = normalizeTierRules(rules);
    for (const rule of normalized) {
        if (points >= rule.min_points)
            return normalizeTierLabel(rule.tier_label);
    }
    return "Bronze";
}
export function calculatePurchasePoints(amount) {
    return Math.floor(Math.max(0, amount) / 50);
}
