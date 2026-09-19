/** Daily AutoLikes subscriptions + scheduler. */
const store = require("../db/store");
const coupons = require("./coupons");
const likes = require("./likes");
const notify = require("../telegram/notify");
const { config } = require("../config");
const { isUid, upper, clean, rid, dayKey, nfmt } = require("../lib/utils");
const { logger } = require("../lib/logger");

const log = logger("autolikes");

function enable({ uid, coupon, region }) {
  const u = clean(uid);
  const code = upper(coupon);
  const reg = upper(region) || "IND";
  if (!isUid(u)) return { ok: false, code: 400, message: "Enter a valid Free Fire UID" };

  const db = store.load();
  const c = coupons.find(db, code);
  if (!c || c.issued === false) return { ok: false, code: 404, message: "Invalid or inactive redeem code" };
  const min = config.service.autolikesMinBalance;
  if (c.balance < min) return { ok: false, code: 402, message: `AutoLikes needs at least ${nfmt(min)} likes balance` };

  const out = store.update((d) => {
    const existing = d.autolikes.find((a) => a.uid === u && a.coupon === code);
    if (existing) {
      const action = existing.active ? "updated" : "re-enabled";
      existing.active = true;
      existing.region = reg;
      existing.updatedAt = new Date().toISOString();
      return { action, row: existing };
    }
    const row = {
      id: rid(6),
      uid: u,
      coupon: code,
      region: reg,
      active: true,
      lastRun: null,
      lastResult: null,
      totalDelivered: 0,
      createdAt: new Date().toISOString(),
    };
    d.autolikes.push(row);
    return { action: "enabled", row };
  });

  store.activity("autolikes-" + out.action, { uid: u, coupon: code });
  notify.autolikes(out.action, { ...out.row, balance: c.balance, total: c.total }).catch(() => {});
  return { ok: true, code: 200, message: `AutoLikes ${out.action}. Likes will be sent every day automatically.`, row: out.row };
}

function disable(id) {
  const out = store.update((db) => {
    const row = db.autolikes.find((a) => a.id === id);
    if (!row) return null;
    row.active = false;
    row.updatedAt = new Date().toISOString();
    return row;
  });
  if (!out) return { ok: false, code: 404, message: "AutoLikes entry not found" };
  notify.autolikes("disabled", out).catch(() => {});
  return { ok: true, code: 200, message: "AutoLikes disabled", row: out };
}

function toggle(id) {
  const out = store.update((db) => {
    const row = db.autolikes.find((a) => a.id === id);
    if (!row) return null;
    row.active = !row.active;
    row.updatedAt = new Date().toISOString();
    return row;
  });
  if (!out) return { ok: false, code: 404, message: "AutoLikes entry not found" };
  notify.autolikes(out.active ? "enabled" : "disabled", out).catch(() => {});
  return { ok: true, code: 200, message: `AutoLikes ${out.active ? "enabled" : "disabled"}`, row: out };
}

function list({ uid, coupon, all = false, limit = 200 } = {}) {
  const db = store.load();
  const u = clean(uid);
  const c = upper(coupon);
  if (!all && !u && !c) return [];
  return db.autolikes
    .filter((a) => (u ? a.uid === u : true) && (c ? a.coupon === c : true))
    .slice()
    .reverse()
    .slice(0, limit);
}

/** Run every active subscription once per IST day. */
async function runDue() {
  const today = dayKey(config.service.timezoneOffsetMinutes);
  const due = store.load().autolikes.filter((a) => a.active && a.lastRun !== today);
  if (!due.length) return { ran: 0 };

  let delivered = 0;
  for (const row of due) {
    const res = await likes.deliver({
      uid: row.uid,
      coupon: row.coupon,
      region: row.region,
      source: "autolikes",
      skipWindow: true,
    });
    store.update((db) => {
      const r = db.autolikes.find((a) => a.id === row.id);
      if (!r) return;
      r.lastRun = today;
      r.lastResult = res.ok ? `+${res.likes_added} likes` : res.message;
      if (res.ok) r.totalDelivered = Number(r.totalDelivered || 0) + Number(res.likes_added || 0);
    });
    if (res.ok) delivered++;
    else log.warn(`uid=${row.uid}: ${res.message}`);
    await new Promise((r) => setTimeout(r, 1200));
  }
  log.ok(`autolikes run finished: ${delivered}/${due.length} delivered`);
  notify.autolikesReport(delivered, due.length).catch(() => {});
  return { ran: due.length, delivered };
}

let timer = null;
function startScheduler() {
  const tick = async () => {
    try {
      const d = new Date(Date.now() + config.service.timezoneOffsetMinutes * 60000);
      if (d.getUTCHours() >= Number(config.service.autolikesRunHour || 7)) await runDue();
    } catch (e) {
      log.error("scheduler error:", e.message);
    }
  };
  clearInterval(timer);
  timer = setInterval(tick, 10 * 60 * 1000);
  setTimeout(tick, 20000);
  log.info(`scheduler active (daily from ${config.service.autolikesRunHour}:00 IST)`);
  return () => clearInterval(timer);
}

module.exports = { enable, disable, toggle, list, runDue, startScheduler };
