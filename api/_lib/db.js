const { strEnv } = require("./env");
const supabaseDb = require("./providers/supabaseDb");
const neonDb = require("./providers/neonDb");

function activeDbProvider() {
  const v = String(strEnv("DATA_BACKEND", "supabase")).trim().toLowerCase();
  if (v === "neon") return neonDb;
  return supabaseDb;
}

async function dbSelect(table, query) {
  return activeDbProvider().dbSelect(table, query);
}

async function dbInsert(table, body, prefer) {
  return activeDbProvider().dbInsert(table, body, prefer);
}

async function dbPatch(table, id, body, prefer) {
  return activeDbProvider().dbPatch(table, id, body, prefer);
}

async function dbDelete(table, id) {
  return activeDbProvider().dbDelete(table, id);
}

module.exports = {
  dbSelect,
  dbInsert,
  dbPatch,
  dbDelete,
};
