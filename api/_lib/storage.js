const { strEnv } = require("./env");
const supabaseStorage = require("./providers/supabaseStorage");
const vercelBlobStorage = require("./providers/vercelBlobStorage");

function sanitizePathPart(v) {
  return String(v || "")
    .trim()
    .replace(/[^\w.\-]+/g, "_");
}

function activeStorageProvider() {
  const v = String(strEnv("FILE_BACKEND", "supabase")).trim().toLowerCase();
  if (v === "blob" || v === "vercel-blob" || v === "vercel_blob") return vercelBlobStorage;
  return supabaseStorage;
}

async function storageUpload(storagePath, bytes, contentType) {
  return activeStorageProvider().storageUpload(storagePath, bytes, contentType);
}

async function storageSignedUrl(storagePath, expiresIn) {
  const raw = String(storagePath || "").trim();
  // Mixed-migration safety: if DB already stores absolute URL, return it directly
  // regardless of active backend selection.
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return activeStorageProvider().storageSignedUrl(storagePath, expiresIn);
}

module.exports = {
  sanitizePathPart,
  storageUpload,
  storageSignedUrl,
};
