const { dbDelete, dbPatch, dbSelect } = require("../../../_lib/db");
const { parseForm, readJsonBody } = require("../../../_lib/form");
const { normalizePaperRow, fieldsToPaperPatch, uploadFilesAndBuildPatch, FILE_TO_PATH_FIELD } = require("../../../_lib/papers");
const { sendJson, sendError, methodNotAllowed } = require("../../../_lib/http");
const { requireAuth } = require("../../../_lib/authSimple");

async function loadPaper(id) {
  const rows = await dbSelect("papers", `select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  return rows && rows.length ? rows[0] : null;
}

module.exports = async function handler(req, res) {
  const id = req.query && req.query.id ? String(req.query.id) : "";
  if (!id) return sendError(res, 400, "Missing paper id.");

  if (req.method === "PATCH") {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      let patch = {};
      const contentType = String(req.headers["content-type"] || "");
      if (contentType.includes("multipart/form-data")) {
        const { fields, files } = await parseForm(req);
        patch = fieldsToPaperPatch(fields);
        const filePatch = await uploadFilesAndBuildPatch(id, files);
        patch = { ...patch, ...filePatch };
      } else {
        patch = { ...(await readJsonBody(req)) };
      }

      // Compatibility: clearing file field by setting null.
      for (const pathField of Object.values(FILE_TO_PATH_FIELD)) {
        if (Object.prototype.hasOwnProperty.call(patch, pathField) && patch[pathField] == null) {
          patch[pathField] = null;
        }
      }

      const rows = await dbPatch("papers", id, patch);
      const row = rows && rows.length ? rows[0] : await loadPaper(id);
      return sendJson(res, 200, normalizePaperRow(row || { id, ...patch }));
    } catch (e) {
      return sendError(res, 500, e.message || "Failed to update paper.");
    }
  }

  if (req.method === "DELETE") {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      await dbDelete("papers", id);
      return sendJson(res, 204, {});
    } catch (e) {
      return sendError(res, 500, e.message || "Failed to delete paper.");
    }
  }

  if (req.method === "GET") {
    try {
      const row = await loadPaper(id);
      if (!row) return sendError(res, 404, "Paper not found.");
      return sendJson(res, 200, normalizePaperRow(row));
    } catch (e) {
      return sendError(res, 500, e.message || "Failed to fetch paper.");
    }
  }

  return methodNotAllowed(res, ["GET", "PATCH", "DELETE"]);
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
