/** Buy-coupon order routes. */
const { json, readBody, clean } = require("../lib/utils");
const orders = require("../services/orders");
const rateLimit = require("../lib/rate-limit");

async function handle(req, res, url) {
  const p = url.pathname;

  if (p === "/api/order/create" && req.method === "POST") {
    if (!rateLimit.allow(req, "order-create", 8, 10 * 60 * 1000)) { json(res, 429, { ok: false, message: "Too many orders from this network. Please try again later." }); return true; }
    const b = await readBody(req);
    const r = orders.create({ likes: b.likes, name: b.name, contact: b.contact });
    json(res, r.code || (r.ok ? 200 : 400), r);
    return true;
  }

  if (p === "/api/order/utr" && req.method === "POST") {
    if (!rateLimit.allow(req, "order-utr", 12, 10 * 60 * 1000)) { json(res, 429, { ok: false, message: "Too many payment submissions. Please try again later." }); return true; }
    const b = await readBody(req);
    const r = orders.submitUtr({ id: b.id, utr: b.utr });
    json(res, r.code || (r.ok ? 200 : 400), r);
    return true;
  }

  if (p === "/api/order/status" && req.method === "GET") {
    const r = orders.status(clean(url.searchParams.get("id")));
    json(res, r.code || (r.ok ? 200 : 404), r);
    return true;
  }

  return false;
}

module.exports = { handle };
