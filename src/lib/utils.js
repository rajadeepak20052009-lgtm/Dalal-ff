/** Shared helpers: HTTP, ids, numbers, IST time. */
const crypto = require("crypto");

const allowedOrigin = String(process.env.ALLOWED_ORIGIN || "").trim();
const CORS = {
  "Access-Control-Allow-Origin": allowedOrigin || "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-token, x-session",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
};

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...CORS,
  });
  res.end(body);
}

function readBody(req, limit = 1e6) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > limit) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

const nfmt = (n) => Number(n || 0).toLocaleString("en-IN");
const rid = (n = 6) => crypto.randomBytes(n).toString("hex");
const upper = (v) => String(v == null ? "" : v).trim().toUpperCase();
const clean = (v) => String(v == null ? "" : v).trim();

function orderId() {
  return "ORD" + Date.now().toString(36).toUpperCase() + rid(2).toUpperCase();
}

function nowIST(offsetMinutes = 330) {
  return new Date(Date.now() + offsetMinutes * 60000);
}

function istStamp(offsetMinutes = 330) {
  return nowIST(offsetMinutes).toISOString().replace("T", " ").slice(0, 16) + " IST";
}

function dayKey(offsetMinutes = 330) {
  return nowIST(offsetMinutes).toISOString().slice(0, 10);
}

function isUid(v) {
  return /^\d{6,20}$/.test(clean(v));
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = {
  CORS,
  json,
  readBody,
  nfmt,
  rid,
  upper,
  clean,
  orderId,
  nowIST,
  istStamp,
  dayKey,
  isUid,
  safeEqual,
};
