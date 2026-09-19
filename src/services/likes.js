/** Like delivery: validation, quota, provider call, ledger, notification. */
const store = require("../db/store");
const coupons = require("../services/coupons");
const provider = require("../services/likes-api");
const window = require("../services/service-window");
const notify = require("../telegram/notify");
const { config } = require("../config");
const { isUid, upper, clean, dayKey, rid, nfmt } = require("../lib/utils");

function usedToday(db, uid) {
  const day = dayKey(config.service.timezoneOffsetMinutes);
  return db.sends.filter((s) => s.uid === uid && s.day === day).length;
}

/**
 * @param {{uid:string, coupon:string, region:string, source?:string, skipWindow?:boolean, skipDailyLimit?:boolean}} input
 */
async function deliver(input) {
  const uid = clean(input.uid);
  const code = upper(input.coupon);
  const region = upper(input.region) || "IND";
  const source = input.source || "web";

  if (!isUid(uid)) return { ok: false, code: 400, message: "Enter a valid Free Fire UID (numbers only)" };
  if (!region) return { ok: false, code: 400, message: "Please select a region" };
  if (!input.skipWindow && !window.isOpen())
    return { ok: false, code: 403, message: `Service is offline. Timing: ${window.windowText()}` };

  const db = store.load();
  const coupon = coupons.find(db, code);
  if (!coupon || coupon.issued === false)
    return { ok: false, code: 404, message: "Invalid or inactive redeem code. Payment approval is required first." };

  const perRequest = config.likesApi.likesPerRequest;
  if (coupon.balance < perRequest)
    return { ok: false, code: 402, message: "This redeem code has no balance left" };

  if (!input.skipDailyLimit && usedToday(db, uid) >= config.service.dailyLimitPerUid)
    return { ok: false, code: 429, message: "This UID already received likes today. Try again tomorrow." };

  const result = await provider.sendLikes(uid, region);
  if (!result.ok) return { ok: false, code: 502, message: result.error || "Likes API failed" };

  const added = Math.min(result.likes_added || perRequest, coupon.balance);
  const row = {
    id: rid(6),
    uid,
    region,
    coupon: code,
    likes: added,
    likes_before: result.likes_before,
    likes_after: result.likes_after,
    nickname: result.nickname,
    source,
    day: dayKey(config.service.timezoneOffsetMinutes),
    at: new Date().toISOString(),
  };

  store.update((d) => {
    const c = coupons.find(d, code);
    c.balance -= added;
    coupons.logEntry(c, { type: "send", uid, likes: -added, balance: c.balance, source });
    d.sends.push(row);
    row.balance = c.balance;
    row.total = c.total;
  });
  store.activity("like-delivered", { uid, likes: added, coupon: code, source });

  notify.likesDelivered({ ...row, nickname: result.nickname }).catch(() => {});

  return {
    ok: true,
    code: 200,
    message: `${nfmt(added)} likes sent successfully!`,
    uid,
    nickname: result.nickname,
    likes_added: added,
    likes_before: result.likes_before,
    likes_after: result.likes_after,
    balance: row.balance,
    total: row.total,
    at: row.at,
    id: row.id,
  };
}

function history({ uid, coupon, limit = 10 }) {
  const db = store.load();
  const u = clean(uid);
  const c = upper(coupon);
  if (!u && !c) return { ok: true, rows: [], scope: "none" };
  const rows = db.sends
    .filter((s) => (u ? s.uid === u : true) && (c ? s.coupon === c : true))
    .slice(-limit)
    .reverse();
  const found = c ? coupons.find(db, c) : null;
  return {
    ok: true,
    rows,
    scope: u && c ? "uid+coupon" : u ? "uid" : "coupon",
    totalLikes: rows.reduce((a, s) => a + Number(s.likes || 0), 0),
    balance: found ? found.balance : null,
    total: found ? found.total : null,
  };
}

/** Re-import a delivery record (Telegram upload flow). */
function importSend(row) {
  const uid = clean(row.uid);
  const likes = Number(row.likes);
  if (!isUid(uid) || !Number.isFinite(likes) || likes <= 0) return { ok: false, message: "UID or likes missing" };
  return store.update((db) => {
    const dupe = db.sends.find((s) => s.uid === uid && s.likes === likes && s.at === row.at);
    if (dupe) return { ok: true, duplicate: true, row: dupe };
    const entry = {
      id: rid(6),
      uid,
      region: upper(row.region) || "IND",
      coupon: upper(row.coupon) || null,
      likes,
      likes_before: row.likes_before ?? null,
      likes_after: row.likes_after ?? null,
      nickname: row.nickname || null,
      source: "telegram-import",
      day: dayKey(config.service.timezoneOffsetMinutes),
      at: row.at || new Date().toISOString(),
    };
    db.sends.push(entry);
    return { ok: true, duplicate: false, row: entry };
  });
}

module.exports = { deliver, history, importSend };
