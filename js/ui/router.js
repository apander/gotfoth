(function (w) {
    const G = w.GF;
    const viewLoaders = {
        dashboard: null,
        action: null,
        vault: null,
        progress: null,
    };
    G.registerViewLoader = function (viewId, fn) {
        viewLoaders[viewId] = fn;
    };
    G.showView = function (viewId) {
        document.querySelectorAll(".view-content").forEach((v) => v.classList.add("hidden"));
        const el = document.getElementById("view-" + viewId);
        if (el) el.classList.remove("hidden");

        document.querySelectorAll(".nav-btn").forEach((btn) => {
            btn.classList.remove("bg-slate-800", "text-blue-400");
            btn.classList.add("text-slate-400");
        });
        const activeBtn = document.getElementById("btn-" + viewId);
        if (activeBtn) activeBtn.classList.add("bg-slate-800", "text-blue-400");

        const loader = viewLoaders[viewId];
        if (typeof loader === "function") loader();
    };
})(window);
