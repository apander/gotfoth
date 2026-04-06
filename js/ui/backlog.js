(function (w) {
    const G = w.GF;

    function esc(s) {
        return String(s ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/"/g, "&quot;");
    }

    function statusCellClass(ux) {
        if (ux === "Marked") return "bg-emerald-50 text-emerald-900 border-emerald-200";
        if (ux === "Complete") return "bg-amber-50 text-amber-950 border-amber-200";
        if (ux === "Scheduled") return "bg-sky-50 text-sky-900 border-sky-200";
        if (ux === "To be scheduled") return "bg-orange-50 text-orange-950 border-orange-200";
        if (ux === "To be uploaded") return "bg-slate-100 text-slate-600 border-slate-300";
        if (ux === "No paper (COVID year)") return "bg-slate-50 text-slate-500 border-slate-200";
        return "bg-slate-50 text-slate-500 border-slate-200";
    }

    function nextActionButton(p, ux, subject, year, paperNum, isNoPaperYear) {
        if (isNoPaperYear) return "";
        if (!p) {
            return (
                '<button type="button" class="js-backlog-upload mt-2 w-full px-2 py-1.5 rounded-lg bg-slate-900 text-white text-[9px] font-black uppercase tracking-wide hover:bg-blue-600 transition shrink-0" data-subject="' +
                esc(String(subject || "")) +
                '" data-year="' +
                esc(String(year || "")) +
                '" data-paper-num="' +
                esc(String(paperNum || "")) +
                '">Upload</button>'
            );
        }
        if (ux === "To be scheduled") {
            return (
                '<button type="button" class="js-set-sitting-date mt-2 w-full px-2 py-1.5 rounded-lg bg-slate-900 text-white text-[9px] font-black uppercase tracking-wide hover:bg-blue-600 transition shrink-0" data-id="' +
                esc(String(p.id)) +
                '">Schedule</button>'
            );
        }
        if (ux === "Marked") {
            return (
                '<button type="button" class="js-view-yaml-comments mt-2 w-full px-2 py-1.5 rounded-lg bg-emerald-700 text-white text-[9px] font-black uppercase tracking-wide hover:bg-emerald-600 transition shrink-0" data-id="' +
                esc(String(p.id)) +
                '">View comments</button>'
            );
        }
        return (
            '<button type="button" class="js-backlog-grade mt-2 w-full px-2 py-1.5 rounded-lg bg-slate-900 text-white text-[9px] font-black uppercase tracking-wide hover:bg-blue-600 transition shrink-0" data-id="' +
            esc(String(p.id)) +
            '">Grade</button>'
        );
    }

    function slotCell(p, ux, subject, year, paperNum, isNoPaperYear) {
        const sc =
            p && G.isGraded(p.status) && p.score != null && !Number.isNaN(Number(p.score))
                ? '<span class="font-black tabular-nums">' + esc(String(p.score)) + "%</span>"
                : "—";
        const title = p && p.paper_title ? esc(String(p.paper_title)) : "";
        const sub =
            '<div class="text-[10px] text-slate-500 truncate max-w-[220px]" title="' +
            title +
            '">' +
            (title || "\u00a0") +
            "</div>";
        var actionBtn = nextActionButton(p, ux, subject, year, paperNum, isNoPaperYear);
        return (
            '<td class="px-3 py-2 align-top">' +
            '<span class="inline-flex px-2 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wide leading-tight ' +
            statusCellClass(ux) +
            '">' +
            esc(ux) +
            "</span>" +
            '<div class="mt-1 text-[11px] font-bold text-slate-700">' +
            sc +
            "</div>" +
            sub +
            actionBtn +
            "</td>"
        );
    }

    function defaultSubjects() {
        return G.BACKLOG_SUBJECTS && G.BACKLOG_SUBJECTS.length ? G.BACKLOG_SUBJECTS : ["Psychology", "Business Studies"];
    }

    function yearRange() {
        var y0 = G.BACKLOG_YEAR_MIN;
        var y1 = G.BACKLOG_YEAR_MAX;
        if (typeof y0 !== "number" || typeof y1 !== "number" || y0 > y1) {
            y0 = 2016;
            y1 = 2024;
        }
        var years = [];
        for (var y = y0; y <= y1; y++) years.push(y);
        return years;
    }

    function noPaperYearsSet() {
        var ys = Array.isArray(G.BACKLOG_NO_PAPERS_YEARS) ? G.BACKLOG_NO_PAPERS_YEARS : [];
        var out = {};
        for (var i = 0; i < ys.length; i++) {
            var y = parseInt(ys[i], 10);
            if (Number.isFinite(y)) out[String(y)] = true;
        }
        return out;
    }

    /**
     * @param {HTMLElement | null} container
     * @param {Array<Record<string, unknown>>} allPapers unfiltered collection
     * @param {string} subject Single subject label, e.g. Psychology or Business Studies
     */
    G.renderBacklogGrid = function (container, allPapers, subject) {
        if (!container) return;

        var list = Array.isArray(allPapers) ? allPapers : [];
        var subjects = defaultSubjects();
        var subj =
            subject && subjects.indexOf(subject) >= 0
                ? subject
                : subjects[0] || "Psychology";

        var psych = String(subj).indexOf("Psychology") >= 0;
        var band = psych ? "border-blue-200" : "border-emerald-200";
        var years = yearRange();
        var noPaperYears = noPaperYearsSet();

        var html =
            '<div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">' +
            '<table class="w-full min-w-[520px] text-left text-xs border-collapse">' +
            '<thead><tr class="bg-slate-900 text-white">' +
            '<th class="px-3 py-2 font-black uppercase tracking-wider w-20">Year</th>' +
            '<th class="px-3 py-2 font-black uppercase tracking-wider">Paper 1</th>' +
            '<th class="px-3 py-2 font-black uppercase tracking-wider">Paper 2</th>' +
            "</tr></thead><tbody>";

        for (var yi = 0; yi < years.length; yi++) {
            var yr = years[yi];
            var isNoPaperYear = !!noPaperYears[String(yr)];
            var p1 = isNoPaperYear ? null : G.findPaperForCohortSlot(list, yr, subj, 1);
            var p2 = isNoPaperYear ? null : G.findPaperForCohortSlot(list, yr, subj, 2);
            var u1 = isNoPaperYear ? "No paper (COVID year)" : G.backlogUxStatus(p1);
            var u2 = isNoPaperYear ? "No paper (COVID year)" : G.backlogUxStatus(p2);
            var rowBg = yi % 2 === 0 ? "bg-white" : "bg-slate-50/80";
            var yearLabel = isNoPaperYear ? String(yr) + " (no papers)" : String(yr);

            html +=
                '<tr class="' +
                rowBg +
                " border-t " +
                band +
                '/30">' +
                '<td class="px-3 py-2 font-black tabular-nums text-slate-800">' +
                yearLabel +
                "</td>" +
                slotCell(p1, u1, subj, yr, 1, isNoPaperYear) +
                slotCell(p2, u2, subj, yr, 2, isNoPaperYear) +
                "</tr>";
        }

        html += "</tbody></table></div>";

        container.innerHTML = html;
    };

    /** Highlights backlog subject tabs to match `subject`. */
    G.syncBacklogSubjectTabs = function (subject) {
        var root = document.getElementById("backlog-subject-tabs");
        if (!root) return;
        var activePsych =
            "backlog-tab px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide bg-blue-700 text-white shadow-md ring-2 ring-blue-300 border border-blue-200 transition-all -translate-y-[1px]";
        var activeBus =
            "backlog-tab px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide bg-emerald-700 text-white shadow-md ring-2 ring-emerald-300 border border-emerald-200 transition-all -translate-y-[1px]";
        var idle =
            "backlog-tab px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide bg-slate-100 text-slate-600 hover:bg-slate-200 border border-transparent transition-all";
        root.querySelectorAll(".backlog-tab").forEach(function (btn) {
            var s = btn.getAttribute("data-subject");
            if (s === subject) btn.className = s === "Psychology" ? activePsych : activeBus;
            else btn.className = idle;
        });
    };
})(window);
