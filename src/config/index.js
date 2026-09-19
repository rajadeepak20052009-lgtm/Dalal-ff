/**
 * Configuration loader.
 * config.json holds public settings (safe for GitHub).
 * Secrets (bot token, api key, admin password) come ONLY from .env / process.env.
 */
const fs = require("fs");
const path = require("path");
const { loadEnv } = require("../lib/env");
const { logger } = require("../lib/logger");

const log = logger("config");
loadEnv();

const ROOT = path.join(__dirname, "..", "..");
const CONFIG_FILE = path.join(ROOT, "config.json");

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    log.error(`could not read ${path.basename(file)}: ${e.message}`);
    return fallback;
  }
}

const file = readJson(CONFIG_FILE, {});
const bool = (v, d) => (v === undefined || v === "" ? d : !/^(0|false|no|off)$/i.test(String(v)));

const config = {
  root: ROOT,
  port: Number(process.env.PORT || file.port || 8080),
  site: file.site || {},
  brand: file.brand || {},
  contact: file.contact || {},
  owner: file.owner || {},
  service: {
    openTime: "06:30",
    closeTime: "22:00",
    timezoneOffsetMinutes: 330,
    dailyLimitPerUid: 1,
    autolikesMinBalance: 400,
    autolikesRunHour: 7,
    ...(file.service || {}),
  },
  payment: file.payment || {},
  packages: Array.isArray(file.packages) ? file.packages : [],
  redeemCodes: file.redeemCodes || { enabled: true, codes: [] },
  likesApi: {
    ...(file.likesApi || {}),
    enabled: bool(process.env.LIKES_API_ENABLED, (file.likesApi || {}).enabled !== false),
    endpoint: process.env.LIKES_API_URL || (file.likesApi || {}).endpoint || "",
    key: process.env.LIKES_API_KEY || (file.likesApi || {}).key || "",
    serverName: process.env.LIKES_API_SERVER || (file.likesApi || {}).serverName || "ind",
    apiKeyParam: (file.likesApi || {}).apiKeyParam || "key",
    method: (file.likesApi || {}).method || "GET",
    likesPerRequest: Number((file.likesApi || {}).likesPerRequest || 100),
    timeoutMs: Number((file.likesApi || {}).timeoutMs || 15000),
  },
  telegram: {
    enabled: bool(process.env.TELEGRAM_ENABLED, (file.telegram || {}).enabled !== false),
    botToken: String(process.env.TELEGRAM_BOT_TOKEN || "").trim(),
    ownerChatId: String(process.env.TELEGRAM_OWNER_ID || "").trim(),
  },
  auth: {
    firstAdminEmail: String(process.env.ADMIN_EMAIL || "").trim().toLowerCase(),
    firstAdminPassword: String(process.env.ADMIN_PASSWORD || ""),
    sessionSecret: String(process.env.SESSION_SECRET || ""),
    sessionTtlHours: 12,
  },
};

function publicConfig(extra) {
  return {
    site: config.site,
    brand: config.brand,
    contact: config.contact,
    packages: config.packages,
    payment: { upiId: config.payment.upiId, payeeName: config.payment.payeeName },
    owner: { id: config.owner.id || null, name: config.owner.name || null },
    service: {
      openTime: config.service.openTime,
      closeTime: config.service.closeTime,
      dailyLimitPerUid: config.service.dailyLimitPerUid,
      autolikesMinBalance: config.service.autolikesMinBalance,
      likesPerRequest: config.likesApi.likesPerRequest,
    },
    ...(extra || {}),
  };
}

module.exports = { config, publicConfig };
