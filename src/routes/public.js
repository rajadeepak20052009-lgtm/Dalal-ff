/** Public metadata routes: /api/health, /api/config */
const { config, publicConfig } = require("../config");
const { json } = require("../lib/utils");
const window = require("../services/service-window");
const client = require("../telegram/client");

async function handle(req, res, url) {
  const p = url.pathname;

  if (p === "/health" || p === "/api/health") {
    json(res, 200, { ok: true, service: config.site.name || "FF LIKES", time: new Date().toISOString(), uptime: Math.round(process.uptime()) });
    return true;
  }

  if (p === "/api/config") {
    json(res, 200, {
      ok: true,
      ...publicConfig({
        service: {
          openTime: config.service.openTime,
          closeTime: config.service.closeTime,
          open: window.isOpen(),
          dailyLimitPerUid: config.service.dailyLimitPerUid,
          autolikesMinBalance: config.service.autolikesMinBalance,
          likesPerRequest: config.likesApi.likesPerRequest,
        },
        telegramApproval: client.enabled(),
      }),
    });
    return true;
  }

  return false;
}

module.exports = { handle };
