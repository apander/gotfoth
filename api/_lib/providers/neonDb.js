const { Pool } = require("pg");
const { requireEnv } = require("../env");

let pool;

function getPool() {
  if (pool) return pool;
  const connectionString = requireEnv("NEON_DATABASE_URL");
  pool = new Pool({
    connectionString,
    max: 4,
    ssl: { rejectUnauthorized: false },
  });
  return pool;
}

function quoteIdent(name) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(String(name || ""))) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return `"${String(name).replace(/"/g, "\"\"")}"`;
}

function parseSimpleQuery(query) {
  const out = {
    select: "*",
    filters: [],
    order: null,
    limit: null,
  };
  const params = new URLSearchParams(String(query || ""));
  const select = params.get("select");
  if (select && select.trim()) out.select = select;
  const order = params.get("order");
  if (order && order.trim()) out.order = order.trim();
  const limit = params.get("limit");
  if (limit && /^\d+$/.test(limit)) out.limit = parseInt(limit, 10);
  params.forEach((value, key) => {
    if (key === "select" || key === "order" || key === "limit") return;
    if (!value.startsWith("eq.")) return;
    out.filters.push({ key, value: decodeURIComponent(value.slice(3)) });
  });
  return out;
}

function buildSelectSql(table, parsed) {
  const values = [];
  const where = [];
  parsed.filters.forEach((f) => {
    values.push(f.value);
    where.push(`${quoteIdent(f.key)} = $${values.length}`);
  });
  let sql = `select ${parsed.select} from ${quoteIdent(table)}`;
  if (where.length) sql += ` where ${where.join(" and ")}`;
  if (parsed.order) {
    const [rawCol, rawDir] = parsed.order.split(".");
    const dir = String(rawDir || "asc").toLowerCase() === "desc" ? "desc" : "asc";
    sql += ` order by ${quoteIdent(rawCol)} ${dir}`;
  }
  if (parsed.limit != null) {
    values.push(parsed.limit);
    sql += ` limit $${values.length}`;
  }
  return { sql, values };
}

async function dbSelect(table, query) {
  const parsed = parseSimpleQuery(query);
  const built = buildSelectSql(table, parsed);
  const result = await getPool().query(built.sql, built.values);
  return result.rows;
}

async function dbInsert(table, body, prefer = "return=representation") {
  const rows = Array.isArray(body) ? body : [body];
  if (!rows.length) return [];
  const keys = Object.keys(rows[0] || {});
  if (!keys.length) throw new Error("Cannot insert an empty object.");
  const values = [];
  const valuesSql = rows
    .map((row, rowIdx) => {
      const placeholders = keys.map((k, colIdx) => {
        values.push(row[k]);
        return `$${rowIdx * keys.length + colIdx + 1}`;
      });
      return `(${placeholders.join(", ")})`;
    })
    .join(", ");
  const sql =
    `insert into ${quoteIdent(table)} (${keys.map(quoteIdent).join(", ")}) values ${valuesSql}` +
    (prefer.includes("return=minimal") ? "" : " returning *");
  const result = await getPool().query(sql, values);
  return result.rows;
}

async function dbPatch(table, id, body, prefer = "return=representation") {
  const keys = Object.keys(body || {});
  if (!keys.length) return [];
  const values = [];
  const sets = keys.map((k, idx) => {
    values.push(body[k]);
    return `${quoteIdent(k)} = $${idx + 1}`;
  });
  values.push(id);
  const sql =
    `update ${quoteIdent(table)} set ${sets.join(", ")} where id = $${values.length}` +
    (prefer.includes("return=minimal") ? "" : " returning *");
  const result = await getPool().query(sql, values);
  return result.rows;
}

async function dbDelete(table, id) {
  await getPool().query(`delete from ${quoteIdent(table)} where id = $1`, [id]);
}

module.exports = {
  dbSelect,
  dbInsert,
  dbPatch,
  dbDelete,
};
