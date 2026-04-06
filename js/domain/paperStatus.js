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

    /**
     * Backlog / History labels (PocketBase still uses Planned, Completed, Marked).
     * @param {Record<string, unknown> | null} paper
     * @returns {"To be uploaded"|"To be scheduled"|"Scheduled"|"Complete"|"Marked"}
     */
    G.backlogUxStatus = function (paper) {
        if (!paper) return "To be uploaded";
        const s = String(paper.status || "");
        if (G.isGraded(s)) return "Marked";
        if (G.isUnscheduledPaper(paper)) return "To be scheduled";
        if (s === G.STATUS_COMPLETED || s === "Complete") return "Complete";
        if (s === G.STATUS_PLANNED || s === "Planned" || s === "Scheduled") return "Scheduled";
        return "Scheduled";
    };

    /** Sort priority for picking one record when several match a backlog slot (higher = preferred). */
    G.backlogStatusRank = function (paper) {
        if (!paper) return 0;
        const s = String(paper.status || "");
        if (G.isGraded(s)) return 4;
        if (s === G.STATUS_COMPLETED || s === "Complete") return 3;
        if (s === G.STATUS_PLANNED || s === "Planned" || s === "Scheduled") return 2;
        return 1;
    };
})(window);
