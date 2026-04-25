const { requireEnv, intEnv } = require("../env");

function getSupabaseStorageConfig() {
  const url = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const signedUrlTtl = intEnv("SIGNED_URL_TTL_SECONDS", 3600);
  return { url, serviceRoleKey, signedUrlTtl };
}

function authHeaders(contentType) {
  const { serviceRoleKey } = getSupabaseStorageConfig();
  const out = {
    apikey: serviceRoleKey,
  };
  const looksLikeJwt = /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(serviceRoleKey);
  if (looksLikeJwt) out.Authorization = `Bearer ${serviceRoleKey}`;
  if (contentType) out["Content-Type"] = contentType;
  return out;
}

function splitStoragePath(storagePath) {
  const p = String(storagePath || "");
  const idx = p.indexOf("/");
  if (idx <= 0) return { bucket: "", objectPath: "" };
  return {
    bucket: p.slice(0, idx),
    objectPath: p.slice(idx + 1),
  };
}

function encodeStorageObjectPath(objectPath) {
  return String(objectPath || "")
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

async function sbFetch(path, opts) {
  const { url } = getSupabaseStorageConfig();
  const res = await fetch(`${url}${path}`, opts);
  if (!res.ok) {
    const raw = await res.text();
    throw new Error(`${path} ${res.status} ${raw || ""}`.trim());
  }
  return res;
}

async function storageUpload(storagePath, bytes, contentType) {
  const { bucket, objectPath } = splitStoragePath(storagePath);
  if (!bucket || !objectPath) throw new Error("Invalid storage path.");
  await sbFetch(`/storage/v1/object/${bucket}/${encodeStorageObjectPath(objectPath)}`, {
    method: "POST",
    headers: {
      ...authHeaders(contentType || "application/octet-stream"),
      "x-upsert": "true",
    },
    body: bytes,
  });
  return storagePath;
}

async function storageSignedUrl(storagePath, expiresIn) {
  const { url, signedUrlTtl } = getSupabaseStorageConfig();
  const { bucket, objectPath } = splitStoragePath(storagePath);
  if (!bucket || !objectPath) return null;
  const res = await sbFetch(`/storage/v1/object/sign/${bucket}/${encodeStorageObjectPath(objectPath)}`, {
    method: "POST",
    headers: authHeaders("application/json"),
    body: JSON.stringify({ expiresIn: expiresIn || signedUrlTtl }),
  });
  const json = await res.json();
  const rawSigned =
    (json && (json.signedURL || json.signedUrl || json.signed_url)) ||
    (json && json.data && (json.data.signedURL || json.data.signedUrl || json.data.signed_url)) ||
    null;
  const signed = typeof rawSigned === "string" ? rawSigned : null;
  if (!signed) return null;
  if (signed.startsWith("http://") || signed.startsWith("https://")) return signed;
  if (signed.startsWith("/storage/v1")) return `${url}${signed}`;
  if (signed.startsWith("/object/")) return `${url}/storage/v1${signed}`;
  if (signed.startsWith("/")) return `${url}${signed}`;
  return `${url}/storage/v1/${signed}`;
}

module.exports = {
  storageUpload,
  storageSignedUrl,
};
