/**
 * Local development entry — binds HTTP. Production uses lambda.js + AWS Lambda.
 */
import { createLogger } from "@outreach-tool/shared/logger";
import { app } from "./app.js";

const log = createLogger("api");

process.on("uncaughtException", (err) => {
  log.error("Uncaught exception (server stays alive)", { error: err.message, stack: err.stack?.split("\n").slice(0, 3).join(" | ") });
});
process.on("unhandledRejection", (reason) => {
  log.error("Unhandled rejection (server stays alive)", { error: String(reason) });
});

const PORT = parseInt(process.env.API_PORT, 10) || 9002;
const server = app.listen(PORT, () => {
  log.info(`API server running on http://localhost:${PORT}`);
  log.info(`SSE endpoint: http://localhost:${PORT}/api/events`);
});
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    log.error(`Port ${PORT} is already in use. Set API_PORT in .env to a free port (e.g. 9002).`);
  } else {
    log.error("server listen error", { error: err.message });
  }
  process.exit(1);
});
