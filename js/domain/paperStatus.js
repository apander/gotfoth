(function (w) {
    const G = w.GF;
    G.isGraded = function (status) {
        return status === G.STATUS_GRADED || status === "Graded" || status === "Marked";
    };
    G.needsGrading = function (status) {
        return !G.isGraded(status);
    };
    G.depositStatus = function (opts) {
        if (opts.hasGrading) return G.STATUS_GRADED;
        if (opts.hasAttempt) return G.STATUS_COMPLETED;
        return G.STATUS_PLANNED;
    };
})(window);
