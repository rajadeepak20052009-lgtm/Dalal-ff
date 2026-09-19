/** Coupon purchase orders: create -> review -> approve -> redeem code. */
const store = require("../db/store");
const coupons = require("./coupons");
const notify = require("../telegram/notify");
const { config } = require("../config");
const { orderId, clean, upper, nfmt } = require("../lib/utils");

const CODE_WINDOW_MS = 5 * 60 * 1000;

function packageFor(likes) {
  return config.packages.find((p) => Number(p.likes) === Number(likes)) || null;
}

function upiLink(id, price) {
  return (
    `upi://pay?pa=${encodeURIComponent(config.payment.upiId || "")}` +
    `&pn=${encodeURIComponent(config.payment.payeeName || "")}` +
    `&am=${price}&cu=INR&tn=${encodeURIComponent(id)}`
  );
}

function create({ likes, name, contact }) {
  const pkg = packageFor(likes);
  if (!pkg) return { ok: false, code: 400, message: "Invalid package" };
  const id = orderId();
  const order = {
    id,
    likes: pkg.likes,
    price: pkg.price,
    label: pkg.label || String(pkg.likes),
    name: clean(name) || null,
    contact: clean(contact) || null,
    status: "pending",
    utr: null,
    coupon: null,
    createdAt: new Date().toISOString(),
  };
  store.update((db) => db.orders.push(order));
  store.activity("order-created", { id, likes: pkg.likes, price: pkg.price });
  return { ok: true, code: 200, order, upi: upiLink(id, pkg.price) };
}

function submitUtr({ id, utr }) {
  const utrValue = clean(utr);
  if (utrValue.length < 6) return { ok: false, code: 400, message: "Enter the full UTR / transaction id" };
  const out = store.update((db) => {
    const o = db.orders.find((x) => x.id === clean(id));
    if (!o) return { ok: false, code: 404, message: "Order not found" };
    if (o.status !== "pending" && o.status !== "review")
      return { ok: false, code: 409, message: `This order is already ${o.status}` };
    o.utr = utrValue;
    o.status = "review";
    o.utrAt = new Date().toISOString();
    return { ok: true, order: o };
  });
  if (!out.ok) return out;
  store.activity("order-utr", { id: out.order.id, utr: utrValue });
  notify.paymentReview(out.order).catch(() => {});
  return { ok: true, code: 200, message: "Payment sent for verification. You will get the code shortly.", order: out.order };
}

function expireIfNeeded(o) {
  if (!o || o.status !== "awaiting_code" || !o.codeDeadlineAt) return false;
  if (Date.now() < new Date(o.codeDeadlineAt).getTime()) return false;
  o.status = "expired";
  o.expiredAt = new Date().toISOString();
  return true;
}

function sweepExpired() {
  return store.update((db) => {
    let n = 0;
    for (const o of db.orders) if (expireIfNeeded(o)) n++;
    return n;
  });
}

/** Owner pressed YES: open the 5 minute redeem-code window. */
function beginCodeWindow(id) {
  const out = store.update((db) => {
    const o = db.orders.find((x) => x.id === clean(id));
    if (!o) return { ok: false, message: "Order not found" };
    if (o.status !== "review") return { ok: false, message: `Order is ${o.status}, not awaiting review` };
    o.status = "awaiting_code";
    o.paymentApprovedAt = new Date().toISOString();
    o.codeDeadlineAt = new Date(Date.now() + CODE_WINDOW_MS).toISOString();
    return { ok: true, order: o };
  });
  return out;
}

/** Attach a redeem code to the order and activate it for the customer. */
function attachCode(id, code) {
  const out = store.update((db) => {
    const o = db.orders.find((x) => x.id === clean(id));
    if (!o) return { ok: false, message: "Order not found" };
    if (o.status === "expired") return { ok: false, message: "Code window expired" };
    const c = coupons.find(db, code);
    if (!c) return { ok: false, message: `Code ${upper(code)} is not in inventory. Add it first with /addcode.` };
    if (c.orderId && c.orderId !== o.id) return { ok: false, message: `Code ${c.code} is already used by ${c.orderId}` };
    c.issued = true;
    c.orderId = o.id;
    c.assignedAt = new Date().toISOString();
    coupons.logEntry(c, { type: "issued", orderId: o.id });
    o.coupon = c.code;
    o.status = "approved";
    o.approvedAt = new Date().toISOString();
    return { ok: true, order: o, coupon: c };
  });
  if (out.ok) store.activity("order-approved", { id: out.order.id, coupon: out.coupon.code });
  return out;
}

/** Approve + auto-pick a free code of the right size. */
function autoApprove(id) {
  const db = store.load();
  const o = db.orders.find((x) => x.id === clean(id));
  if (!o) return { ok: false, message: "Order not found" };
  const picked = coupons.takeFreeCode(o.likes, o.id);
  if (!picked.ok) return picked;
  return attachCode(o.id, picked.coupon.code);
}

function reject(id, reason) {
  const out = store.update((db) => {
    const o = db.orders.find((x) => x.id === clean(id));
    if (!o) return { ok: false, message: "Order not found" };
    o.status = "rejected";
    o.rejectedAt = new Date().toISOString();
    o.rejectReason = clean(reason) || null;
    return { ok: true, order: o };
  });
  if (out.ok) store.activity("order-rejected", { id: out.order.id });
  return out;
}

function status(id) {
  sweepExpired();
  const o = store.load().orders.find((x) => x.id === clean(id));
  if (!o) return { ok: false, code: 404, message: "Order not found" };
  return {
    ok: true,
    code: 200,
    order: {
      id: o.id,
      likes: o.likes,
      price: o.price,
      status: o.status,
      coupon: o.status === "approved" ? o.coupon : null,
      codeDeadlineAt: o.codeDeadlineAt || null,
    },
  };
}

function pending(limit = 20) {
  sweepExpired();
  return store
    .load()
    .orders.filter((o) => o.status === "review" || o.status === "awaiting_code" || o.status === "pending")
    .slice(-limit)
    .reverse();
}

function list({ status: st, limit = 100 } = {}) {
  sweepExpired();
  return store
    .load()
    .orders.filter((o) => (st ? o.status === st : true))
    .slice()
    .reverse()
    .slice(0, limit);
}

function summaryLine(o) {
  return `${o.id} • ${nfmt(o.likes)} likes • ₹${o.price} • ${o.status}`;
}

module.exports = {
  CODE_WINDOW_MS,
  create,
  submitUtr,
  beginCodeWindow,
  attachCode,
  autoApprove,
  reject,
  status,
  pending,
  list,
  sweepExpired,
  summaryLine,
  upiLink,
};
