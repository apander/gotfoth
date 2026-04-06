(function (w) {
    const G = w.GF;

    /** First boundaries row for a subject (P1; falls back to P2). Rows are the same per subject in PocketBase. */
    G.boundaryRowForSubject = function (boundaries, subjectStr) {
        const psych = String(subjectStr || "").includes("Psychology");
        const keys = psych ? ["Psychology P1", "Psychology P2"] : ["Business P1", "Business P2"];
        for (let i = 0; i < keys.length; i++) {
            const b = boundaries.find(function (x) {
                return x.paper_key === keys[i];
            });
            if (b) return b;
        }
        return null;
    };

    function gradeFromRawMark(b, rawMark) {
        if (!b) return "N/A";
        if (rawMark >= b.a) return "A";
        if (rawMark >= b.b) return "B";
        if (rawMark >= b.c) return "C";
        if (rawMark >= b.d) return "D";
        if (rawMark >= b.e) return "E";
        return "U";
    }

    /** @param {number} scorePercent 0–100 */
    G.letterGradeFromPercent = function (scorePercent, boundaries, subjectStr) {
        const b = G.boundaryRowForSubject(boundaries, subjectStr);
        if (!b || scorePercent == null || Number.isNaN(Number(scorePercent))) return "N/A";
        const rawMark = (Number(scorePercent) / 100) * Number(b.max_mark);
        return gradeFromRawMark(b, rawMark);
    };

    G.letterGrade = function (paper, boundaries) {
        const b = boundaries.find((x) => x.paper_key === paper.paper_type);
        if (!b || paper.score == null) return "N/A";
        const rawMark = (paper.score / 100) * b.max_mark;
        return gradeFromRawMark(b, rawMark);
    };
})(window);
