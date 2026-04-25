const { sendJson, methodNotAllowed } = require("../_lib/http");
const { COOKIE_NAME, clearSessionCookie, parseCookies, revokeByToken } = require("../_lib/authSimple");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  try {
    const token = parseCookies(req)[COOKIE_NAME] || "";
    if (token) await revokeByToken(token);
  } catch (_e) {}
  clearSessionCookie(res);
  return sendJson(res, 200, { ok: true });
};
