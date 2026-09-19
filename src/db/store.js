/**
 * Atomic JSON store. Single source of truth for every module.
 * Reads are cached in memory; writes go through a temp file + rename.
 */
const fs = require("fs");
const path = require("path");
const { config } = require("../config");
const { logger } = require("../lib/logger");

const log = logger("db");
const DATA_DIR = path.join(config.root, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");

const EMPTY = {
  version: 3,
  coupons: [],
  orders: [],
  sends: [],
  autolikes: [],
  admins: [],
  sessions: [],
  activity: [],
};

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let cache = null;
let dirty = false;
let timer = null;

function load() {
  if (cache) return cache;
  if (!fs.existsSync(DB_FILE)) {
    cache = structuredClone(EMPTY);
    flush(true);
    return cache;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    cache = { ...structuredClone(EMPTY), ...parsed };
    for (const key of Object.keys(EMPTY)) {
      if (Array.isArray(EMPTY[key]) && !Array.isArray(cache[key])) cache[key] = [];
    }
  } catch (e) {
    log.error("db.json is corrupt, starting a fresh file:", e.message);
    backup("corrupt");
    cache = structuredClone(EMPTY);
  }
  return cache;
}

function flush(force) {
  if (!dirty && !force) return;
  dirty = false;
  const tmp = DB_FILE + ".tmp";
  try {
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
    fs.renameSync(tmp, DB_FILE);
  } catch (e) {
    log.error("write failed:", e.message);
  }
}

function save(immediate) {
  dirty = true;
  clearTimeout(timer);
  if (immediate) return flush(true);
  timer = setTimeout(() => flush(), 25);
}

function backup(tag) {
  try {
    if (!fs.existsSync(DB_FILE)) return null;
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const name = `db-${tag || "manual"}-${Date.now()}.json`;
    fs.copyFileSync(DB_FILE, path.join(BACKUP_DIR, name));
    return name;
  } catch (e) {
    log.warn("backup failed:", e.message);
    return null;
  }
}

/** Read + mutate + save in one call. */
function update(fn, immediate = true) {
  const db = load();
  const result = fn(db);
  save(immediate);
  return result;
}

function activity(type, detail) {
  const db = load();
  db.activity.push({ id: Date.now() + "-" + Math.random().toString(36).slice(2, 7), type, detail, at: new Date().toISOString() });
  if (db.activity.length > 500) db.activity = db.activity.slice(-500);
  save();
}

process.on("exit", () => flush(true));
process.on("SIGINT", () => { flush(true); process.exit(0); });
process.on("SIGTERM", () => { flush(true); process.exit(0); });

module.exports = { load, save, update, backup, activity, DB_FILE, DATA_DIR };
