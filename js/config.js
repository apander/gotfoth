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
