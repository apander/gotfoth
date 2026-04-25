const path = require("node:path");
const { put } = require("@vercel/blob");
const { requireEnv } = require("../env");

function blobToken() {
  return requireEnv("BLOB_READ_WRITE_TOKEN");
}

async function storageUpload(storagePath, bytes, contentType) {
  const key = String(storagePath || "").replace(/^\/+/, "");
  if (!key) throw new Error("Invalid blob object key.");
  const result = await put(key, bytes, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    token: blobToken(),
    contentType: contentType || "application/octet-stream",
  });
  return result && result.url ? result.url : key;
}

async function storageSignedUrl(storagePath) {
  const s = String(storagePath || "");
  if (!s) return null;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  const storeBase = process.env.BLOB_PUBLIC_BASE_URL || "";
  if (!storeBase) return null;
  return `${storeBase.replace(/\/$/, "")}/${s.replace(/^\/+/, "")}`;
}

function normalizeBlobKey(recordId, inputField, originalFilename) {
  const ext = path.extname(originalFilename || "").toLowerCase();
  const safeBase = String(path.basename(originalFilename || inputField, ext)).replace(/[^\w.\-]+/g, "_");
  return `${recordId}/${inputField}/${Date.now()}_${safeBase || inputField}${ext || ""}`;
}

module.exports = {
  storageUpload,
  storageSignedUrl,
  normalizeBlobKey,
};
