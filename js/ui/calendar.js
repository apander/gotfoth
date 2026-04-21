(function (w) {
    const G = w.GF;
    let calView = { year: new Date().getFullYear(), month: new Date().getMonth() };

    G.getCalendarView = function () {
        return { year: calView.year, month: calView.month };
    };

    G.setCalendarView = function (year, month) {
        calView = { year, month };
    };

    G.shiftMonth = function (delta) {
        const d = new Date(calView.year, calView.month + delta, 1);
        calView = { year: d.getFullYear(), month: d.getMonth() };
    };

    function mondayCol(jsDay) {
        return jsDay === 0 ? 6 : jsDay - 1;
    }

    function escAttr(s) {
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/</g, "&lt;");
    }

    function paperTaskHref(p) {
        const pdf = G.fileUrl(p, "file_paper");
        if (pdf) return pdf;
        return G.PB_URL + "/_/#/collections/papers/records/" + encodeURIComponent(String(p.id || ""));
    }

    function paperTaskTip(p) {
        const parts = [];
        parts.push(G.derivedPaperDisplayName ? G.derivedPaperDisplayName(p) : String(p.paper_type || "Paper"));
        parts.push(G.isGraded(p.status) ? "Status: Marked" : "Status: To complete / mark");
        if (p.score != null && G.isGraded(p.status)) parts.push("Score: " + p.score + "%");
        return parts.join(" · ");
    }

    /**
     * Full-width horizontal bar; anchor opens paper PDF or PocketBase record.
     * @param {boolean} onDarkCell — emerald / exam+graded backgrounds (light text).
     */
    function paperBarHtml(p, onDarkCell) {
        const graded = G.isGraded(p.status);
        var barClass;
        var textClass;
        if (onDarkCell) {
            barClass = graded
                ? "bg-white/25 border border-white/45 hover:bg-white/35"
                : "bg-sky-100/90 border border-white/50 hover:bg-sky-50";
            textClass = "text-white";
        } else {
            barClass = graded
                ? "bg-emerald-100/95 border border-emerald-800/30 hover:bg-emerald-50"
                : "bg-sky-200/95 border border-sky-600/35 hover:bg-sky-100";
            textClass = "text-slate-900";
        }
        const href = escAttr(paperTaskHref(p));
        const tip = escAttr(paperTaskTip(p));
        const label = escAttr(
            (G.derivedPaperDisplayName ? G.derivedPaperDisplayName(p) : p.paper_type || "Paper").slice(0, 42)
        );
        return (
            '<a href="' +
            href +
            '" target="_blank" rel="noopener" title="' +
            tip +
            '" class="cal-task-bar flex items-center min-h-[7px] w-full rounded-sm px-1 ' +
            barClass +
            ' shadow-sm">' +
            '<span class="flex-1 min-w-0 truncate text-[6px] sm:text-[7px] font-bold ' +
            textClass +
            ' leading-none">' +
            label +
            "</span></a>"
        );
    }

    function staticBarHtml(opts) {
        const bg = opts.bgClass || "bg-slate-600";
        const tip = escAttr(opts.title || opts.label || "");
        const label = escAttr(String(opts.label || "").slice(0, 42));
        return (
            '<span title="' +
            tip +
            '" class="cal-task-bar flex items-center min-h-[7px] w-full rounded-sm px-1 ' +
            bg +
            ' text-white shadow-sm cursor-default">' +
            '<span class="flex-1 min-w-0 truncate text-[6px] sm:text-[7px] font-bold leading-none">' +
            label +
            "</span></span>"
        );
    }

    /**
     * @param {string} [subjectFilter] "all" | "Psychology" | "Business Studies" — limits exam dots to that subject line.
     * @returns {Record<string, Array<{ label: string, color: string }>>}
     */
    G.buildExamDatesByYmd = function (subjectFilter) {
        const map = {};
        for (let i = 0; i < G.EXAM_SETTING_KEYS.length; i++) {
            const exam = G.EXAM_SETTING_KEYS[i];
            if (subjectFilter === "Psychology" && exam.key.indexOf("psy_") !== 0) continue;
            if (subjectFilter === "Business Studies" && exam.key.indexOf("bus_") !== 0) continue;
            const dt = G.getSettingDate(exam.key);
            if (!dt || Number.isNaN(dt.getTime())) continue;
            const ymd = G.dateToYmdLocal(dt);
            if (!map[ymd]) map[ymd] = [];
            map[ymd].push({ label: exam.label, color: exam.color });
        }
        return map;
    };

    /**
     * Build day map from settings keys created by `sync_google_ics.py`.
     * Key format: `${G.GCAL_EVENT_KEY_PREFIX}<hash>` and value JSON:
     * {"date":"YYYY-MM-DD","label":"...","source":"google_ics"}
     * @returns {Record<string, Array<{ label: string, color: string }>>}
     */
    G.buildImportedEventsByYmd = function () {
        const map = {};
        const settings = G.getSettings ? G.getSettings() : {};
        const prefix = G.GCAL_EVENT_KEY_PREFIX || "gcal_evt_";
        const keys = Object.keys(settings || {});
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (String(k).indexOf(prefix) !== 0) continue;
            const raw = settings[k];
            if (!raw) continue;
            try {
                const obj = JSON.parse(String(raw));
                if (!obj || !obj.date || !obj.label) continue;
                const ymd = String(obj.date).slice(0, 10);
                if (!map[ymd]) map[ymd] = [];
                map[ymd].push({ label: String(obj.label), color: "bg-slate-500" });
            } catch (e) {}
        }
        return map;
    };

    function renderGoogleSyncStatus() {
        const el = document.getElementById("gcal-sync-status");
        if (!el) return;
        const settings = G.getSettings ? G.getSettings() : {};
        const raw = settings[G.GCAL_SYNC_STATUS_KEY || "gcal_sync_status"];
        if (!raw) {
            el.className = "mb-2 text-[10px] text-slate-500";
            el.textContent = "Google sync: not available yet.";
            return;
        }
        try {
            const obj = JSON.parse(String(raw));
            const ts = obj && obj.last_sync ? new Date(String(obj.last_sync)) : null;
            const count = obj && Number.isFinite(Number(obj.events_in_window)) ? Number(obj.events_in_window) : null;
            if (ts && !Number.isNaN(ts.getTime())) {
                var msg = "Google sync: last updated " + ts.toLocaleString();
                if (count != null) msg += " (" + count + " events in window)";
                el.className = "mb-2 text-[10px] text-slate-600";
                el.textContent = msg;
                return;
            }
        } catch (e) {}
        el.className = "mb-2 text-[10px] text-slate-500";
        el.textContent = "Google sync: status unreadable.";
    }

    /**
     * @param {HTMLElement|null} grid
     * @param {HTMLElement|null} monthLabel
     * @param {Array<Record<string, unknown>>} papers filtered papers (revision queue)
     * @param {(p: Record<string, unknown>) => boolean} isGradedFn
     * @param {string} [subjectFilter] passed to exam lookup (matches sidebar focus)
     */
    G.renderCalendar = function (grid, monthLabel, papers, isGradedFn, subjectFilter) {
        if (!grid) return;
        const { year, month } = calView;
        renderGoogleSyncStatus();
        const examByDate = G.buildExamDatesByYmd(subjectFilter || "all");
        const importedByDate = G.buildImportedEventsByYmd();
        const examListEl = document.getElementById("calendar-exam-list");

        if (monthLabel) {
            monthLabel.innerText = new Date(year, month).toLocaleString("default", {
                month: "long",
                year: "numeric",
            });
        }
        const firstWeekday = mondayCol(new Date(year, month, 1).getDay());
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const cells = [];
        for (let i = 0; i < firstWeekday; i++) {
            cells.push(`<div class="aspect-square rounded-md bg-slate-100/80 border border-transparent"></div>`);
        }
        const todayYmd = G.dateToYmdLocal(new Date());
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isToday = dateStr === todayYmd;
            const dayPapers = papers.filter(
                (p) => typeof p.scheduled_date === "string" && p.scheduled_date.startsWith(dateStr)
            );
            const examsThisDay = examByDate[dateStr] || [];
            const importedThisDay = importedByDate[dateStr] || [];
            const hasPapers = dayPapers.length > 0;
            const hasExam = examsThisDay.length > 0;
            const allGraded = hasPapers && dayPapers.every((p) => isGradedFn(p));

            let color = "bg-slate-50 border border-slate-200/80";
            if (hasPapers && !allGraded) color = "bg-sky-100 border-2 border-sky-300 text-slate-800";
            if (allGraded) color = "bg-emerald-500 border-2 border-emerald-700 text-white";

            let examExtraClass = "";
            let examBannerHtml = "";
            if (hasExam) {
                examExtraClass =
                    " shadow-md shadow-violet-400/40 z-10 scale-[1.02] sm:scale-100 transform-gpu border-[3px] border-violet-600";
                if (!hasPapers) {
                    color =
                        "bg-gradient-to-br from-violet-300 via-violet-200 to-fuchsia-200 border-[3px] border-violet-700 text-violet-950 font-extrabold";
                } else if (hasPapers && !allGraded) {
                    color =
                        "bg-gradient-to-br from-violet-200/90 via-sky-100 to-sky-50 border-[3px] border-violet-600 text-slate-900";
                } else {
                    color =
                        "bg-gradient-to-br from-emerald-500 to-violet-600 border-[3px] border-violet-800 text-white";
                }
                const examLabels = examsThisDay
                    .map(function (e) {
                        return escAttr(e.label);
                    })
                    .join(" · ");
                examBannerHtml =
                    '<span class="mt-0.5 mb-0.5 shrink-0 rounded px-1 py-0.5 text-[7px] sm:text-[8px] font-black uppercase tracking-wide text-white bg-violet-700 shadow-sm leading-none max-w-full truncate text-center" title="' +
                    examLabels +
                    '">Exam day</span>';
            }

            const todayLabelHtml = isToday
                ? '<span class="mt-0.5 block text-center text-[6px] sm:text-[7px] font-black uppercase tracking-wide text-amber-950 bg-amber-200 rounded px-0.5 py-px leading-tight shadow-sm ring-1 ring-amber-500/60">Today</span>'
                : "";

            const onDarkPaperBars = allGraded && hasPapers;

            let barsHtml = "";
            const barStack = [];
            for (let pi = 0; pi < dayPapers.length; pi++) {
                barStack.push(paperBarHtml(dayPapers[pi], onDarkPaperBars));
            }
            for (let gi = 0; gi < importedThisDay.length; gi++) {
                barStack.push(
                    staticBarHtml({
                        label: importedThisDay[gi].label,
                        title: "Google Calendar: " + importedThisDay[gi].label,
                        bgClass: "bg-slate-700",
                    })
                );
            }
            for (let ei = 0; ei < examsThisDay.length; ei++) {
                barStack.push(
                    staticBarHtml({
                        label: examsThisDay[ei].label,
                        title: "Official exam: " + examsThisDay[ei].label,
                        bgClass: "bg-violet-700",
                    })
                );
            }
            const maxBars = 4;
            if (barStack.length) {
                const show = barStack.slice(0, maxBars);
                barsHtml =
                    '<div class="flex flex-col gap-0.5 justify-end items-stretch w-full mt-auto px-0.5 flex-1 min-h-0 overflow-hidden">' +
                    show.join("") +
                    (barStack.length > maxBars
                        ? '<span class="text-[6px] font-black text-slate-600 text-center leading-none">+' +
                          (barStack.length - maxBars) +
                          " more</span>"
                        : "") +
                    "</div>";
            } else {
                barsHtml = '<span class="h-1 min-h-[2px] block mt-auto"></span>';
            }

            let todayRingClass = "";
            if (isToday) {
                todayRingClass = hasExam ? " ring-2 ring-amber-300 ring-offset-1" : " ring-2 ring-amber-400 ring-offset-1";
            }

            const dayNumClass =
                allGraded && hasExam ? "text-white drop-shadow-sm" : hasExam ? "text-violet-950 text-[11px] sm:text-sm" : "text-slate-700";

            cells.push(
                '<div class="aspect-square rounded-lg text-[9px] font-bold flex flex-col items-stretch justify-between py-1 px-0.5 min-h-[2.75rem] sm:min-h-14 ' +
                    color +
                    examExtraClass +
                    todayRingClass +
                    '">' +
                    '<div class="shrink-0 flex flex-col items-stretch gap-0.5">' +
                    '<span class="' +
                    dayNumClass +
                    ' leading-none text-center font-black">' +
                    day +
                    "</span>" +
                    todayLabelHtml +
                    "</div>" +
                    examBannerHtml +
                    barsHtml +
                    "</div>"
            );
        }
        if (examListEl) {
            examListEl.className = "hidden";
            examListEl.innerHTML = "";
        }
        grid.className = "grid grid-cols-7 gap-1 sm:gap-1.5";
        grid.innerHTML = cells.join("");
    };
})(window);
