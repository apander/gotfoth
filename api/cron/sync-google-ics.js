const { dbInsert, dbSelect, dbDelete } = require("../_lib/supabase");
const { sendJson, sendError, methodNotAllowed } = require("../_lib/http");

function assertAuthorized(req) {
  const token = process.env.SYNC_CRON_TOKEN;
  if (!token) return true;
  const auth = String(req.headers.authorization || "");
  if (auth === `Bearer ${token}`) return true;
  if (String(req.query && req.query.token) === token) return true;
  return false;
}

function unfoldIcsLines(text) {
  const raw = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) out[out.length - 1] += line.slice(1);
    else out.push(line);
  }
  return out;
}

function parseProp(line) {
  const idx = line.indexOf(":");
  if (idx < 0) return { name: line.toUpperCase(), params: {}, value: "" };
  const left = line.slice(0, idx);
  const value = line.slice(idx + 1).trim();
  const parts = left.split(";");
  const name = parts[0].trim().toUpperCase();
  const params = {};
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf("=");
    if (eq < 0) continue;
    params[parts[i].slice(0, eq).trim().toUpperCase()] = parts[i].slice(eq + 1).trim();
  }
  return { name, params, value };
}

function parseDate(value, params) {
  if (!value) return null;
  const asDate = (params.VALUE || "").toUpperCase() === "DATE" || /^\d{8}$/.test(value);
  if (asDate) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const dt = value.endsWith("Z") ? value.slice(0, -1) : value;
  if (dt.length < 15) return null;
  return `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`;
}

function parseEvents(icsText) {
  const lines = unfoldIcsLines(icsText);
  const events = [];
  let inEvent = false;
  let cur = {};
  for (const line of lines) {
    const up = line.trim().toUpperCase();
    if (up === "BEGIN:VEVENT") {
      inEvent = true;
      cur = {};
      continue;
    }
    if (up === "END:VEVENT") {
      inEvent = false;
      if (cur.date && cur.label) events.push(cur);
      cur = {};
      continue;
    }
    if (!inEvent) continue;
    const { name, params, value } = parseProp(line);
    if (name === "SUMMARY") cur.label = value;
    if (name === "UID") cur.uid = value;
    if (name === "DTSTART") {
      const d = parseDate(value, params);
      if (d) cur.date = d;
    }
  }
  return events;
}

function windowed(events, pastDays, futureDays) {
  const now = new Date();
  const min = new Date(now);
  min.setDate(min.getDate() - pastDays);
  const max = new Date(now);
  max.setDate(max.getDate() + futureDays);
  return events.filter((ev) => {
    const d = new Date(`${ev.date}T00:00:00`);
    return d >= min && d <= max;
  });
}

function digest(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);
  if (!assertAuthorized(req)) return sendError(res, 401, "Unauthorized.");
  const icsUrl = process.env.GCAL_ICS_URL;
  if (!icsUrl) return sendError(res, 400, "Missing GCAL_ICS_URL.");

  try {
    const prefix = process.env.GCAL_EVENT_KEY_PREFIX || "gcal_evt_";
    const syncStatusKey = process.env.GCAL_SYNC_STATUS_KEY || "gcal_sync_status";
    const pastDays = parseInt(process.env.GCAL_SYNC_PAST_DAYS || "30", 10);
    const futureDays = parseInt(process.env.GCAL_SYNC_FUTURE_DAYS || "365", 10);
    const timeoutMs = parseInt(process.env.SYNC_HTTP_TIMEOUT_SEC || "20", 10) * 1000;

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const feedRes = await fetch(icsUrl, { signal: ctl.signal });
    clearTimeout(timer);
    if (!feedRes.ok) return sendError(res, 502, `ICS fetch failed: ${feedRes.status}`);
    const text = await feedRes.text();
    const events = parseEvents(text);
    const wanted = windowed(events, pastDays, futureDays);
    const wantedByKey = {};
    for (const ev of wanted) {
      const base = ev.uid || `${ev.date}:${ev.label}`;
      const key = `${prefix}${digest(base)}`;
      wantedByKey[key] = JSON.stringify({
        date: ev.date,
        label: ev.label,
        uid: ev.uid || "",
        source: "google_ics",
      });
    }

    const existing = await dbSelect("settings", "select=id,key,value&limit=5000");
    const managed = existing.filter((r) => String(r.key || "").startsWith(prefix));
    const existingByKey = {};
    for (const row of existing) existingByKey[row.key] = row;

    let creates = 0;
    let updates = 0;
    let deletes = 0;

    for (const [key, value] of Object.entries(wantedByKey)) {
      const row = existingByKey[key];
      if (!row) {
        await dbInsert("settings", [{ key, value }], "return=minimal");
        creates++;
      } else if (String(row.value || "") !== value) {
        await dbInsert("settings", [{ key, value }], "resolution=merge-duplicates,return=minimal");
        updates++;
      }
    }

    const wantedKeys = new Set(Object.keys(wantedByKey));
    for (const row of managed) {
      if (!wantedKeys.has(String(row.key))) {
        await dbDelete("settings", row.id);
        deletes++;
      }
    }

    await dbInsert(
      "settings",
      [
        {
          key: syncStatusKey,
          value: JSON.stringify({
            last_sync: new Date().toISOString(),
            events_total: events.length,
            events_in_window: Object.keys(wantedByKey).length,
            source: "google_ics",
          }),
        },
      ],
      "resolution=merge-duplicates,return=minimal"
    );

    return sendJson(res, 200, {
      ok: true,
      creates,
      updates,
      deletes,
      totalEvents: events.length,
      inWindow: Object.keys(wantedByKey).length,
    });
  } catch (e) {
    return sendError(res, 500, e.message || "Google ICS sync failed.");
  }
};
