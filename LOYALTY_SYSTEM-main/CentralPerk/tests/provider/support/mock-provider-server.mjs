import http from "node:http";
import { once } from "node:events";

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  if (chunks.length === 0) return null;
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) : null;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

export function createMockProviderServer(routeTableByState) {
  let currentState = "default";
  let server = null;
  let baseUrl = "";

  const handler = async (req, res) => {
    const path = new URL(req.url || "/", "http://127.0.0.1").pathname;
    const routeKey = `${String(req.method || "GET").toUpperCase()} ${path}`;
    const stateTable = routeTableByState[currentState] || routeTableByState.default || {};
    const route = stateTable[routeKey] || routeTableByState.default?.[routeKey];

    if (!route) {
      return sendJson(res, 404, { error: { message: `No mock route for ${routeKey} in state ${currentState}.` } });
    }

    try {
      const body = await readJsonBody(req);
      const result = await route({ req, body, state: currentState });
      const response = result && typeof result === "object" && "status" in result ? result : { status: 200, body: result };
      return sendJson(res, Number(response.status || 200), response.body ?? {});
    } catch (error) {
      return sendJson(res, 500, { error: { message: error instanceof Error ? error.message : "Mock provider error." } });
    }
  };

  return {
    async start(port = 0) {
      server = http.createServer(handler);
      server.listen(port, "127.0.0.1");
      await once(server, "listening");
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Unable to resolve provider server address.");
      }
      baseUrl = `http://127.0.0.1:${address.port}`;
      return baseUrl;
    },
    setState(state) {
      currentState = state;
    },
    get url() {
      return baseUrl;
    },
    async stop() {
      if (!server) return;
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      server = null;
      baseUrl = "";
    },
  };
}
