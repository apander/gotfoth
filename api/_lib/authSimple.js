const { randomBytes, scryptSync, timingSafeEqual } = require("node:crypto");
const { dbInsert, dbPatch, dbSelect } = require("./db");
const { sendError } = require("./http");

const COOKIE_NAME = "gf_session";
const SESSION_HOURS = 12;
const REMEMBER_DAYS = 30;
const AUTH_ENABLED = !["0", "false", "off"].includes(String(process.env.AUTH_ENABLED || "true").toLowerCase());

function nowIso() {
  return new Date().toISOString();
}

function afterSec(sec) {
  return new Date(Date.now() + sec * 1000).toISOString();
}

function parseCookies(req) {
  const raw = req && req.headers ? String(req.headers.cookie || "") : "";
  const out = {};
  if (!raw) return out;
  raw.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx <= 0) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) return;
    out[key] = decodeURIComponent(val);
  });
  return out;
}

function cookieAttrs(maxAgeSec) {
  return [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Secure",
    `Max-Age=${Math.max(0, Math.floor(maxAgeSec || 0))}`,
  ];
}

function setSessionCookie(res, token, maxAgeSec) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${encodeURIComponent(token)}; ${cookieAttrs(maxAgeSec).join("; ")}`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; ${cookieAttrs(0).join("; ")}`);
}

function hashPassword(password, salt) {
  const s = salt || randomBytes(16).toString("hex");
  const digest = scryptSync(String(password), s, 64).toString("hex");
  return `scrypt$${s}$${digest}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = parts[1];
  const expected = Buffer.from(parts[2], "utf8");
  const actual = Buffer.from(scryptSync(String(password), salt, 64).toString("hex"), "utf8");
  if (expected.length !== actual.length) return false;
  try {
    return timingSafeEqual(expected, actual);
  } catch (_e) {
    return false;
  }
}

function tokenHash(token) {
  return scryptSync(String(token), "gotfoth_simple_session", 64).toString("hex");
}

async function loadUserByUsername(username) {
  const rows = await dbSelect(
    "app_users",
    `select=id,username,password_hash,is_active&username=eq.${encodeURIComponent(String(username || "").toLowerCase())}&limit=1`
  );
  return rows && rows[0] ? rows[0] : null;
}

async function ensureBootstrapUser() {
  const rows = await dbSelect("app_users", "select=id&limit=1");
  if (rows && rows.length) return;
  const username = String(process.env.SIMPLE_AUTH_USERNAME || "").trim().toLowerCase();
  const password = String(process.env.SIMPLE_AUTH_PASSWORD || "");
  if (!username || !password) return;
  await dbInsert(
    "app_users",
    [
      {
        id: randomBytes(16).toString("hex"),
        username,
        password_hash: hashPassword(password),
        is_active: true,
        created_at: nowIso(),
        updated_at: nowIso(),
      },
    ],
    "return=minimal"
  );
}

async function loadSessionByToken(token) {
  const rows = await dbSelect(
    "app_sessions",
    `select=id,user_id,expires_at,revoked_at&token_hash=eq.${encodeURIComponent(tokenHash(token))}&limit=1`
  );
  const row = rows && rows[0] ? rows[0] : null;
  if (!row) return null;
  if (row.revoked_at) return null;
  if (!row.expires_at || new Date(row.expires_at).getTime() <= Date.now()) return null;
  return row;
}

async function loadUserById(id) {
  const rows = await dbSelect(
    "app_users",
    `select=id,username,is_active&id=eq.${encodeURIComponent(String(id))}&limit=1`
  );
  return rows && rows[0] ? rows[0] : null;
}

async function createSession(userId, rememberMe) {
  const token = randomBytes(32).toString("hex");
  const ttl = rememberMe ? REMEMBER_DAYS * 24 * 60 * 60 : SESSION_HOURS * 60 * 60;
  const row = {
    id: randomBytes(16).toString("hex"),
    user_id: userId,
    token_hash: tokenHash(token),
    remember_me: !!rememberMe,
    expires_at: afterSec(ttl),
    revoked_at: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await dbInsert("app_sessions", [row], "return=minimal");
  return { token, ttl };
}

async function revokeByToken(token) {
  const rows = await dbSelect(
    "app_sessions",
    `select=id&token_hash=eq.${encodeURIComponent(tokenHash(token))}&limit=1`
  );
  const s = rows && rows[0] ? rows[0] : null;
  if (!s || !s.id) return;
  await dbPatch("app_sessions", s.id, { revoked_at: nowIso(), updated_at: nowIso() }, "return=minimal");
}

async function authFromRequest(req) {
  if (!AUTH_ENABLED) return { user: { id: "auth-disabled", username: "auth-disabled" } };
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME] || "";
  if (!token) return null;
  const session = await loadSessionByToken(token);
  if (!session) return null;
  const user = await loadUserById(session.user_id);
  if (!user || user.is_active === false) return null;
  return { user, session, token };
}

async function requireAuth(req, res) {
  const auth = await authFromRequest(req);
  if (!auth) {
    sendError(res, 401, "Authentication required.");
    return null;
  }
  return auth;
}

function payload(auth) {
  if (!auth || !auth.user) return null;
  return { id: auth.user.id, username: auth.user.username };
}

async function loginWithPassword(res, username, password, rememberMe) {
  if (!AUTH_ENABLED) return { user: { id: "auth-disabled", username: "auth-disabled" } };
  await ensureBootstrapUser();
  const user = await loadUserByUsername(username);
  if (!user || user.is_active === false || !verifyPassword(password, user.password_hash || "")) return null;
  const s = await createSession(user.id, rememberMe);
  setSessionCookie(res, s.token, s.ttl);
  return { user: { id: user.id, username: user.username }, rememberMe: !!rememberMe };
}

module.exports = {
  AUTH_ENABLED,
  COOKIE_NAME,
  parseCookies,
  clearSessionCookie,
  hashPassword,
  requireAuth,
  authFromRequest,
  payload,
  loginWithPassword,
  revokeByToken,
};
