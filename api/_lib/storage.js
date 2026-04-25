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
  return activeStorageProvider().storageSignedUrl(storagePath, expiresIn);
}

module.exports = {
  sanitizePathPart,
  storageUpload,
  storageSignedUrl,
};
