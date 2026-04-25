const { dbSelect } = require("../../../_lib/db");
const { storageSignedUrl } = require("../../../_lib/storage");
const { sendError, methodNotAllowed } = require("../../../_lib/http");

const FIELD_TO_PATH = {
  file_paper: "file_paper_path",
  file_scheme: "file_scheme_path",
  file_attempt: "file_attempt_path",
  file_marking_yaml: "file_marking_yaml_path",
};

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return methodNotAllowed(res, ["GET", "HEAD"]);
  const id = req.query && req.query.id ? String(req.query.id) : "";
  const field = req.query && req.query.field ? String(req.query.field) : "";
  const pathField = FIELD_TO_PATH[field];
  if (!id || !pathField) return sendError(res, 400, "Invalid file request.");

  try {
    const rows = await dbSelect("papers", `select=${pathField}&id=eq.${encodeURIComponent(id)}&limit=1`);
    const row = rows && rows[0] ? rows[0] : null;
    const storagePath = row ? row[pathField] : null;
    if (!storagePath) return sendError(res, 404, "File not found.");
    const signed = await storageSignedUrl(storagePath);
    if (!signed) return sendError(res, 404, "Could not sign file URL.");
    res.statusCode = 302;
    res.setHeader("Location", signed);
    res.end();
  } catch (e) {
    const msg = e && e.message ? e.message : String(e || "Failed to resolve file URL.");
    try {
      return sendError(res, 500, msg);
    } catch (sendErr) {
      // Last-resort guard: never let the route crash on error formatting.
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ message: msg }));
    }
  }
};
