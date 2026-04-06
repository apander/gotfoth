(function (w) {
    const G = w.GF;
    let cache = [];
    G.loadBoundaries = async function () {
        const data = await G.pbGet("/api/collections/boundaries/records");
        cache = data.items || [];
        return cache;
    };
    G.getBoundaries = function () {
        return cache;
    };
})(window);
