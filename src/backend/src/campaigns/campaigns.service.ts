import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { LocalRuntimeService } from "../local-runtime/local-runtime.service";
import { hasTemplateToken, nowIso, numberValue } from "../common/utils";

const READ_CACHE_TTL_MS = 5_000;

type CampaignRecord = Record<string, unknown> & {
  id: string;
  campaignCode: string;
  campaignName: string;
  campaignType: string;
  status: string;
  multiplier: number;
  minimumPurchaseAmount: number;
  bonusPoints: number;
  productScope: unknown[];
  eligibleTiers: unknown[];
  startsAt: string;
  endsAt: string;
  budgetLimit: number | null;
  budgetSpent: number;
  flashSaleQuantityLimit: number | null;
  flashSaleClaimedCount: number;
  autoPause: boolean;
  createdAt: string;
  publishedAt: unknown;
};

type CampaignPerformanceRow = {
  campaign_id: string;
  campaign_code: string;
  campaign_name: string;
  campaign_type: string;
  status: string;
  starts_at: string;
  ends_at: string;
  notifications_sent: number;
  tracked_transactions: number;
  points_awarded: number;
  redemption_count: number;
  quantity_limit: number | null;
  quantity_claimed: number;
  sell_through: number | null;
  redemption_speed_per_hour: number;
};

@Injectable()
export class CampaignsService {
  private listCache: { loadedAt: number; value: CampaignRecord[] } | null = null;
  private performanceCache: { loadedAt: number; value: CampaignPerformanceRow[] } | null = null;

  constructor(private readonly runtime: LocalRuntimeService) {}

  private isFresh(loadedAt: number) {
    return Date.now() - loadedAt < READ_CACHE_TTL_MS;
  }

  private clearReadCaches() {
    this.listCache = null;
    this.performanceCache = null;
  }

  private generatedId() {
    return `CAMP-${Date.now()}`;
  }

  private normalize(input: Record<string, unknown>): CampaignRecord {
    const rawId = hasTemplateToken(input.id) ? "" : String(input.id || "").trim();
    const rawCode = hasTemplateToken(input.campaignCode) ? "" : String(input.campaignCode || "").trim();
    const id = rawId || rawCode || this.generatedId();
    return {
      ...input,
      id,
      campaignCode: rawCode || id,
      campaignName: String(input.campaignName || input.name || "Campaign").trim(),
      campaignType: String(input.campaignType || "bonus_points"),
      status: String(input.status || "draft"),
      multiplier: numberValue(input.multiplier, 1),
      minimumPurchaseAmount: numberValue(input.minimumPurchaseAmount, 0),
      bonusPoints: Math.floor(numberValue(input.bonusPoints, 0)),
      productScope: Array.isArray(input.productScope) ? input.productScope : [],
      eligibleTiers: Array.isArray(input.eligibleTiers) ? input.eligibleTiers : [],
      startsAt: String(input.startsAt || nowIso()),
      endsAt: String(input.endsAt || new Date(Date.now() + 7 * 86400_000).toISOString()),
      budgetLimit: input.budgetLimit === null || input.budgetLimit === undefined ? null : numberValue(input.budgetLimit, 0),
      budgetSpent: numberValue(input.budgetSpent, 0),
      flashSaleQuantityLimit:
        input.flashSaleQuantityLimit === null || input.flashSaleQuantityLimit === undefined
          ? null
          : numberValue(input.flashSaleQuantityLimit, 0),
      flashSaleClaimedCount: numberValue(input.flashSaleClaimedCount, 0),
      autoPause: input.autoPause !== false,
      createdAt: String(input.createdAt || nowIso()),
      publishedAt: input.publishedAt ?? null,
    };
  }

  async create(input: Record<string, unknown>) {
    if (!input.campaignCode && !input.id) throw new BadRequestException("campaignCode is required.");
    if (!input.campaignName && !input.name) throw new BadRequestException("campaignName is required.");
    return this.runtime.update((state) => {
      const campaign = this.normalize(input);
      state.campaigns[String(campaign.id)] = campaign;
      this.clearReadCaches();
      return campaign;
    });
  }

  async list(): Promise<CampaignRecord[]> {
    if (this.listCache && this.isFresh(this.listCache.loadedAt)) {
      return this.listCache.value;
    }

    const state = await this.runtime.read();
    const value = Object.values(state.campaigns)
      .filter((campaign) => !hasTemplateToken(campaign.id))
      .map((campaign) => this.normalize(campaign))
      .sort((left, right) => new Date(String(right.createdAt)).getTime() - new Date(String(left.createdAt)).getTime());
    this.listCache = { loadedAt: Date.now(), value };
    return value;
  }

  async get(id: string): Promise<CampaignRecord> {
    const state = await this.runtime.read();
    const campaign = state.campaigns[id];
    if (!campaign) throw new NotFoundException("Campaign not found.");
    return this.normalize(campaign);
  }

  async active(tier?: string): Promise<CampaignRecord[]> {
    const now = Date.now();
    return (await this.list()).filter((campaign) => {
      const eligibleTiers = Array.isArray(campaign.eligibleTiers) ? campaign.eligibleTiers.map(String) : [];
      return (
        campaign.status === "active" &&
        new Date(String(campaign.startsAt)).getTime() <= now &&
        new Date(String(campaign.endsAt)).getTime() >= now &&
        (!tier || eligibleTiers.length === 0 || eligibleTiers.some((entry) => entry.toLowerCase() === tier.toLowerCase()))
      );
    });
  }

  async publish(id: string) {
    return this.runtime.update((state) => {
      const existing = state.campaigns[id];
      if (!existing) throw new NotFoundException("Campaign not found.");
      const campaign = this.normalize({ ...existing, status: "active", publishedAt: nowIso() });
      state.campaigns[id] = campaign;
      this.clearReadCaches();
      return campaign;
    });
  }

  budgetStatus(campaign: Record<string, unknown>) {
    const normalized = this.normalize(campaign);
    const budgetLimit = normalized.budgetLimit === null ? null : numberValue(normalized.budgetLimit, 0);
    const budgetSpent = numberValue(normalized.budgetSpent, 0);
    return {
      campaignId: normalized.id,
      campaignName: normalized.campaignName,
      status: normalized.status,
      active: normalized.status === "active",
      budgetLimit,
      budgetSpent,
      budgetRemaining: budgetLimit === null ? null : Math.max(0, budgetLimit - budgetSpent),
      utilizationPercent: budgetLimit && budgetLimit > 0 ? Number(Math.min(100, (budgetSpent / budgetLimit) * 100).toFixed(1)) : 0,
      trackedTransactions: 0,
      pointsAwarded: budgetSpent,
      notificationsSent: 0,
      redemptionCount: 0,
      quantityLimit: normalized.flashSaleQuantityLimit ?? null,
      quantityClaimed: numberValue(normalized.flashSaleClaimedCount, 0),
      sellThrough: null,
    };
  }

  async performance(): Promise<CampaignPerformanceRow[]> {
    if (this.performanceCache && this.isFresh(this.performanceCache.loadedAt)) {
      return this.performanceCache.value;
    }

    const value = (await this.list()).map((campaign) => ({
      campaign_id: campaign.id,
      campaign_code: campaign.campaignCode,
      campaign_name: campaign.campaignName,
      campaign_type: campaign.campaignType,
      status: campaign.status,
      starts_at: campaign.startsAt,
      ends_at: campaign.endsAt,
      notifications_sent: 0,
      tracked_transactions: 0,
      points_awarded: numberValue(campaign.budgetSpent, 0),
      redemption_count: 0,
      quantity_limit: campaign.flashSaleQuantityLimit ?? null,
      quantity_claimed: numberValue(campaign.flashSaleClaimedCount, 0),
      sell_through: null,
      redemption_speed_per_hour: 0,
    }));
    this.performanceCache = { loadedAt: Date.now(), value };
    return value;
  }
}
