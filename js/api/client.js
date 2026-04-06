(function (w) {
    const G = w.GF;
    G.pbGet = async function (path) {
        const res = await fetch(`${G.PB_URL}${path}`);
        if (!res.ok) throw new Error(`${path} ${res.status}`);
        return res.json();
    };
    G.pbPatchJson = async function (collection, id, body) {
        const res = await fetch(`${G.PB_URL}/api/collections/${collection}/records/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`PATCH ${id} ${res.status}`);
        return res.json();
    };
})(window);
