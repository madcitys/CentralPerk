const { startServer } = require("next/dist/server/lib/start-server");

const DEFAULT_PORT = 3000;
const port = Number.parseInt(process.env.PORT || "", 10) || DEFAULT_PORT;
const hostname = process.env.HOSTNAME || "0.0.0.0";
const keepAlive = setInterval(() => {}, 60 * 60 * 1000);

function shutdown() {
  clearInterval(keepAlive);
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

startServer({
  dir: process.cwd(),
  port,
  allowRetry: false,
  isDev: true,
  hostname,
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
