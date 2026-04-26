const { dbDelete, dbPatch } = require("../../../_lib/db");
const { sendJson, sendError, methodNotAllowed } = require("../../../_lib/http");
const { requireAuth } = require("../../../_lib/authSimple");

module.exports = async function handler(req, res) {
  const id = req.query && req.query.id ? String(req.query.id) : "";
  if (!id) return sendError(res, 400, "Missing settings id.");

  if (req.method === "PATCH") {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const patch = {};
      if (req.body && req.body.value !== undefined) patch.value = String(req.body.value);
      if (req.body && req.body.key !== undefined) patch.key = String(req.body.key);
      const rows = await dbPatch("settings", id, patch);
      return sendJson(res, 200, rows && rows[0] ? rows[0] : { id, ...patch });
    } catch (e) {
      return sendError(res, 500, e.message || "Failed to update setting.");
    }
  }

  if (req.method === "DELETE") {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      await dbDelete("settings", id);
      return sendJson(res, 204, {});
    } catch (e) {
      return sendError(res, 500, e.message || "Failed to delete setting.");
    }
  }

  return methodNotAllowed(res, ["PATCH", "DELETE"]);
};
