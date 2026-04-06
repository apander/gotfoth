(function (w) {
    const G = w.GF;
    G.letterGrade = function (paper, boundaries) {
        const b = boundaries.find((x) => x.paper_key === paper.paper_type);
        if (!b || paper.score == null) return "N/A";
        const rawMark = (paper.score / 100) * b.max_mark;
        if (rawMark >= b.a) return "A";
        if (rawMark >= b.b) return "B";
        if (rawMark >= b.c) return "C";
        if (rawMark >= b.d) return "D";
        if (rawMark >= b.e) return "E";
        return "U";
    };
})(window);
