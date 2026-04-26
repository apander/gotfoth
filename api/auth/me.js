const { sendJson, methodNotAllowed } = require("../_lib/http");
const { authFromRequest, payload } = require("../_lib/authSimple");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const auth = await authFromRequest(req);
  return sendJson(res, 200, { user: payload(auth) });
};
