const vercelBlobStorage = require("./providers/vercelBlobStorage");

function sanitizePathPart(v) {
  return String(v || "")
    .trim()
    .replace(/[^\w.\-]+/g, "_");
}

async function storageUpload(storagePath, bytes, contentType) {
  return vercelBlobStorage.storageUpload(storagePath, bytes, contentType);
}

async function storageSignedUrl(storagePath, expiresIn) {
  const raw = String(storagePath || "").trim();
  // Mixed-migration safety: if DB already stores absolute URL, return it directly
  // regardless of active backend selection.
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return vercelBlobStorage.storageSignedUrl(storagePath, expiresIn);
}

module.exports = {
  sanitizePathPart,
  storageUpload,
  storageSignedUrl,
};
