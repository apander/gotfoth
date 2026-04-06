(function (w) {
    const G = w.GF;
    let cache = {};
    G.loadSettings = async function () {
        const data = await G.pbGet("/api/collections/settings/records?perPage=500");
        cache = {};
        for (const row of data.items || []) {
            if (row.key && row.value) cache[row.key] = row.value;
        }
        return cache;
    };
    G.getSettings = function () {
        return cache;
    };
    G.getSettingDate = function (key) {
        const v = cache[key];
        return v ? new Date(v) : null;
    };
})(window);
