function sendJson(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message, data) {
  sendJson(res, status, {
    message,
    data: data || null,
  });
}

function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed.join(", "));
  return sendError(res, 405, "Method not allowed");
}

module.exports = {
  sendJson,
  sendError,
  methodNotAllowed,
};
