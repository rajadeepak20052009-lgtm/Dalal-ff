/**
 * External likes provider.
 * Never fakes a success: the provider must return a positive numeric like count.
 */
const { config } = require("../config");
const { logger } = require("../lib/logger");

const log = logger("likes-api");

function isPlaceholderKey(key) {
  return !key || /PUT-YOUR-API-KEY-HERE|YOUR[_-]?API[_-]?KEY|PASTE/i.test(key);
}

function toNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function pickField(root, nested, keys) {
  for (const k of keys) {
    if (root[k] !== undefined && root[k] !== null && root[k] !== "") return root[k];
    if (nested[k] !== undefined && nested[k] !== null && nested[k] !== "") return nested[k];
  }
  return null;
}

function buildUrl(uid, region) {
  const api = config.likesApi;
  let endpoint = String(api.endpoint || "").trim().split("?")[0].replace(/\/+$/, "");
  const params = new URLSearchParams();
  params.set("uid", String(uid));
  params.set("server_name", String(api.serverName || region || "ind").toLowerCase());
  params.set(String(api.apiKeyParam || "key"), String(api.key));
  return `${endpoint}?${params.toString()}`;
}

async function sendLikes(uid, region) {
  const api = config.likesApi;
  if (!api.enabled) return { ok: false, error: "Likes API is disabled in settings." };
  if (isPlaceholderKey(api.key)) return { ok: false, error: "Likes API key is not configured (set LIKES_API_KEY in .env)." };
  if (!api.endpoint) return { ok: false, error: "Likes API URL is not configured (set LIKES_API_URL in .env)." };

  const url = buildUrl(uid, region);
  try {
    const r = await fetch(url, {
      method: String(api.method || "GET").toUpperCase(),
      headers: { Accept: "application/json, text/plain, */*" },
      signal: AbortSignal.timeout(api.timeoutMs),
    });
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    const root = data && typeof data === "object" ? data : {};
    const nested = root.data && typeof root.data === "object" ? root.data : {};
    const pick = (...keys) => pickField(root, nested, keys);

    const statusText = String(pick("status", "Status", "message", "Message", "result") || "").toLowerCase();
    const likesAdded = toNumber(pick("LikesGivenByAPI", "likes_added", "likesAdded", "added", "likesGiven", "likes", "like_count", "likeCount"));
    const likesBefore = toNumber(pick("LikesbeforeCommand", "likes_before", "likesBefore", "before"));
    const likesAfter = toNumber(pick("LikesafterCommand", "likes_after", "likesAfter", "after"));
    const nickname = pick("PlayerNickname", "nickname", "name", "player_name", "playerName");
    const successFlag = pick("success", "Success", "ok");

    const explicitFailure = successFlag === false || /fail|error|invalid|wrong|denied|expired|limit/.test(statusText);
    const ok = r.ok && !explicitFailure && likesAdded !== null && likesAdded > 0;

    if (!ok) log.warn(`uid=${uid} rejected (http ${r.status}) ->`, text.slice(0, 180));

    return {
      ok,
      status: r.status,
      likes_added: likesAdded,
      likes_before: likesBefore,
      likes_after: likesAfter,
      nickname: nickname ? String(nickname) : null,
      raw: data,
      error: !r.ok
        ? `Likes API returned HTTP ${r.status}`
        : !ok
          ? "Likes API did not confirm any added likes."
          : null,
    };
  } catch (e) {
    log.error(`uid=${uid} unreachable:`, e.message);
    return { ok: false, error: "Likes API unreachable: " + e.message };
  }
}

function apiStatus() {
  return {
    enabled: !!config.likesApi.enabled,
    endpoint: config.likesApi.endpoint || null,
    keyConfigured: !isPlaceholderKey(config.likesApi.key),
    likesPerRequest: config.likesApi.likesPerRequest,
  };
}

module.exports = { sendLikes, apiStatus };
