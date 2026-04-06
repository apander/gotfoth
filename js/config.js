(function (w) {
    w.GF = w.GF || {};
    const G = w.GF;
    G.PB_URL = "http://mycloudex2ultra.local:8090";
    G.STATUS_GRADED = "Marked";
    G.STATUS_PLANNED = "Planned";
    G.STATUS_COMPLETED = "Completed";
    G.EXAM_SETTING_KEYS = [
        { key: "bus_p1_date", label: "Business P1", color: "bg-emerald-500" },
        { key: "bus_p2_date", label: "Business P2", color: "bg-emerald-500" },
        { key: "psy_p1_date", label: "Psychology P1", color: "bg-blue-500" },
        { key: "psy_p2_date", label: "Psychology P2", color: "bg-blue-500" },
    ];
    /** Synced from Google iCal feed into `settings` collection. */
    G.GCAL_EVENT_KEY_PREFIX = "gcal_evt_";
    G.GCAL_SYNC_STATUS_KEY = "gcal_sync_status";

    /** Past-paper cohort grid in Backlog view */
    G.BACKLOG_YEAR_MIN = 2016;
    G.BACKLOG_YEAR_MAX = 2024;
    /** Years intentionally excluded from backlog/performance (e.g., no exam papers published). */
    G.BACKLOG_NO_PAPERS_YEARS = [2021];

    /** PocketBase date when no sitting date yet (upload to vault without scheduling). */
    G.SCHEDULE_TBD_PREFIX = "2099-12-31";

    G.isUnscheduledPaper = function (paper) {
        const d = paper && paper.scheduled_date;
        return !d || String(d).startsWith(G.SCHEDULE_TBD_PREFIX);
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
