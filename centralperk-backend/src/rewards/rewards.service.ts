import { Injectable, NotFoundException } from "@nestjs/common";
import { LocalRuntimeService } from "../local-runtime/local-runtime.service";
import { SupabaseService } from "../supabase/supabase.service";

type RewardRecord = {
  id: string;
  rewardCatalogId: string;
  name: string;
  description: string | null;
  pointsCost: number;
  category: string | null;
  imageUrl: string | null;
  available: boolean;
  active: boolean;
  expiryDate: string | null;
  partnerId: string | null;
  cashValue: number | null;
  activeFlashSaleId?: string | null;
  flashSaleStartsAt?: string | null;
  flashSaleEndsAt?: string | null;
  flashSaleQuantityLimit?: number | null;
  flashSaleClaimedCount?: number;
  flashSaleBanner?: string | null;
  flashSaleCountdownLabel?: string | null;
};

function normalizeReward(row: Record<string, unknown>): RewardRecord {
  const rewardId = String(row.rewardCatalogId || row.reward_id || row.id || "");
  return {
    id: rewardId,
    rewardCatalogId: rewardId,
    name: String(row.name || "Reward"),
    description: row.description ? String(row.description) : null,
    pointsCost: Number(row.pointsCost ?? row.points_cost ?? 0),
    category: row.category ? String(row.category) : null,
    imageUrl: row.imageUrl ? String(row.imageUrl) : row.image_url ? String(row.image_url) : null,
    available: Boolean(row.available ?? row.is_active ?? true),
    active: Boolean(row.active ?? row.is_active ?? true),
    expiryDate: row.expiryDate ? String(row.expiryDate) : row.expiry_date ? String(row.expiry_date) : null,
    partnerId: row.partnerId ? String(row.partnerId) : row.partner_id ? String(row.partner_id) : null,
    cashValue:
      row.cashValue === null || row.cash_value === null
        ? null
        : row.cashValue !== undefined || row.cash_value !== undefined
          ? Number(row.cashValue ?? row.cash_value)
          : null,
    activeFlashSaleId: row.activeFlashSaleId ? String(row.activeFlashSaleId) : null,
    flashSaleStartsAt: row.flashSaleStartsAt ? String(row.flashSaleStartsAt) : null,
    flashSaleEndsAt: row.flashSaleEndsAt ? String(row.flashSaleEndsAt) : null,
    flashSaleQuantityLimit:
      row.flashSaleQuantityLimit === null || row.flashSaleQuantityLimit === undefined
        ? null
        : Number(row.flashSaleQuantityLimit),
    flashSaleClaimedCount: Number(row.flashSaleClaimedCount ?? 0),
    flashSaleBanner: row.flashSaleBanner ? String(row.flashSaleBanner) : null,
    flashSaleCountdownLabel: row.flashSaleCountdownLabel ? String(row.flashSaleCountdownLabel) : null,
  };
}

@Injectable()
export class RewardsService {
  constructor(
    private readonly runtime: LocalRuntimeService,
    private readonly supabase: SupabaseService,
  ) {}

  private async localRewards() {
    const state = await this.runtime.read();
    return Object.values(state.rewards || {}).map((row) => normalizeReward(row));
  }

  private async supabaseRewards() {
    const admin = this.supabase.admin;
    if (!admin) return [];
    const { data, error } = await admin
      .from("rewards_catalog")
      .select("*")
      .order("points_cost", { ascending: true });
    if (error) return [];
    return (data || []).map((row) => normalizeReward(row as unknown as Record<string, unknown>));
  }

  async list() {
    const merged = new Map<string, RewardRecord>();
    for (const reward of await this.localRewards()) {
      merged.set(reward.id, reward);
    }
    for (const reward of await this.supabaseRewards()) {
      merged.set(reward.id, { ...(merged.get(reward.id) || reward), ...reward });
    }
    return Array.from(merged.values()).sort((left, right) => left.pointsCost - right.pointsCost);
  }

  async active(tier?: string) {
    const rewards = await this.list();
    const visible = rewards.filter((reward) => reward.active !== false && reward.available !== false);
    if (!tier) return visible;
    if (tier.toLowerCase() === "bronze") return visible.filter((reward) => reward.pointsCost <= 400);
    if (tier.toLowerCase() === "silver") return visible.filter((reward) => reward.pointsCost <= 600);
    return visible;
  }

  async get(id: string) {
    const reward = (await this.list()).find((item) => item.id === id || item.rewardCatalogId === id);
    if (!reward) throw new NotFoundException("Reward not found.");
    return reward;
  }
}
