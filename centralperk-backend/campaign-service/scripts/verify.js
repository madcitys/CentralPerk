
import { createServer } from "../dist/server.js";

async function hit(base, path, options) {
  const res = await fetch(base.replace(/\/+$/, "") + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

(async () => {
  const server = createServer();
  const address = await server.listen({ host: "127.0.0.1", port: 0 });
  const base = address;

  const health = await hit(base, "/health");
  console.log("health", health);

  const campaigns = await hit(base, "/campaigns");
  console.log(
    "campaigns",
    campaigns.status,
    Array.isArray(campaigns.json.campaigns) ? campaigns.json.campaigns.length : campaigns.json
  );

  const multiplier = await hit(base, "/campaigns/multiplier", {
    method: "POST",
    body: JSON.stringify({
      memberIdentifier: "M-LOCAL",
      amountSpent: 100,
    }),
  });
  console.log("multiplier", multiplier);

  await server.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
