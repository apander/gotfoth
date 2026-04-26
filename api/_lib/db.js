const neonDb = require("./providers/neonDb");

async function dbSelect(table, query) {
  return neonDb.dbSelect(table, query);
}

async function dbInsert(table, body, prefer) {
  return neonDb.dbInsert(table, body, prefer);
}

async function dbPatch(table, id, body, prefer) {
  return neonDb.dbPatch(table, id, body, prefer);
}

async function dbDelete(table, id) {
  return neonDb.dbDelete(table, id);
}

module.exports = {
  dbSelect,
  dbInsert,
  dbPatch,
  dbDelete,
};
