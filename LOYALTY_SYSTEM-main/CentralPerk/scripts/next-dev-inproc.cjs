const { startServer } = require("next/dist/server/lib/start-server");

const DEFAULT_PORT = 3000;
const port = Number.parseInt(process.env.PORT || "", 10) || DEFAULT_PORT;
const hostname = process.env.HOSTNAME || "0.0.0.0";

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
