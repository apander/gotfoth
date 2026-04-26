const { sendError, sendJson, methodNotAllowed } = require("../_lib/http");
const { loginWithPassword } = require("../_lib/authSimple");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  try {
    const body = req && req.body && typeof req.body === "object" ? req.body : {};
    const username = body.username != null ? String(body.username).trim() : "";
    const password = body.password != null ? String(body.password) : "";
    const rememberMe = !!body.rememberMe;
    if (!username || !password) return sendError(res, 400, "Username and password are required.");
    const out = await loginWithPassword(res, username, password, rememberMe);
    if (!out) return sendError(res, 401, "Invalid username or password.");
    return sendJson(res, 200, out);
  } catch (e) {
    return sendError(res, 500, e.message || "Login failed.");
  }
};
