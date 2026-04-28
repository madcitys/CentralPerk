import { Injectable } from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.service";

export type TierRule = {
  tier_label: string;
  min_points: number;
  is_active: boolean;
};

export const DEFAULT_TIERS: TierRule[] = [
  { tier_label: "Platinum", min_points: 1500, is_active: true },
  { tier_label: "Gold", min_points: 750, is_active: true },
  { tier_label: "Silver", min_points: 250, is_active: true },
  { tier_label: "Bronze", min_points: 0, is_active: true },
];

@Injectable()
export class TiersService {
  private cache: { loadedAt: number; value: TierRule[] } | null = null;

  constructor(private readonly supabase: SupabaseService) {}

  async listTiers() {
    if (this.cache && Date.now() - this.cache.loadedAt < 30_000) return this.cache.value;
    const client = this.supabase.admin;
    if (!client) return DEFAULT_TIERS;

    const { data, error } = await client
      .from("points_tiers")
      .select("tier_label,min_points,is_active")
      .eq("is_active", true)
      .order("min_points", { ascending: false });

    if (error || !data?.length) return DEFAULT_TIERS;
    const value = data.map((row) => ({
      tier_label: String(row.tier_label || "Bronze"),
      min_points: Number(row.min_points || 0),
      is_active: Boolean(row.is_active ?? true),
    }));
    this.cache = { loadedAt: Date.now(), value };
    return value;
  }

  async resolveTier(points: number) {
    const tiers = await this.listTiers();
    const active = tiers
      .filter((tier) => tier.is_active)
      .sort((left, right) => right.min_points - left.min_points);
    return active.find((tier) => points >= tier.min_points)?.tier_label || "Bronze";
  }
}
