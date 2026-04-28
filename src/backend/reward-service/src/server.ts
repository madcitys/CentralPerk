import dotenv from "dotenv";
dotenv.config();

import Fastify from "fastify";
import path from "path";
import { fileURLToPath } from "url";

const rewards = [
  {
    id: "RWDS-COFFEE-001",
    name: "Free Brewed Coffee",
    pointsCost: 120,
    category: "beverage",
    active: true,
  },
  {
    id: "RWDS-PASTRY-001",
    name: "Pastry Upgrade",
    pointsCost: 180,
    category: "food",
    active: true,
  },
];

export function createServer() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true, service: "reward-service" }));

  app.get("/rewards", async () => ({ ok: true, rewards }));

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
