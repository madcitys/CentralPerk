import { updateApiState, withApiState } from "./local-store";

function hasUnresolvedVariable(value: unknown) {
  return typeof value === "string" && (value.includes("{{") || value.includes("}}"));
}

function generatedCampaignId() {
  return `CAMP-${Date.now()}`;
}

function cleanCampaignLabel(value: unknown, fallback: string) {
  const trimmed = String(value || "")
    .trim()
    .replace(/\s+/g, " ");
  const cleaned = trimmed
    .replace(/^(?:(?:postman|gateway)\s+)+/i, "")
    .replace(/\s+local$/i, "")
    .trim();

  return cleaned || fallback;
}

function cleanCampaignCode(value: unknown, fallback: string) {
  const trimmed = String(value || "").trim();
  const cleaned = trimmed
    .replace(/^(?:(?:POSTMAN|GATEWAY)[-_])+/, "")
    .replace(/^(?:POSTMAN|GATEWAY)[-_]/, "")
    .trim();

  return cleaned || fallback;
}

function cleanCampaignDescription(value: unknown) {
  const trimmed = String(value || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (/created from postman/i.test(trimmed)) return "Created from API.";
  if (/created by local verification/i.test(trimmed)) return "Created locally.";
  if (/created by local qa/i.test(trimmed)) return "Created locally.";
  return trimmed;
}

function normalizeCampaign(input: any) {
  const rawId = hasUnresolvedVariable(input.id) ? "" : String(input.id || "").trim();
  const rawCode = hasUnresolvedVariable(input.campaignCode) ? "" : String(input.campaignCode || "").trim();
  const idSeed = rawId || rawCode || generatedCampaignId();
  const id = cleanCampaignCode(idSeed, generatedCampaignId());
  const campaignCode = cleanCampaignCode(rawCode || id, id);
  const campaignName = hasUnresolvedVariable(input.campaignName)
    ? "Campaign"
    : cleanCampaignLabel(input.campaignName || input.name || "Campaign", "Campaign");

  return {
    ...input,
    id,
    campaignCode,
    campaignName,
    description: cleanCampaignDescription(input.description),
    status: String(input.status || "draft"),
    budgetSpent: Number(input.budgetSpent ?? input.budget_spent ?? 0),
    createdAt: input.createdAt || new Date().toISOString(),
    publishedAt: input.publishedAt ?? null,
  };
}

function campaignListKey(campaign: any) {
  const noiseSource = `${campaign.campaignCode || ""} ${campaign.campaignName || ""} ${campaign.description || ""}`;
  if (/postman|gateway/i.test(noiseSource)) {
    return `normalized:${String(campaign.campaignName || "campaign").toLowerCase()}:${String(campaign.campaignType || "").toLowerCase()}`;
  }
  return `id:${campaign.id}`;
}

function campaignRank(campaign: any) {
  const statusScore =
    campaign.status === "active"
      ? 4
      : campaign.status === "scheduled"
        ? 3
        : campaign.status === "draft"
          ? 2
          : 1;
  const publishedScore = campaign.publishedAt ? 1 : 0;
  const timeScore = new Date(campaign.publishedAt || campaign.createdAt || 0).getTime();
  return { statusScore, publishedScore, timeScore };
}

function preferCampaign(left: any, right: any) {
  const leftRank = campaignRank(left);
  const rightRank = campaignRank(right);
  if (rightRank.statusScore !== leftRank.statusScore) {
    return rightRank.statusScore > leftRank.statusScore ? right : left;
  }
  if (rightRank.publishedScore !== leftRank.publishedScore) {
    return rightRank.publishedScore > leftRank.publishedScore ? right : left;
  }
  return rightRank.timeScore >= leftRank.timeScore ? right : left;
}

export async function saveLocalCampaign(input: any) {
  return updateApiState((state) => {
    const campaign = normalizeCampaign(input);
    state.campaigns[campaign.id] = campaign;
    return campaign;
  });
}

export async function listLocalCampaigns() {
  return withApiState((state) => {
    const campaigns = new Map<string, any>();
    for (const rawCampaign of Object.values(state.campaigns)) {
      if (hasUnresolvedVariable(rawCampaign.id)) continue;
      const campaign = normalizeCampaign(rawCampaign);
      const key = campaignListKey(rawCampaign);
      const existing = campaigns.get(key);
      campaigns.set(key, existing ? preferCampaign(existing, campaign) : campaign);
    }

    return Array.from(campaigns.values()).sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    );
  });
}

export async function getLocalCampaign(id: string) {
  if (hasUnresolvedVariable(id)) return getLatestLocalCampaign();
  return withApiState((state) => {
    const campaign = state.campaigns[id];
    return campaign ? normalizeCampaign(campaign) : null;
  });
}

export async function getLatestLocalCampaign() {
  return withApiState((state) => {
    const campaigns = Object.values(state.campaigns)
      .filter((campaign) => !hasUnresolvedVariable(campaign.id))
      .map((campaign) => normalizeCampaign(campaign))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    return campaigns[0] ?? null;
  });
}

export async function publishLocalCampaign(id: string) {
  return updateApiState((state) => {
    const resolvedId = hasUnresolvedVariable(id)
      ? Object.values(state.campaigns)
          .filter((campaign) => !hasUnresolvedVariable(campaign.id))
          .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0]?.id
      : id;
    if (!resolvedId) return null;
    const existing = state.campaigns[resolvedId];
    if (!existing) return null;
    const campaign = normalizeCampaign({
      ...existing,
      status: "active",
      publishedAt: new Date().toISOString(),
    });
    state.campaigns[resolvedId] = campaign;
    return campaign;
  });
}

export function buildLocalBudgetStatus(campaign: any) {
  const budgetLimitRaw = campaign.budgetLimit ?? campaign.budget_limit ?? null;
  const budgetLimit = budgetLimitRaw === null || budgetLimitRaw === undefined ? null : Number(budgetLimitRaw);
  const budgetSpent = Number(campaign.budgetSpent ?? campaign.budget_spent ?? 0);
  return {
    campaignId: campaign.id,
    campaignName: campaign.campaignName,
    status: campaign.status,
    active: campaign.status === "active",
    budgetLimit,
    budgetSpent,
    budgetRemaining: budgetLimit === null ? null : Math.max(0, budgetLimit - budgetSpent),
    utilizationPercent: budgetLimit && budgetLimit > 0 ? Number(Math.min(100, (budgetSpent / budgetLimit) * 100).toFixed(1)) : 0,
    trackedTransactions: 0,
    pointsAwarded: budgetSpent,
    notificationsSent: 0,
    redemptionCount: 0,
    quantityLimit: campaign.flashSaleQuantityLimit ?? null,
    quantityClaimed: 0,
    sellThrough: null,
  };
}
