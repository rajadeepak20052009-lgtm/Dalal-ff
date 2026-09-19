/** Admin panel API. Everything except /login requires a valid session. */
const { json, readBody, clean, upper } = require("../lib/utils");
const auth = require("../services/auth");
const coupons = require("../services/coupons");
const orders = require("../services/orders");
const autolikes = require("../services/autolikes");
const likes = require("../services/likes");
const stats = require("../services/stats");
const store = require("../db/store");
const client = require("../telegram/client");
const notify = require("../telegram/notify");
const rateLimit = require("../lib/rate-limit");

async function handle(req, res, url) {
  const p = url.pathname;
  if (!p.startsWith("/api/admin/")) return false;

  /* ---------- auth ---------- */
  if (p === "/api/admin/login" && req.method === "POST") {
    if (!rateLimit.allow(req, "admin-login", 8, 10 * 60 * 1000)) {
      json(res, 429, { ok: false, message: "Too many login attempts. Please try again later." });
      return true;
    }
    const b = await readBody(req);
    const r = auth.login({ email: b.email, password: b.password });
    json(res, r.code || (r.ok ? 200 : 401), r);
    return true;
  }

  const session = auth.sessionFrom(req);
  if (!session) {
    json(res, 401, { ok: false, message: "Please sign in again" });
    return true;
  }

  const requireOwner = () => {
    if (session.role !== "owner") {
      json(res, 403, { ok: false, message: "Owner permission required" });
      return false;
    }
    return true;
  };

  if (p === "/api/admin/me") {
    json(res, 200, { ok: true, email: session.email, role: session.role || "admin", expiresAt: session.expiresAt });
    return true;
  }

  if (p === "/api/admin/logout" && req.method === "POST") {
    json(res, 200, auth.logout(session.token));
    return true;
  }

  if (p === "/api/admin/password" && req.method === "POST") {
    const b = await readBody(req);
    json(res, 200, auth.changePassword({ email: session.email, currentPassword: b.currentPassword, newPassword: b.newPassword }));
    return true;
  }

  if (p === "/api/admin/admins" && req.method === "GET") {
    if (!requireOwner()) return true;
    json(res, 200, { ok: true, rows: auth.listAdmins() });
    return true;
  }

  if (p === "/api/admin/admins" && req.method === "POST") {
    if (!requireOwner()) return true;
    const b = await readBody(req);
    json(res, 200, auth.createAdmin({ email: b.email, password: b.password }));
    return true;
  }

  if (p === "/api/admin/admins/delete" && req.method === "POST") {
    if (!requireOwner()) return true;
    const b = await readBody(req);
    json(res, 200, auth.removeAdmin(clean(b.id)));
    return true;
  }

  /* ---------- dashboard ---------- */
  if (p === "/api/admin/overview") {
    json(res, 200, {
      ok: true,
      stats: stats.overview(),
      trend: stats.trend(7),
      activity: stats.recentActivity(25),
      telegram: client.status(),
    });
    return true;
  }

  if (p === "/api/admin/telegram/test" && req.method === "POST") {
    const test = await client.selfTest();
    if (test.ok) await notify.adminEvent("🔔 TEST NOTIFICATION", [["From", "Admin panel"], ["By", session.email]]);
    json(res, 200, { ok: test.ok, steps: test.steps, status: client.status() });
    return true;
  }

  /* ---------- codes ---------- */
  if (p === "/api/admin/codes" && req.method === "GET") {
    json(res, 200, { ok: true, rows: coupons.list({ query: url.searchParams.get("q") || "" }) });
    return true;
  }

  if (p === "/api/admin/codes/create" && req.method === "POST") {
    const b = await readBody(req);
    const r = coupons.upsert({ code: b.code, likes: b.likes, issued: b.issued !== false, source: "admin" });
    if (r.ok) notify.adminEvent(r.created ? "🎟 CODE ADDED (admin)" : "🎟 CODE TOPPED UP (admin)", [["Code", r.coupon.code], ["Balance", r.coupon.balance], ["By", session.email]]).catch(() => {});
    json(res, 200, r);
    return true;
  }

  if (p === "/api/admin/codes/balance" && req.method === "POST") {
    const b = await readBody(req);
    json(res, 200, coupons.setBalance(b.code, b.balance));
    return true;
  }

  if (p === "/api/admin/codes/active" && req.method === "POST") {
    const b = await readBody(req);
    json(res, 200, coupons.setActive(b.code, !!b.active));
    return true;
  }

  if (p === "/api/admin/codes/delete" && req.method === "POST") {
    const b = await readBody(req);
    json(res, 200, coupons.remove(b.code));
    return true;
  }

  /* ---------- orders ---------- */
  if (p === "/api/admin/orders" && req.method === "GET") {
    json(res, 200, { ok: true, rows: orders.list({ status: url.searchParams.get("status") || "" }) });
    return true;
  }

  if (p === "/api/admin/orders/approve" && req.method === "POST") {
    const b = await readBody(req);
    orders.beginCodeWindow(clean(b.id));
    const r = b.code ? orders.attachCode(clean(b.id), b.code) : orders.autoApprove(clean(b.id));
    if (r.ok) notify.orderApproved(r.order, r.coupon).catch(() => {});
    json(res, 200, r);
    return true;
  }

  if (p === "/api/admin/orders/reject" && req.method === "POST") {
    const b = await readBody(req);
    json(res, 200, orders.reject(clean(b.id), b.reason));
    return true;
  }

  /* ---------- deliveries & autolikes ---------- */
  if (p === "/api/admin/sends" && req.method === "GET") {
    const q = clean(url.searchParams.get("q"));
    const rows = store
      .load()
      .sends.filter((s) => (q ? s.uid.includes(q) || String(s.coupon || "").includes(upper(q)) : true))
      .slice(-150)
      .reverse();
    json(res, 200, { ok: true, rows });
    return true;
  }

  if (p === "/api/admin/autolikes" && req.method === "GET") {
    json(res, 200, { ok: true, rows: autolikes.list({ all: true }) });
    return true;
  }

  if (p === "/api/admin/autolikes/toggle" && req.method === "POST") {
    const b = await readBody(req);
    json(res, 200, autolikes.toggle(clean(b.id)));
    return true;
  }

  if (p === "/api/admin/autolikes/run" && req.method === "POST") {
    const r = await autolikes.runDue();
    json(res, 200, { ok: true, ...r });
    return true;
  }

  /* ---------- manual delivery + data tools ---------- */
  if (p === "/api/admin/likes/send" && req.method === "POST") {
    const b = await readBody(req);
    const r = await likes.deliver({ uid: b.uid, coupon: b.coupon, region: b.region, source: "admin", skipWindow: true, skipDailyLimit: true });
    json(res, r.code || (r.ok ? 200 : 400), r);
    return true;
  }

  if (p === "/api/admin/backup" && req.method === "POST") {
    if (!requireOwner()) return true;
    const name = store.backup("admin");
    json(res, 200, { ok: !!name, file: name });
    return true;
  }

  if (p === "/api/admin/export" && req.method === "GET") {
    if (!requireOwner()) return true;
    json(res, 200, { ok: true, db: store.load() });
    return true;
  }

  json(res, 404, { ok: false, message: "Unknown admin route" });
  return true;
}

module.exports = { handle };
