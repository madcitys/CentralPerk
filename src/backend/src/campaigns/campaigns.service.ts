import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { LocalRuntimeService } from "../local-runtime/local-runtime.service";
import { hasTemplateToken, nowIso, numberValue } from "../common/utils";
import { SupabaseService } from "../supabase/supabase.service";

@Injectable()
export class CampaignsService {
  constructor(
    private readonly runtime: LocalRuntimeService,
    private readonly supabase: SupabaseService,
  ) {}

  private generatedId() {
    return `CAMP-${Date.now()}`;
  }

  private normalize(input: Record<string, unknown>) {
    const rawId = hasTemplateToken(input.id) ? "" : String(input.id || "").trim();
    const rawCode = hasTemplateToken(input.campaignCode ?? input.campaign_code)
      ? ""
      : String(input.campaignCode || input.campaign_code || "").trim();
    const id = rawId || rawCode || this.generatedId();
    return {
      ...input,
      id,
      campaignCode: rawCode || id,
      campaignName: String(input.campaignName || input.campaign_name || input.name || "Campaign").trim(),
      campaignType: String(input.campaignType || input.campaign_type || "bonus_points"),
      status: String(input.status || "draft"),
      multiplier: numberValue(input.multiplier, 1),
      minimumPurchaseAmount: numberValue(input.minimumPurchaseAmount ?? input.minimum_purchase_amount, 0),
      bonusPoints: Math.floor(numberValue(input.bonusPoints ?? input.bonus_points, 0)),
      productScope: Array.isArray(input.productScope ?? input.product_scope) ? (input.productScope ?? input.product_scope) : [],
      eligibleTiers: Array.isArray(input.eligibleTiers ?? input.eligible_tiers) ? (input.eligibleTiers ?? input.eligible_tiers) : [],
      rewardId:
        input.rewardId === null || input.reward_id === null
          ? null
          : input.rewardId !== undefined || input.reward_id !== undefined
            ? String(input.rewardId ?? input.reward_id)
            : null,
      startsAt: String(input.startsAt || input.starts_at || nowIso()),
      endsAt: String(input.endsAt || input.ends_at || new Date(Date.now() + 7 * 86400_000).toISOString()),
      bannerTitle: input.bannerTitle ?? input.banner_title ?? null,
      bannerMessage: input.bannerMessage ?? input.banner_message ?? null,
      bannerColor: String(input.bannerColor ?? input.banner_color ?? "#1A2B47"),
      countdownLabel: input.countdownLabel ?? input.countdown_label ?? null,
      pushNotificationEnabled: Boolean(input.pushNotificationEnabled ?? input.push_notification_enabled ?? false),
      budgetLimit:
        input.budgetLimit === null || input.budget_limit === null
          ? null
          : input.budgetLimit !== undefined || input.budget_limit !== undefined
            ? numberValue(input.budgetLimit ?? input.budget_limit, 0)
            : null,
      budgetSpent: numberValue(input.budgetSpent ?? input.budget_spent, 0),
      flashSaleQuantityLimit:
        input.flashSaleQuantityLimit === null || input.flash_sale_quantity_limit === null
          ? null
          : input.flashSaleQuantityLimit !== undefined || input.flash_sale_quantity_limit !== undefined
            ? numberValue(input.flashSaleQuantityLimit ?? input.flash_sale_quantity_limit, 0)
            : null,
      flashSaleClaimedCount: numberValue(input.flashSaleClaimedCount ?? input.flash_sale_claimed_count, 0),
      autoPause: Boolean(input.autoPause ?? input.auto_pause ?? true),
      createdAt: String(input.createdAt || input.created_at || nowIso()),
      publishedAt: input.publishedAt ?? input.published_at ?? null,
    };
  }

  async create(input: Record<string, unknown>) {
    if (!input.campaignCode && !input.id) throw new BadRequestException("campaignCode is required.");
    if (!input.campaignName && !input.name) throw new BadRequestException("campaignName is required.");
    return this.runtime.update((state) => {
      const campaign = this.normalize(input);
      state.campaigns[String(campaign.id)] = campaign;
      return campaign;
    });
  }

  async list() {
    const state = await this.runtime.read();
    const merged = new Map<string, Record<string, unknown>>();

    for (const campaign of Object.values(state.campaigns)) {
      if (hasTemplateToken(campaign.id)) continue;
      const normalized = this.normalize(campaign);
      merged.set(String(normalized.id), normalized);
    }

    const admin = this.supabase.admin;
    if (admin) {
      const { data, error } = await admin.from("promotion_campaigns").select("*").order("created_at", { ascending: false });
      if (!error) {
        for (const row of data || []) {
          const normalized = this.normalize(row as unknown as Record<string, unknown>);
          merged.set(String(normalized.id), { ...(merged.get(String(normalized.id)) || normalized), ...normalized });
        }
      }
    }

    return Array.from(merged.values())
      .filter((campaign) => !hasTemplateToken(campaign.id))
      .sort((left, right) => new Date(String(right.createdAt)).getTime() - new Date(String(left.createdAt)).getTime());
  }

  async get(id: string) {
    const state = await this.runtime.read();
    const campaign = state.campaigns[id];
    if (!campaign) throw new NotFoundException("Campaign not found.");
    return this.normalize(campaign);
  }

  async active(tier?: string) {
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

  async performance() {
    return (await this.list()).map((campaign) => ({
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
  }
}
