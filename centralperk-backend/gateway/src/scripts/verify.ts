import Fastify from "fastify";

async function startMockPoints() {
  const app = Fastify();
  app.post("/points/award", async () => ({ ok: true, forwarded: "points" }));
  app.get("/points/tiers", async () => ({ ok: true, tiers: [] }));
  await app.listen({ host: "127.0.0.1", port: 5101 });
  return app;
}

async function startMockCampaign() {
  const app = Fastify();
  app.get("/campaigns", async () => ({ ok: true, campaigns: [{ id: "cmp", name: "Mock" }] }));
  app.post("/campaigns", async (req, reply) => reply.send({ ok: true, saved: true }));
  await app.listen({ host: "127.0.0.1", port: 5102 });
  return app;
}

async function hit(base: string, path: string, init?: any) {
  const res = await fetch(base + path, init);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function run() {
  const mockPoints = await startMockPoints();
  const mockCampaign = await startMockCampaign();

  process.env.POINTS_ENGINE_URL = "http://127.0.0.1:5101";
  process.env.CAMPAIGN_SERVICE_URL = "http://127.0.0.1:5102";

  const { createServer } = await import("../server.js");
  const gw = createServer();
  const address = await gw.listen({ host: "127.0.0.1", port: 0 });

  const health = await hit(address, "/health");
  console.log("health", health);

  const campaigns = await hit(address, "/campaigns");
  console.log("campaigns", campaigns);

  const unauthorized = await hit(address, "/campaigns", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
  console.log("unauthorized", unauthorized.status);

  const authorized = await hit(address, "/campaigns", {
    method: "POST",
    body: "{}",
    headers: { "content-type": "application/json", "x-role": "admin" },
  });
  console.log("authorized", authorized.status);

  const award = await hit(address, "/points/award", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
  console.log("award", award.status);

  await gw.close();
  await mockPoints.close();
  await mockCampaign.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
