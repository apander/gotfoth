(function (w) {
    const G = w.GF;

    /** @param {Record<string, unknown>} paper */
    G.parsePaperYear = function (paper) {
        const v = paper.year;
        if (v == null || v === "") return null;
        const n = parseInt(String(v).trim(), 10);
        return Number.isFinite(n) ? n : null;
    };

    /** P1/P2 from paper_type (e.g. Business P1). */
    G.paperNumFromType = function (paper) {
        const t = String(paper.paper_type || "").toLowerCase();
        if (/(^|[\s/._-])p1([\s/._-]|$)/.test(t)) return 1;
        if (/(^|[\s/._-])p2([\s/._-]|$)/.test(t)) return 2;
        return null;
    };

    G.BACKLOG_SUBJECTS = ["Psychology", "Business Studies"];

    /**
     * Best matching paper for a cohort cell (year × subject × P1/P2).
     * @param {Array<Record<string, unknown>>} papers
     * @param {number} year
     * @param {string} subject
     * @param {1|2} paperNum
     */
    G.findPaperForCohortSlot = function (papers, year, subject, paperNum) {
        const matches = papers.filter(function (p) {
            return (
                G.parsePaperYear(p) === year &&
                p.subject === subject &&
                G.paperNumFromType(p) === paperNum
            );
        });
        if (!matches.length) return null;
        matches.sort(function (a, b) {
            return G.backlogStatusRank(b) - G.backlogStatusRank(a);
        });
        return matches[0];
    };
})(window);
