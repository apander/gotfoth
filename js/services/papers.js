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
        const name = paper[field];
        if (!name) return null;
        return `${G.PB_URL}/api/files/${paper.collectionId}/${paper.id}/${name}`;
    };
    G.createPaperRecord = async function (formData) {
        return fetch(`${G.PB_URL}/api/collections/papers/records`, {
            method: "POST",
            body: formData,
        });
    };
    G.patchPaperRecord = function (id, body) {
        return G.pbPatchJson("papers", id, body);
    };
    G.patchPaperRecordMultipart = async function (id, formData) {
        const res = await fetch(`${G.PB_URL}/api/collections/papers/records/${encodeURIComponent(String(id))}`, {
            method: "PATCH",
            body: formData,
        });
        if (!res.ok) {
            const raw = await res.text();
            const detail = G.pbErrorDetailFromRaw(raw);
            throw new Error("PATCH papers/" + id + " HTTP " + res.status + (detail ? " — " + detail : ""));
        }
        return res.json();
    };
    G.deletePaperRecord = async function (id) {
        const res = await fetch(`${G.PB_URL}/api/collections/papers/records/${encodeURIComponent(String(id))}`, {
            method: "DELETE",
        });
        if (!res.ok) throw new Error("DELETE " + id + " " + res.status);
    };
})(window);
