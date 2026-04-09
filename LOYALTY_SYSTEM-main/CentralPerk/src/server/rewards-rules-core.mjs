const DEFAULT_TIER_RULES = [
  { tier_label: "Gold", min_points: 750 },
  { tier_label: "Silver", min_points: 250 },
  { tier_label: "Bronze", min_points: 0 },
];

function normalizeTierLabel(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "gold") return "Gold";
  if (raw === "silver") return "Silver";
  return "Bronze";
}

function normalizeTierRules(rules) {
  const source = Array.isArray(rules) && rules.length > 0 ? rules : DEFAULT_TIER_RULES;
  const filtered = source
    .map((row) => ({
      tier_label: normalizeTierLabel(row.tier_label),
      min_points:
        normalizeTierLabel(row.tier_label) === "Bronze" ? 0 : Math.max(0, Math.floor(Number(row.min_points) || 0)),
    }))
    .filter((row) => ["Bronze", "Silver", "Gold"].includes(row.tier_label));

  if (!filtered.some((row) => row.tier_label === "Bronze")) {
    filtered.push({ tier_label: "Bronze", min_points: 0 });
  }

  return filtered.sort((left, right) => right.min_points - left.min_points);
}

export function resolveTierForBalance(points, rules) {
  const normalized = normalizeTierRules(rules);
  const value = Math.max(0, Math.floor(Number(points) || 0));

  for (const rule of normalized) {
    if (value >= rule.min_points) return rule.tier_label;
  }

  return "Bronze";
}

export function determineTierTransition(input) {
  const startingBalance = Math.max(0, Math.floor(Number(input?.startingBalance) || 0));
  const pointsDelta = Math.floor(Number(input?.pointsDelta) || 0);
  const rules = normalizeTierRules(input?.rules);

  const previousTier = resolveTierForBalance(startingBalance, rules);
  const newBalance = Math.max(0, startingBalance + pointsDelta);
  const newTier = resolveTierForBalance(newBalance, rules);

  return {
    previousTier,
    newTier,
    newBalance,
    changed: previousTier !== newTier,
  };
}

export function calculateExpiryAdjustment(input) {
  const now = new Date(input?.now || new Date().toISOString()).getTime();
  const transactions = Array.isArray(input?.transactions) ? input.transactions : [];

  const expiredEarned = transactions
    .filter((row) => {
      const points = Number(row?.points || 0);
      const expiryDate = row?.expiry_date ? new Date(row.expiry_date).getTime() : NaN;
      return points > 0 && Number.isFinite(expiryDate) && expiryDate < now;
    })
    .reduce((sum, row) => sum + Math.abs(Number(row.points || 0)), 0);

  const alreadyDeducted = transactions
    .filter((row) => String(row?.transaction_type || "").trim().toUpperCase() === "EXPIRY_DEDUCTION")
    .reduce((sum, row) => sum + Math.abs(Number(row.points || 0)), 0);

  return {
    expiredEarned,
    alreadyDeducted,
    totalExpired: Math.max(0, expiredEarned - alreadyDeducted),
  };
}

function toScopeSet(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry || "").trim().toLowerCase()).filter(Boolean);
}

export function resolveMultiplierCampaigns(input) {
  const campaigns = Array.isArray(input?.campaigns) ? input.campaigns : [];
  const purchaseAmount = Math.max(0, Number(input?.purchaseAmount) || 0);
  const basePoints = Math.max(0, Math.floor(Number(input?.basePoints) || 0));
  const memberTier = normalizeTierLabel(input?.memberTier);
  const productScope = String(input?.productScope || "").trim().toLowerCase();
  const now = new Date(input?.now || new Date().toISOString()).getTime();

  return campaigns
    .filter((campaign) => {
      const type = String(campaign?.campaignType || campaign?.campaign_type || "").trim();
      if (type !== "multiplier_event") return false;

      const status = String(campaign?.status || "scheduled").trim().toLowerCase();
      if (!["scheduled", "active"].includes(status)) return false;

      const startsAt = new Date(campaign?.startsAt || campaign?.starts_at || 0).getTime();
      const endsAt = new Date(campaign?.endsAt || campaign?.ends_at || 0).getTime();
      if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || startsAt > now || endsAt < now) return false;

      const minPurchase = Math.max(
        0,
        Number(campaign?.minimumPurchaseAmount ?? campaign?.minimum_purchase_amount ?? 0)
      );
      if (purchaseAmount < minPurchase) return false;

      const tiers = toScopeSet(campaign?.eligibleTiers ?? campaign?.eligible_tiers ?? []);
      if (tiers.length > 0 && !tiers.includes(memberTier.toLowerCase())) return false;

      const scopes = toScopeSet(campaign?.productScope ?? campaign?.product_scope ?? []);
      if (scopes.length > 0 && !scopes.includes(productScope)) return false;

      return true;
    })
    .map((campaign) => {
      const multiplier = Math.max(1, Number(campaign?.multiplier ?? 1));
      const awardedPoints = Math.max(0, Math.floor(basePoints * multiplier) - basePoints);

      return {
        campaignId: String(campaign?.id ?? campaign?.campaignId ?? ""),
        campaignName: String(campaign?.campaignName ?? campaign?.campaign_name ?? "Campaign"),
        campaignType: "multiplier_event",
        awardedPoints,
        appliedMultiplier: multiplier,
        minimumPurchaseAmount: Math.max(
          0,
          Number(campaign?.minimumPurchaseAmount ?? campaign?.minimum_purchase_amount ?? 0)
        ),
      };
    });
}
