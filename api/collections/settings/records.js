const { dbInsert, dbSelect } = require("../../_lib/supabase");
const { sendJson, sendError, methodNotAllowed } = require("../../_lib/http");

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const perPage = Math.max(1, Math.min(parseInt(String(req.query.perPage || "500"), 10) || 500, 2000));
      const items = await dbSelect("settings", `select=*&order=key.asc&limit=${perPage}`);
      return sendJson(res, 200, { items });
    } catch (e) {
      return sendError(res, 500, e.message || "Failed to fetch settings.");
    }
  }

  if (req.method === "POST") {
    try {
      const key = req.body && req.body.key ? String(req.body.key).trim() : "";
      const value = req.body && req.body.value != null ? String(req.body.value) : "";
      if (!key) return sendError(res, 400, "Missing settings key.");
      const rows = await dbInsert(
        "settings",
        [{ key, value }],
        "resolution=merge-duplicates,return=representation"
      );
      return sendJson(res, 200, rows && rows[0] ? rows[0] : { key, value });
    } catch (e) {
      return sendError(res, 500, e.message || "Failed to create setting.");
    }
  }

  return methodNotAllowed(res, ["GET", "POST"]);
};
