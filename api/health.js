const { dbSelect } = require("./_lib/supabase");
const { sendJson, sendError, methodNotAllowed } = require("./_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  try {
    await dbSelect("settings", "select=id&limit=1");
    return sendJson(res, 200, { ok: true, service: "gotfoth-api" });
  } catch (e) {
    return sendError(res, 500, e.message || "Health check failed.");
  }
};
