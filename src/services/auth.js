/**
 * Admin accounts: email + password (scrypt hashed) with server-side sessions.
 * No external dependency, no plaintext password anywhere.
 */
const crypto = require("crypto");
const store = require("../db/store");
const { config } = require("../config");
const { clean, rid, safeEqual } = require("../lib/utils");
const { logger } = require("../lib/logger");

const log = logger("auth");
const SESSION_TTL = () => Number(config.auth.sessionTtlHours || 12) * 3600 * 1000;

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const secret = config.auth.sessionSecret || "development-only-secret";
  const derived = crypto.scryptSync(String(password), salt + secret, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || "").split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const secret = config.auth.sessionSecret || "development-only-secret";
  const candidate = crypto.scryptSync(String(password), parts[1] + secret, 64).toString("hex");
  return safeEqual(candidate, parts[2]);
}

function normalizeEmail(email) {
  return clean(email).toLowerCase();
}

function findAdmin(db, email) {
  const e = normalizeEmail(email);
  return db.admins.find((a) => a.email === e) || null;
}

function createAdmin({ email, password, role = "admin" }) {
  const e = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, message: "Enter a valid email address" };
  if (String(password || "").length < 8) return { ok: false, message: "Password must be at least 8 characters" };
  return store.update((db) => {
    if (findAdmin(db, e)) return { ok: false, message: "This email already has an admin account" };
    const admin = {
      id: rid(8),
      email: e,
      password: hashPassword(password),
      role,
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
    };
    db.admins.push(admin);
    return { ok: true, admin: { id: admin.id, email: admin.email, role: admin.role } };
  });
}

function changePassword({ email, currentPassword, newPassword }) {
  const db = store.load();
  const admin = findAdmin(db, email);
  if (!admin || !verifyPassword(currentPassword, admin.password))
    return { ok: false, message: "Current password is wrong" };
  if (String(newPassword || "").length < 8) return { ok: false, message: "New password must be at least 8 characters" };
  return store.update((d) => {
    const a = findAdmin(d, email);
    a.password = hashPassword(newPassword);
    d.sessions = d.sessions.filter((s) => s.adminId !== a.id);
    return { ok: true, message: "Password updated. Please sign in again." };
  });
}

function login({ email, password }) {
  const db = store.load();
  const admin = findAdmin(db, email);
  if (!admin || !verifyPassword(password, admin.password))
    return { ok: false, code: 401, message: "Wrong email or password" };
  const token = crypto.randomBytes(24).toString("hex");
  store.update((d) => {
    const a = findAdmin(d, email);
    a.lastLoginAt = new Date().toISOString();
    d.sessions = d.sessions.filter((s) => new Date(s.expiresAt).getTime() > Date.now());
    d.sessions.push({
      token,
      adminId: a.id,
      email: a.email,
      role: a.role,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_TTL()).toISOString(),
    });
  });
  store.activity("admin-login", { email: admin.email });
  return { ok: true, code: 200, token, admin: { email: admin.email, role: admin.role } };
}

function logout(token) {
  store.update((db) => {
    db.sessions = db.sessions.filter((s) => s.token !== clean(token));
  });
  return { ok: true, message: "Signed out" };
}

function sessionFrom(req) {
  const header = req.headers["authorization"] || "";
  const bearer = /^Bearer\s+(.+)$/i.exec(header);
  const token = clean(bearer ? bearer[1] : req.headers["x-session"] || "");
  if (!token) return null;
  const s = store.load().sessions.find((x) => x.token === token);
  if (!s) return null;
  if (new Date(s.expiresAt).getTime() < Date.now()) {
    logout(token);
    return null;
  }
  return s;
}

function listAdmins() {
  return store.load().admins.map((a) => ({ id: a.id, email: a.email, role: a.role, lastLoginAt: a.lastLoginAt, createdAt: a.createdAt }));
}

function removeAdmin(id) {
  return store.update((db) => {
    if (db.admins.length <= 1) return { ok: false, message: "At least one admin must remain" };
    const before = db.admins.length;
    db.admins = db.admins.filter((a) => a.id !== id);
    db.sessions = db.sessions.filter((s) => s.adminId !== id);
    return { ok: db.admins.length < before, message: db.admins.length < before ? "Admin removed" : "Admin not found" };
  });
}

/** Create the first admin from .env on boot. */
function ensureFirstAdmin() {
  const db = store.load();
  if (db.admins.length) return;
  const email = config.auth.firstAdminEmail;
  const password = config.auth.firstAdminPassword;
  if (!email || !password || password.length < 8) {
    log.warn("no admin account yet. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env, or run: npm run setup");
    return;
  }
  const r = createAdmin({ email, password, role: "owner" });
  if (r.ok) log.ok(`first admin created: ${email}`);
  else log.warn(`first admin not created: ${r.message}`);
}

module.exports = {
  createAdmin,
  changePassword,
  login,
  logout,
  sessionFrom,
  listAdmins,
  removeAdmin,
  ensureFirstAdmin,
  hashPassword,
  verifyPassword,
};
