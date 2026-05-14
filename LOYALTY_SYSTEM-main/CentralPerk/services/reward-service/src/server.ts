import Fastify from "fastify";
import { z } from "zod";
import { config } from "./config.js";
import { supabase } from "./supabase-client.js";

const redemptionSchema = z.object({
  memberIdentifier: z.string().trim().min(1).max(120),
  fallbackEmail: z.string().email().optional(),
  rewardCatalogId: z.union([z.string(), z.number()]),
  points: z.number().int().min(1).max(1_000_000),
  reason: z.string().trim().min(1).max(240).default("Reward redemption"),
});

function pointsUrl(path: string) {
  return `${config.pointsServiceUrl.replace(/\/+$/, "")}${path}`;
}

async function redeemPoints(payload: z.infer<typeof redemptionSchema>) {
  const response = await fetch(pointsUrl("/points/redeem"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      memberIdentifier: payload.memberIdentifier,
      fallbackEmail: payload.fallbackEmail,
      points: payload.points,
      reason: payload.reason,
      transactionType: "REDEEM",
      rewardCatalogId: payload.rewardCatalogId,
    }),
  });
  if (!response.ok) throw new Error(`points-service redemption failed with status ${response.status}`);
  return response.json();
}

export function createServer() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({
    status: "ok",
    service: config.serviceName,
    dbMode: config.dbMode,
    schema: config.schema,
  }));

  app.get("/health/db", async (_request, reply) => {
    const { error } = await supabase.from("rewards_catalog").select("id").limit(1);
    if (error) {
      reply.code(503).send({
        status: "error",
        service: config.serviceName,
        dbMode: config.dbMode,
        schema: config.schema,
        database: { connected: false, check: "rewards_catalog" },
      });
      return;
    }

    return {
      status: "ok",
      service: config.serviceName,
      dbMode: config.dbMode,
      schema: config.schema,
      database: { connected: true, check: "rewards_catalog" },
    };
  });

  app.get("/rewards", async () => {
    const { data, error } = await supabase.from("rewards_catalog").select("*").limit(100);
    if (error) throw error;
    return { ok: true, rewards: data || [] };
  });

  app.post("/rewards/redeem", async (request) => {
    const body = redemptionSchema.parse(request.body);
    const pointsResult = await redeemPoints(body);
    const { data, error } = await supabase
      .from("reward_redemptions")
      .insert({
        member_identifier: body.memberIdentifier,
        reward_catalog_id: Number(body.rewardCatalogId),
        points: body.points,
        status: "redeemed",
      })
      .select("*")
      .single();
    if (error) throw error;
    return { ok: true, redemption: data, points: pointsResult?.result ?? pointsResult };
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === process.argv[1]) {
  const app = createServer();
  app.listen({ host: "0.0.0.0", port: config.port }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}
