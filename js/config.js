(function (w) {
    w.GF = w.GF || {};
    const G = w.GF;
    /** Vercel-hosted API base (same-origin by default). */
    G.API_BASE = "";
    /** Legacy name retained for compatibility in older helpers. */
    G.PB_URL = "";
    G.STATUS_GRADED = "Marked";
    G.STATUS_PLANNED = "Planned";
    G.STATUS_COMPLETED = "Completed";
    G.EXAM_SETTING_KEYS = [
        { key: "bus_p1_date", label: "Business P1", color: "bg-emerald-500" },
        { key: "bus_p2_date", label: "Business P2", color: "bg-emerald-500" },
        { key: "psy_p1_date", label: "Psychology P1", color: "bg-blue-500" },
        { key: "psy_p2_date", label: "Psychology P2", color: "bg-blue-500" },
    ];
    /** Past-paper cohort grid in Backlog view */
    G.BACKLOG_YEAR_MIN = 2016;
    G.BACKLOG_YEAR_MAX = 2024;
    /** Years intentionally excluded from backlog/performance (e.g., no exam papers published). */
    G.BACKLOG_NO_PAPERS_YEARS = [2021];

    /** PocketBase date when no sitting date yet (upload to vault without scheduling). */
    G.SCHEDULE_TBD_PREFIX = "2099-12-31";

    /** Must match `papers.full_yaml` max length rule in PocketBase; overflow goes to `file_marking_yaml`. */
    G.FULL_YAML_TEXT_MAX = 5000;
    G.MOBILE_READONLY_MAX_WIDTH = 767;

    G.isUnscheduledPaper = function (paper) {
        const d = paper && paper.scheduled_date;
        return !d || String(d).startsWith(G.SCHEDULE_TBD_PREFIX);
    };

    G.formatScheduledDateForUi = function (paper) {
        if (!paper || G.isUnscheduledPaper(paper)) return "";
        const raw = String(paper.scheduled_date || "");
        if (!raw) return "";
        const ymd = raw.slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return raw;
        const dt = new Date(ymd + "T12:00:00Z");
        if (Number.isNaN(dt.getTime())) return ymd;
        return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    };

    /** Local calendar YYYY-MM-DD (settings / exams shown on action-plan calendar). */
    G.dateToYmdLocal = function (d) {
        return (
            d.getFullYear() +
            "-" +
            String(d.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(d.getDate()).padStart(2, "0")
        );
    };
})(window);
