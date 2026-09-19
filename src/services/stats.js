/** Dashboard + bot statistics. */
const store = require("../db/store");
const { config } = require("../config");
const { dayKey } = require("../lib/utils");
const provider = require("./likes-api");
const window = require("./service-window");

function overview() {
  const db = store.load();
  const today = dayKey(config.service.timezoneOffsetMinutes);
  const todaySends = db.sends.filter((s) => s.day === today);
  const sum = (rows) => rows.reduce((a, s) => a + Number(s.likes || 0), 0);
  const paid = db.orders.filter((o) => o.status === "approved");

  return {
    likes: { today: sum(todaySends), total: sum(db.sends), deliveries: db.sends.length, todayDeliveries: todaySends.length },
    uids: { today: new Set(todaySends.map((s) => s.uid)).size, total: new Set(db.sends.map((s) => s.uid)).size },
    coupons: {
      total: db.coupons.length,
      active: db.coupons.filter((c) => c.issued && c.balance > 0).length,
      locked: db.coupons.filter((c) => !c.issued).length,
      balance: db.coupons.reduce((a, c) => a + Number(c.balance || 0), 0),
    },
    orders: {
      total: db.orders.length,
      review: db.orders.filter((o) => o.status === "review").length,
      awaitingCode: db.orders.filter((o) => o.status === "awaiting_code").length,
      approved: paid.length,
      rejected: db.orders.filter((o) => o.status === "rejected").length,
      revenue: paid.reduce((a, o) => a + Number(o.price || 0), 0),
    },
    autolikes: {
      total: db.autolikes.length,
      active: db.autolikes.filter((a) => a.active).length,
      ranToday: db.autolikes.filter((a) => a.lastRun === today).length,
    },
    service: { open: window.isOpen(), window: window.windowText() },
    api: provider.apiStatus(),
  };
}

/** Likes per day for the last N days (chart data). */
function trend(days = 7) {
  const db = store.load();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() + config.service.timezoneOffsetMinutes * 60000 - i * 86400000)
      .toISOString()
      .slice(0, 10);
    const rows = db.sends.filter((s) => s.day === d);
    out.push({ day: d, likes: rows.reduce((a, s) => a + Number(s.likes || 0), 0), deliveries: rows.length });
  }
  return out;
}

function recentActivity(limit = 40) {
  return store.load().activity.slice(-limit).reverse();
}

module.exports = { overview, trend, recentActivity };
