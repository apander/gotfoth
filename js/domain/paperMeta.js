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

    /**
     * Human-readable label without `paper_title` — subject + Paper 1|2 + year.
     * Fallback when year or subject missing: still uses paper_type snippet if needed.
     */
    G.derivedPaperDisplayName = function (paper) {
        if (!paper) return "";
        var subject = String(paper.subject || "").trim();
        var n = G.paperNumFromType(paper);
        var paperPhrase = n === 1 ? "Paper 1" : n === 2 ? "Paper 2" : "";
        var yRaw = paper.year;
        var y =
            yRaw != null && yRaw !== ""
                ? String(yRaw).trim()
                : G.parsePaperYear(paper) != null
                  ? String(G.parsePaperYear(paper))
                  : "";
        var parts = [];
        if (subject) parts.push(subject);
        if (paperPhrase) parts.push(paperPhrase);
        else {
            var rawType = String(paper.paper_type || "").trim();
            if (rawType) parts.push(rawType);
        }
        if (y) parts.push(y);
        if (parts.length) return parts.join(" ");
        var legacy = String(paper.paper_title || "").trim();
        return legacy || "Paper";
    };

    /** Same as derivedPaperDisplayName from vault form parts (P1 / P2 from dropdown). */
    G.derivedPaperDisplayNameFromVaultFields = function (subject, partCode, yearVal) {
        var subj = String(subject || "").trim();
        var part = String(partCode || "").toUpperCase();
        var n = part === "P2" || part === "2" ? 2 : part === "P1" || part === "1" ? 1 : null;
        var paperPhrase = n === 1 ? "Paper 1" : n === 2 ? "Paper 2" : "";
        var y = yearVal != null && yearVal !== "" ? String(yearVal).trim() : "";
        var parts = [];
        if (subj) parts.push(subj);
        if (paperPhrase) parts.push(paperPhrase);
        if (y) parts.push(y);
        return parts.length ? parts.join(" ") : "—";
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
