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
     * @param {HTMLElement|null} grid
     * @param {HTMLElement|null} monthLabel
     * @param {Array<Record<string, unknown>>} papers filtered papers (revision queue)
     * @param {(p: Record<string, unknown>) => boolean} isGradedFn
     * @param {string} [subjectFilter] passed to exam lookup (matches sidebar focus)
     */
    G.renderCalendar = function (grid, monthLabel, papers, isGradedFn, subjectFilter) {
        if (!grid) return;
        const { year, month } = calView;
        const examByDate = G.buildExamDatesByYmd(subjectFilter || "all");

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
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayPapers = papers.filter(
                (p) => typeof p.scheduled_date === "string" && p.scheduled_date.startsWith(dateStr)
            );
            const examsThisDay = examByDate[dateStr] || [];
            const hasPapers = dayPapers.length > 0;
            const hasExam = examsThisDay.length > 0;
            const allGraded = hasPapers && dayPapers.every((p) => isGradedFn(p));

            let color = "bg-slate-50 border-slate-100";
            if (hasPapers && !allGraded) color = "bg-sky-100 border-sky-200 text-slate-800";
            if (allGraded) color = "bg-emerald-500 border-emerald-600 text-white";

            // Exam days from settings: ring + optional background if no revision tint yet
            let examRing = "";
            if (hasExam) {
                examRing = " ring-2 ring-violet-500 ring-inset";
                if (!hasPapers) color = "bg-violet-50 border-violet-200 text-slate-800";
                else if (hasPapers && !allGraded) color += " ring-violet-500";
            }

            const tipParts = [];
            for (let e = 0; e < examsThisDay.length; e++) {
                tipParts.push("Exam: " + examsThisDay[e].label);
            }
            for (let p = 0; p < dayPapers.length; p++) {
                tipParts.push(String(dayPapers[p].paper_title || ""));
            }
            const titleAttr = tipParts.length ? ' title="' + escAttr(tipParts.join(" · ")) + '"' : "";

            let dotsHtml = "";
            if (examsThisDay.length) {
                const maxDots = 4;
                const show = examsThisDay.slice(0, maxDots);
                for (let d = 0; d < show.length; d++) {
                    dotsHtml +=
                        '<span class="w-1.5 h-1.5 shrink-0 rounded-full ' +
                        show[d].color +
                        '" title="' +
                        escAttr(show[d].label) +
                        '"></span>';
                }
                if (examsThisDay.length > maxDots) {
                    dotsHtml +=
                        '<span class="text-[7px] font-black text-violet-700 leading-none">+' +
                        (examsThisDay.length - maxDots) +
                        "</span>";
                }
            }

            const dayNumClass =
                allGraded && hasExam ? "text-white" : hasExam ? "text-violet-900" : "";

            cells.push(
                '<div class="aspect-square rounded-md border text-[9px] font-bold flex flex-col items-center justify-between py-0.5 px-0.5 min-h-[2.5rem] ' +
                    color +
                    examRing +
                    '"' +
                    titleAttr +
                    ">" +
                    '<span class="' +
                    dayNumClass +
                    ' leading-none">' +
                    day +
                    "</span>" +
                    (dotsHtml
                        ? '<div class="flex flex-wrap gap-0.5 justify-center items-center w-full">' + dotsHtml + "</div>"
                        : '<span class="h-1.5"></span>') +
                    "</div>"
            );
        }
        grid.className = "grid grid-cols-7 gap-1";
        grid.innerHTML = cells.join("");
    };
})(window);
