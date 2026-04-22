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
    Authorization: `Bearer ${serviceRoleKey}`,
  };
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
  if (!json || !json.signedURL) return null;
  return `${url}/storage/v1${json.signedURL}`;
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
