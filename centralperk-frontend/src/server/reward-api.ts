import { createApiHandler } from "./route-utils";
import { gatewayJson, useRemoteMicroservices } from "./microservice-client";
import { createServerSupabaseClient } from "./supabase-admin";

function normalizeReward(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? row.reward_id ?? ""),
    reward_id: String(row.reward_id ?? row.id ?? ""),
    reward_catalog_id: String(row.reward_catalog_id ?? row.reward_id ?? row.id ?? ""),
    name: String(row.name ?? "Reward"),
    description: String(row.description ?? ""),
    pointsCost: Number(row.pointsCost ?? row.points_cost ?? 0),
    points_cost: Number(row.points_cost ?? row.pointsCost ?? 0),
    category: String(row.category ?? "voucher"),
    available: Boolean(row.is_active ?? row.active ?? true),
    is_active: Boolean(row.is_active ?? row.active ?? true),
    imageUrl: row.imageUrl ? String(row.imageUrl) : row.image_url ? String(row.image_url) : null,
    image_url: row.image_url ? String(row.image_url) : null,
    expiry_date: row.expiry_date ? String(row.expiry_date) : null,
    partner_id: row.partner_id ?? null,
    partner_name: row.partner_name ? String(row.partner_name) : null,
    partner_code: row.partner_code ? String(row.partner_code) : null,
    partner_conversion_rate: Number(row.partner_conversion_rate ?? 0) || null,
    cash_value: Number(row.cash_value ?? 0) || null,
    active_flash_sale_id: row.active_flash_sale_id ? String(row.active_flash_sale_id) : null,
    flash_sale_starts_at: row.flash_sale_starts_at ? String(row.flash_sale_starts_at) : null,
    flash_sale_ends_at: row.flash_sale_ends_at ? String(row.flash_sale_ends_at) : null,
    flash_sale_quantity_limit: Number(row.flash_sale_quantity_limit ?? 0) || null,
    flash_sale_claimed_count: Number(row.flash_sale_claimed_count ?? 0),
    flash_sale_banner: row.flash_sale_banner ? String(row.flash_sale_banner) : null,
    flash_sale_countdown_label: row.flash_sale_countdown_label ? String(row.flash_sale_countdown_label) : null,
  };
}

export const rewardsListHandler = createApiHandler({
  route: "/api/rewards",
  methods: ["GET"] as const,
  rateLimit: { limit: 60, windowMs: 60_000 },
  handler: async () => {
    if (useRemoteMicroservices()) {
      const response = await gatewayJson<{
        ok: true;
        rewards: Array<Record<string, unknown>>;
      }>("/rewards");
      return {
        ok: true as const,
        rewards: (response.rewards || []).map(normalizeReward),
        source: "reward-service",
      };
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("rewards_catalog")
      .select("*")
      .eq("is_active", true)
      .order("points_cost", { ascending: true });
    if (error) throw error;

    return {
      ok: true as const,
      rewards: (data || []).map((row) => normalizeReward(row as Record<string, unknown>)),
      source: "supabase",
    };
  },
});
