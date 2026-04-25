const { requireEnv } = require("../env");

function getSupabaseDbConfig() {
  const url = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return { url, serviceRoleKey };
}

function authHeaders(contentType) {
  const { serviceRoleKey } = getSupabaseDbConfig();
  const out = {
    apikey: serviceRoleKey,
  };
  const looksLikeJwt = /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(serviceRoleKey);
  if (looksLikeJwt) out.Authorization = `Bearer ${serviceRoleKey}`;
  if (contentType) out["Content-Type"] = contentType;
  return out;
}

async function sbFetch(path, opts) {
  const { url } = getSupabaseDbConfig();
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

module.exports = {
  getSupabaseDbConfig,
  dbSelect,
  dbInsert,
  dbPatch,
  dbDelete,
};
