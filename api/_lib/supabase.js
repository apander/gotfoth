const db = require("./db");
const storage = require("./storage");
const { getSupabaseDbConfig } = require("./providers/supabaseDb");

function getConfig() {
  const cfg = getSupabaseDbConfig();
  return {
    url: cfg.url,
    serviceRoleKey: cfg.serviceRoleKey,
    signedUrlTtl: parseInt(String(process.env.SIGNED_URL_TTL_SECONDS || "3600"), 10) || 3600,
  };
}

module.exports = {
  getConfig,
  dbSelect: db.dbSelect,
  dbInsert: db.dbInsert,
  dbPatch: db.dbPatch,
  dbDelete: db.dbDelete,
  storageUpload: storage.storageUpload,
  storageSignedUrl: storage.storageSignedUrl,
  sanitizePathPart: storage.sanitizePathPart,
};
