(function (w) {
    const G = w.GF;

    /** PocketBase error JSON: flatten `data` field messages for alerts and logs. */
    G.pbErrorDetailFromRaw = function (raw) {
        if (!raw || typeof raw !== "string") return "";
        const t = raw.trim();
        if (!t) return "";
        try {
            const j = JSON.parse(t);
            const parts = [];
            if (j.data && typeof j.data === "object" && !Array.isArray(j.data)) {
                Object.keys(j.data).forEach(function (key) {
                    const v = j.data[key];
                    if (v && typeof v === "object" && typeof v.message === "string") parts.push(key + ": " + v.message);
                    else parts.push(key + ": " + JSON.stringify(v));
                });
            }
            if (parts.length) return parts.join("\n");
            if (typeof j.message === "string" && j.message) return j.message;
        } catch (ignore) {}
        return t.length > 600 ? t.slice(0, 600) + "…" : t;
    };

    G.pbGet = async function (path) {
        const base = G.API_BASE != null ? String(G.API_BASE) : "";
        const res = await fetch(`${base}${path}`);
        if (!res.ok) throw new Error(`${path} ${res.status}`);
        return res.json();
    };
    G.pbPatchJson = async function (collection, id, body) {
        const base = G.API_BASE != null ? String(G.API_BASE) : "";
        const res = await fetch(`${base}/api/collections/${collection}/records/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const raw = await res.text();
            const detail = G.pbErrorDetailFromRaw(raw);
            throw new Error("PATCH " + collection + "/" + id + " HTTP " + res.status + (detail ? " — " + detail : ""));
        }
        return res.json();
    };
})(window);
