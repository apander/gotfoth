const { dbSelect } = require("../../_lib/db");
const { sendJson, sendError, methodNotAllowed } = require("../../_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  try {
    const items = await dbSelect("boundaries", "select=*&order=paper_key.asc");
    return sendJson(res, 200, { items });
  } catch (e) {
    return sendError(res, 500, e.message || "Failed to fetch boundaries.");
  }
};
