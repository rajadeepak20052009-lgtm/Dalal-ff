/**
 * FF LIKES INDIA — application entry point.
 * Pure Node.js (zero npm dependencies). Works on Termux, VPS, Render, Railway.
 *
 *   npm start            -> http://localhost:8080
 *   PORT=3000 npm start
 */
const http = require("http");
const { config } = require("./config");
const { logger } = require("./lib/logger");
const { json, CORS } = require("./lib/utils");

const store = require("./db/store");
const coupons = require("./services/coupons");
const auth = require("./services/auth");
const autolikes = require("./services/autolikes");
const orders = require("./services/orders");
const bot = require("./telegram/bot");

const publicRoutes = require("./routes/public");
const likeRoutes = require("./routes/likes");
const orderRoutes = require("./routes/orders");
const adminRoutes = require("./routes/admin");
const staticFiles = require("./routes/static");

const log = logger("server");

/* ---------- boot tasks ---------- */
store.load();
const preloaded = coupons.syncPreloaded();
if (preloaded) log.ok(`${preloaded} redeem codes loaded from config.json`);
auth.ensureFirstAdmin();
orders.sweepExpired();

const ROUTERS = [publicRoutes, likeRoutes, orderRoutes, adminRoutes];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }

  try {
    if (url.pathname.startsWith("/api/") || url.pathname === "/health") {
      for (const router of ROUTERS) {
        if (await router.handle(req, res, url)) return;
      }
      return json(res, 404, { ok: false, message: "Unknown API route: " + url.pathname });
    }
    return staticFiles.serve(req, res, url);
  } catch (e) {
    log.error("request failed:", e.stack || e.message);
    if (!res.headersSent) json(res, 500, { ok: false, message: "Server error" });
  }
});

if (!config.auth.sessionSecret && process.env.NODE_ENV === "production") {
  log.warn("SESSION_SECRET is missing; set a strong random value before using admin authentication in production.");
}

server.listen(config.port, "0.0.0.0", () => {
  log.ok(`${config.site.name || "FF LIKES"} running on http://localhost:${config.port}`);
  log.info(`admin panel: http://localhost:${config.port}/admin`);
  bot.start();
  autolikes.startScheduler();
  setInterval(() => orders.sweepExpired(), 60000);
});

process.on("unhandledRejection", (e) => log.error("unhandled rejection:", (e && e.message) || e));
process.on("uncaughtException", (e) => log.error("uncaught exception:", e.stack || e.message));

module.exports = server;
