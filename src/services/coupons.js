/** Redeem-code (coupon) inventory. */
const store = require("../db/store");
const { config } = require("../config");
const { upper, rid } = require("../lib/utils");

function find(db, code) {
  const c = upper(code);
  if (!c) return null;
  return db.coupons.find((x) => x.code === c) || null;
}

function logEntry(coupon, entry) {
  if (!Array.isArray(coupon.log)) coupon.log = [];
  coupon.log.push({ at: new Date().toISOString(), ...entry });
  if (coupon.log.length > 60) coupon.log = coupon.log.slice(-60);
}

function create({ code, likes, issued = false, source = "manual", orderId = null }) {
  return store.update((db) => {
    const c = upper(code) || `DALAL-${rid(5).toUpperCase()}`;
    const amount = Number(likes);
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: "Likes amount must be a positive number" };
    const existing = find(db, c);
    if (existing) return { ok: false, message: `Code ${c} already exists`, coupon: existing };
    const coupon = {
      code: c,
      total: amount,
      balance: amount,
      issued: !!issued,
      source,
      orderId,
      createdAt: new Date().toISOString(),
      log: [],
    };
    db.coupons.push(coupon);
    return { ok: true, coupon };
  });
}

/** Add or top-up in one step (used by the Telegram bot upload flow). */
function upsert({ code, likes, issued = true, source = "telegram" }) {
  const c = upper(code);
  const amount = Number(likes);
  if (!c) return { ok: false, message: "Code missing" };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: "Likes amount must be a positive number" };
  return store.update((db) => {
    const existing = find(db, c);
    if (!existing) {
      const coupon = {
        code: c,
        total: amount,
        balance: amount,
        issued: !!issued,
        source,
        orderId: null,
        createdAt: new Date().toISOString(),
        log: [{ at: new Date().toISOString(), type: "created", likes: amount, source }],
      };
      db.coupons.push(coupon);
      return { ok: true, created: true, coupon };
    }
    existing.total += amount;
    existing.balance += amount;
    existing.issued = existing.issued || !!issued;
    logEntry(existing, { type: "topup", likes: amount, balance: existing.balance, source });
    return { ok: true, created: false, coupon: existing };
  });
}

function setBalance(code, balance) {
  return store.update((db) => {
    const c = find(db, code);
    if (!c) return { ok: false, message: "Code not found" };
    const n = Number(balance);
    if (!Number.isFinite(n) || n < 0) return { ok: false, message: "Invalid balance" };
    c.balance = n;
    if (c.total < n) c.total = n;
    logEntry(c, { type: "balance-set", balance: n });
    return { ok: true, coupon: c };
  });
}

function setActive(code, active) {
  return store.update((db) => {
    const c = find(db, code);
    if (!c) return { ok: false, message: "Code not found" };
    c.issued = !!active;
    logEntry(c, { type: active ? "activated" : "locked" });
    return { ok: true, coupon: c };
  });
}

function remove(code) {
  return store.update((db) => {
    const before = db.coupons.length;
    db.coupons = db.coupons.filter((c) => c.code !== upper(code));
    return { ok: db.coupons.length < before, message: db.coupons.length < before ? "Deleted" : "Code not found" };
  });
}

function list({ query = "", limit = 200 } = {}) {
  const db = store.load();
  const q = upper(query);
  return db.coupons
    .filter((c) => (q ? c.code.includes(q) : true))
    .slice()
    .reverse()
    .slice(0, limit);
}

function get(code) {
  return find(store.load(), code);
}

/** Free (locked, unassigned) code matching a package size. */
function takeFreeCode(likes, orderIdValue) {
  return store.update((db) => {
    const c = db.coupons.find((x) => !x.issued && !x.orderId && Number(x.total) === Number(likes));
    if (!c) return { ok: false, message: `No free ${likes}-likes code in inventory` };
    c.issued = true;
    c.orderId = orderIdValue;
    c.assignedAt = new Date().toISOString();
    logEntry(c, { type: "assigned", orderId: orderIdValue });
    return { ok: true, coupon: c };
  });
}

/** Load locked inventory from config.json on boot. */
function syncPreloaded() {
  const inventory = (config.redeemCodes && config.redeemCodes.codes) || [];
  return store.update((db) => {
    let added = 0;
    for (const item of inventory) {
      const code = upper(item.code);
      const likes = Number(item.likes);
      if (!code || !Number.isFinite(likes) || likes <= 0) continue;
      if (db.coupons.some((c) => c.code === code)) continue;
      db.coupons.push({
        code,
        total: likes,
        balance: likes,
        issued: false,
        source: "preloaded",
        orderId: null,
        createdAt: new Date().toISOString(),
        log: [],
      });
      added++;
    }
    return added;
  });
}

module.exports = { find, get, list, create, upsert, setBalance, setActive, remove, takeFreeCode, syncPreloaded, logEntry };
