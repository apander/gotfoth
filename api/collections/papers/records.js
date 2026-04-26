const { randomUUID } = require("node:crypto");
const { dbInsert, dbSelect } = require("../../_lib/db");
const { parseForm } = require("../../_lib/form");
const { normalizePaperRow, fieldsToPaperPatch, uploadFilesAndBuildPatch } = require("../../_lib/papers");
const { sendJson, sendError, methodNotAllowed } = require("../../_lib/http");
const { requireAuth } = require("../../_lib/authSimple");

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const perPage = Math.max(1, Math.min(parseInt(String(req.query.perPage || "500"), 10) || 500, 2000));
      const sort = String(req.query.sort || "scheduled_date");
      const sortKey = sort.startsWith("-") ? sort.slice(1) : sort;
      const dir = sort.startsWith("-") ? "desc" : "asc";
      const allowedSort = ["scheduled_date", "created_at", "updated_at", "score", "year"];
      const orderCol = allowedSort.includes(sortKey) ? sortKey : "scheduled_date";
      const items = await dbSelect("papers", `select=*&order=${orderCol}.${dir}&limit=${perPage}`);
      return sendJson(res, 200, { items: items.map(normalizePaperRow) });
    } catch (e) {
      return sendError(res, 500, e.message || "Failed to fetch papers.");
    }
  }

  if (req.method === "POST") {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const { fields, files } = await parseForm(req);
      const id = randomUUID();
      const basePatch = fieldsToPaperPatch(fields);
      const filePatch = await uploadFilesAndBuildPatch(id, files);
      const payload = {
        id,
        ...basePatch,
        ...filePatch,
      };
      const rows = await dbInsert("papers", [payload]);
      const row = rows && rows[0] ? rows[0] : payload;
      return sendJson(res, 201, normalizePaperRow(row));
    } catch (e) {
      return sendError(res, 500, e.message || "Failed to create paper record.");
    }
  }

  return methodNotAllowed(res, ["GET", "POST"]);
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
