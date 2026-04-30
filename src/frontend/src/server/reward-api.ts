import { createApiHandler } from "./route-utils";
import { gatewayJson, useRemoteMicroservices } from "./microservice-client";
import { createServerSupabaseClient } from "./supabase-admin";

function normalizeReward(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? row.reward_id ?? ""),
    reward_id: String(row.reward_id ?? row.id ?? ""),
    name: String(row.name ?? "Reward"),
    description: String(row.description ?? ""),
    points_cost: Number(row.points_cost ?? row.pointsCost ?? 0),
    category: String(row.category ?? "voucher"),
    is_active: Boolean(row.is_active ?? row.active ?? true),
    image_url: row.image_url ? String(row.image_url) : null,
    expiry_date: row.expiry_date ? String(row.expiry_date) : null,
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
