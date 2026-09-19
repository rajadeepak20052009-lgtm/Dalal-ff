/** Customer-facing like routes. */
const { json, readBody, upper, clean } = require("../lib/utils");
const store = require("../db/store");
const coupons = require("../services/coupons");
const likes = require("../services/likes");
const autolikes = require("../services/autolikes");
const rateLimit = require("../lib/rate-limit");

async function handle(req, res, url) {
  const p = url.pathname;

  if (p === "/api/coupon/check" && req.method === "POST") {
    if (!rateLimit.allow(req, "coupon-check", 30, 60 * 1000)) { json(res, 429, { ok: false, message: "Too many requests. Please try again later." }); return true; }
    const b = await readBody(req);
    const c = coupons.get(b.coupon || b.code);
    if (!c || c.issued === false) {
      json(res, 404, { ok: false, message: "Invalid or inactive redeem code" });
      return true;
    }
    json(res, 200, {
      ok: true,
      code: c.code,
      balance: c.balance,
      total: c.total,
      message: `Valid code • ${Number(c.balance).toLocaleString("en-IN")} likes left`,
    });
    return true;
  }

  if (p === "/api/likes/send" && req.method === "POST") {
    if (!rateLimit.allow(req, "likes-send", 10, 60 * 1000)) { json(res, 429, { ok: false, message: "Too many requests. Please try again later." }); return true; }
    const b = await readBody(req);
    const r = await likes.deliver({ uid: b.uid, coupon: b.coupon || b.code, region: b.region, source: "web" });
    json(res, r.code || (r.ok ? 200 : 400), r);
    return true;
  }

  if (p === "/api/likes/history" && req.method === "GET") {
    json(res, 200, likes.history({ uid: url.searchParams.get("uid"), coupon: url.searchParams.get("coupon") }));
    return true;
  }

  if (p === "/api/autolikes/enable" && req.method === "POST") {
    if (!rateLimit.allow(req, "autolikes-enable", 10, 60 * 1000)) { json(res, 429, { ok: false, message: "Too many requests. Please try again later." }); return true; }
    const b = await readBody(req);
    const r = autolikes.enable({ uid: b.uid, coupon: b.coupon, region: b.region });
    json(res, r.code || (r.ok ? 200 : 400), r);
    return true;
  }

  if (p === "/api/autolikes/list" && req.method === "GET") {
    const rows = autolikes.list({ uid: url.searchParams.get("uid"), coupon: url.searchParams.get("coupon") });
    json(res, 200, { ok: true, rows });
    return true;
  }

  if ((p === "/api/autolikes/disable" || p === "/api/autolikes/toggle") && req.method === "POST") {
    const b = await readBody(req);
    const r = p.endsWith("toggle") ? autolikes.toggle(clean(b.id)) : autolikes.disable(clean(b.id));
    json(res, r.code || (r.ok ? 200 : 400), r);
    return true;
  }

  if (p === "/api/stats/public" && req.method === "GET") {
    const db = store.load();
    json(res, 200, {
      ok: true,
      totalLikes: db.sends.reduce((a, s) => a + Number(s.likes || 0), 0),
      players: new Set(db.sends.map((s) => s.uid)).size,
      deliveries: db.sends.length,
    });
    return true;
  }

  return false;
}

module.exports = { handle };
