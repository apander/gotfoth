(function (w) {
    const G = w.GF;
    G.fetchPapersSorted = async function () {
        const data = await G.pbGet("/api/collections/papers/records?sort=scheduled_date&perPage=500");
        return data.items || [];
    };
    G.fetchGradedPapersSorted = async function () {
        const items = await G.fetchPapersSorted();
        return items.filter((p) => G.isGraded(p.status));
    };
    G.fileUrl = function (paper, field) {
        if (!paper || !paper.id || !field) return null;
        const name = paper[field];
        const pathField = field + "_path";
        if (!name && !paper[pathField]) return null;
        const base = G.API_BASE != null ? String(G.API_BASE) : "";
        return `${base}/api/files/papers/${encodeURIComponent(String(paper.id))}/${encodeURIComponent(String(field))}`;
    };
    G.createPaperRecord = async function (formData) {
        const base = G.API_BASE != null ? String(G.API_BASE) : "";
        return fetch(`${base}/api/collections/papers/records`, {
            method: "POST",
            body: formData,
            credentials: "include",
        });
    };
    G.patchPaperRecord = function (id, body) {
        return G.pbPatchJson("papers", id, body);
    };
    G.patchPaperRecordMultipart = async function (id, formData) {
        const base = G.API_BASE != null ? String(G.API_BASE) : "";
        const res = await fetch(`${base}/api/collections/papers/records/${encodeURIComponent(String(id))}`, {
            method: "PATCH",
            body: formData,
            credentials: "include",
        });
        if (!res.ok) {
            const raw = await res.text();
            const detail = G.pbErrorDetailFromRaw(raw);
            throw new Error("PATCH papers/" + id + " HTTP " + res.status + (detail ? " — " + detail : ""));
        }
        return res.json();
    };
    G.deletePaperRecord = async function (id) {
        const base = G.API_BASE != null ? String(G.API_BASE) : "";
        const res = await fetch(`${base}/api/collections/papers/records/${encodeURIComponent(String(id))}`, {
            method: "DELETE",
            credentials: "include",
        });
        if (!res.ok) throw new Error("DELETE " + id + " " + res.status);
    };
})(window);
