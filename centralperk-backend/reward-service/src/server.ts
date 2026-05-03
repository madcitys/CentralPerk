import dotenv from "dotenv";
dotenv.config();

import Fastify from "fastify";
import path from "path";
import { fileURLToPath } from "url";

const rewards = [
  {
    id: "RWDS-COFFEE-001",
    reward_id: "RWDS-COFFEE-001",
    reward_catalog_id: "RWDS-COFFEE-001",
    name: "Free Brewed Coffee",
    description: "Classic brewed coffee reward for members.",
    pointsCost: 120,
    points_cost: 120,
    category: "beverage",
    image_url:
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
    active: true,
    is_active: true,
  },
  {
    id: "RWDS-PASTRY-001",
    reward_id: "RWDS-PASTRY-001",
    reward_catalog_id: "RWDS-PASTRY-001",
    name: "Pastry Upgrade",
    description: "Choose any pastry add-on for your next order.",
    pointsCost: 180,
    points_cost: 180,
    category: "food",
    image_url:
      "https://images.unsplash.com/photo-1509440159596-0249088772ff?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
    active: true,
    is_active: true,
  },
  {
    id: "RWDS-MUG-001",
    reward_id: "RWDS-MUG-001",
    reward_catalog_id: "RWDS-MUG-001",
    name: "Central Perk Travel Mug",
    description: "Limited merchandise item redeemable in-store.",
    pointsCost: 450,
    points_cost: 450,
    category: "merchandise",
    image_url:
      "https://images.unsplash.com/photo-1514228742587-6b1558fcf93a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
    active: true,
    is_active: true,
  },
  {
    id: "RWDS-VOUCHER-001",
    reward_id: "RWDS-VOUCHER-001",
    reward_catalog_id: "RWDS-VOUCHER-001",
    name: "PHP 200 Store Voucher",
    description: "Voucher for any in-store purchase.",
    pointsCost: 300,
    points_cost: 300,
    category: "voucher",
    cash_value: 200,
    image_url:
      "https://images.unsplash.com/photo-1556740749-887f6717d7e4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
    active: true,
    is_active: true,
  },
  {
    id: "RWDS-PARTNER-001",
    reward_id: "RWDS-PARTNER-001",
    reward_catalog_id: "RWDS-PARTNER-001",
    name: "Partner Dining Voucher",
    description: "Redeemable at Local Rewards Partner branches.",
    pointsCost: 350,
    points_cost: 350,
    category: "voucher",
    partner_id: "PARTNER-001",
    partner_code: "P001",
    partner_name: "Local Rewards Partner",
    partner_conversion_rate: 10,
    cash_value: 350,
    image_url:
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
    active: true,
    is_active: true,
  },
  {
    id: "RWDS-FLASH-001",
    reward_id: "RWDS-FLASH-001",
    reward_catalog_id: "RWDS-FLASH-001",
    name: "Flash Iced Latte",
    description: "Limited-time flash sale drink reward.",
    pointsCost: 90,
    points_cost: 90,
    category: "beverage",
    active_flash_sale_id: "FLASH-001",
    flash_sale_starts_at: "2026-01-01T00:00:00.000Z",
    flash_sale_ends_at: "2026-12-31T23:59:59.000Z",
    flash_sale_quantity_limit: 200,
    flash_sale_claimed_count: 24,
    flash_sale_banner: "Flash sale live now",
    flash_sale_countdown_label: "Ends soon",
    image_url:
      "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
    active: true,
    is_active: true,
  },
];

export function createServer() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true, service: "reward-service" }));

  app.get("/rewards", async (request) => {
    const query = request.query as {
      category?: string;
      active?: string;
      partnerOnly?: string;
      search?: string;
    };

    const category = String(query.category || "").trim().toLowerCase();
    const activeOnly = String(query.active || "true").trim().toLowerCase() !== "false";
    const partnerOnly = String(query.partnerOnly || "").trim().toLowerCase() === "true";
    const search = String(query.search || "").trim().toLowerCase();

    const filteredRewards = rewards.filter((reward) => {
      if (activeOnly && !(reward.is_active ?? reward.active)) return false;
      if (category && String(reward.category || "").trim().toLowerCase() !== category) return false;
      if (partnerOnly && !reward.partner_id) return false;
      if (
        search &&
        !`${String(reward.name || "")} ${String(reward.description || "")}`
          .toLowerCase()
          .includes(search)
      ) {
        return false;
      }
      return true;
    });

    return {
      ok: true,
      rewards: filteredRewards,
      filters: {
        category: category || null,
        activeOnly,
        partnerOnly,
        search: search || null,
      },
    };
  });

  app.get("/rewards/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const reward = rewards.find((entry) => entry.id === id);
    if (!reward) {
      reply.code(404).send({ ok: false, error: "reward_not_found" });
      return;
    }
    return { ok: true, reward };
  });

  return app;
}

function isEntrypoint() {
  return process.argv[1] ? path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]) : false;
}

if (isEntrypoint()) {
  const app = createServer();
  app
    .listen({ host: process.env.HOST || "0.0.0.0", port: Number(process.env.PORT || 4006) })
    .then((address) => app.log.info({ address }, "Reward service listening"))
    .catch((err) => {
      app.log.error(err);
      process.exit(1);
    });
}
