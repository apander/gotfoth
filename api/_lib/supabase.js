const { requireEnv, intEnv } = require("./env");

function getConfig() {
  const url = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const signedUrlTtl = intEnv("SIGNED_URL_TTL_SECONDS", 3600);
  return { url, serviceRoleKey, signedUrlTtl };
}

function authHeaders(contentType) {
  const { serviceRoleKey } = getConfig();
  const out = {
    apikey: serviceRoleKey,
  };
  // Legacy keys are JWTs (eyJ...); new platform keys are opaque (sb_secret_...).
  // Storage endpoints can fail when opaque keys are forced into Authorization bearer.
  const looksLikeJwt = /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(serviceRoleKey);
  if (looksLikeJwt) out.Authorization = `Bearer ${serviceRoleKey}`;
  if (contentType) out["Content-Type"] = contentType;
  return out;
}

async function sbFetch(path, opts) {
  const { url } = getConfig();
  const res = await fetch(`${url}${path}`, opts);
  if (!res.ok) {
    const raw = await res.text();
    throw new Error(`${path} ${res.status} ${raw || ""}`.trim());
  }
  return res;
}

async function dbSelect(table, query) {
  const res = await sbFetch(`/rest/v1/${table}?${query}`, {
    headers: authHeaders(),
  });
  return res.json();
}

async function dbInsert(table, body, prefer = "return=representation") {
  const res = await sbFetch(`/rest/v1/${table}`, {
    method: "POST",
    headers: {
      ...authHeaders("application/json"),
      Prefer: prefer,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function dbPatch(table, id, body, prefer = "return=representation") {
  const res = await sbFetch(`/rest/v1/${table}?id=eq.${encodeURIComponent(String(id))}`, {
    method: "PATCH",
    headers: {
      ...authHeaders("application/json"),
      Prefer: prefer,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function dbDelete(table, id) {
  await sbFetch(`/rest/v1/${table}?id=eq.${encodeURIComponent(String(id))}`, {
    method: "DELETE",
    headers: {
      ...authHeaders(),
      Prefer: "return=minimal",
    },
  });
}

function sanitizePathPart(v) {
  return String(v || "")
    .trim()
    .replace(/[^\w.\-]+/g, "_");
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
}

async function storageSignedUrl(storagePath, expiresIn) {
  const { url, signedUrlTtl } = getConfig();
  const { bucket, objectPath } = splitStoragePath(storagePath);
  if (!bucket || !objectPath) return null;
  const res = await sbFetch(`/storage/v1/object/sign/${bucket}/${encodeStorageObjectPath(objectPath)}`, {
    method: "POST",
    headers: authHeaders("application/json"),
    body: JSON.stringify({ expiresIn: expiresIn || signedUrlTtl }),
  });
  const json = await res.json();

  // Supabase versions differ slightly in JSON shape; support common variants.
  const rawSigned =
    (json && (json.signedURL || json.signedUrl || json.signed_url)) ||
    (json && json.data && (json.data.signedURL || json.data.signedUrl || json.data.signed_url)) ||
    null;

  let signed = "";
  if (typeof rawSigned === "string") signed = rawSigned;
  else if (rawSigned && typeof rawSigned === "object") {
    signed =
      typeof rawSigned.signedUrl === "string"
        ? rawSigned.signedUrl
        : typeof rawSigned.signedURL === "string"
          ? rawSigned.signedURL
          : typeof rawSigned.url === "string"
            ? rawSigned.url
            : "";
  }
  if (!signed) return null;

  // Sometimes `signedUrl` is already absolute; sometimes it's a path starting with `/object/sign/...`
  if (signed.startsWith("http://") || signed.startsWith("https://")) return signed;
  if (signed.startsWith("/storage/v1")) return `${url}${signed}`;
  // Hosted Supabase commonly returns `/object/sign/...` tokens; those must be under `/storage/v1`.
  if (signed.startsWith("/object/")) return `${url}/storage/v1${signed}`;
  if (signed.startsWith("/")) return `${url}${signed}`;
  return `${url}/storage/v1/${signed}`;
}

module.exports = {
  getConfig,
  dbSelect,
  dbInsert,
  dbPatch,
  dbDelete,
  storageUpload,
  storageSignedUrl,
  sanitizePathPart,
};
