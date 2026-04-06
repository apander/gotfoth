(function (w) {
    const G = w.GF;
    let perfChart = null;

    const T = {
        BUS_P1: "business p1",
        BUS_P2: "business p2",
        PSY_P1: "psychology p1",
        PSY_P2: "psychology p2",
    };

    /** @type {"year"|"timeline"} */
    G._perfUXMode = G._perfUXMode || "year";
    G._perfTimelineSubject = G._perfTimelineSubject || "Psychology";

    function normType(paper) {
        return String(paper.paper_type || "")
            .trim()
            .toLowerCase();
    }

    function normYearString(paper) {
        var y = G.parsePaperYear(paper);
        return y == null ? "" : String(y);
    }

    function parseScheduleTime(p) {
        const t = new Date(p.scheduled_date);
        return t.getTime();
    }

    function fmtDate(ts) {
        return new Date(ts).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    }

    function paperToPoint(p) {
        const x = parseScheduleTime(p);
        const ey = normYearString(p);
        return {
            x: x,
            y: Number(p.score),
            paper_title: p.paper_title || "(Untitled)",
            paper_type: p.paper_type || "",
            scheduled_date: p.scheduled_date,
            examYear: ey || undefined,
        };
    }

    function filterValidPoints(arr) {
        return arr.filter(function (pt) {
            return !Number.isNaN(pt.x) && pt.y != null && !Number.isNaN(pt.y);
        });
    }

    function xRangeFromItems(items) {
        const allX = items
            .map(parseScheduleTime)
            .filter(function (t) {
                return !Number.isNaN(t);
            });
        if (!allX.length) {
            const n = Date.now();
            return { min: n, max: n, pad: 86400000 * 3 };
        }
        const xMin = Math.min.apply(null, allX);
        const xMax = Math.max.apply(null, allX);
        const pad = allX.length > 1 ? (xMax - xMin) * 0.08 : 86400000 * 3;
        return { min: xMin - pad, max: xMax + pad };
    }

    function baseChartOptions(xMin, xMax) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: "nearest",
                intersect: true,
            },
            plugins: {
                legend: {
                    position: "top",
                    align: "start",
                    labels: {
                        boxWidth: 10,
                        boxHeight: 10,
                        usePointStyle: true,
                        pointStyle: "circle",
                        padding: 14,
                        font: { size: 11, weight: "600" },
                    },
                },
            },
            scales: {
                x: {
                    type: "linear",
                    min: xMin,
                    max: xMax,
                    title: {
                        display: true,
                        text: "Date taken (scheduled)",
                        color: "#64748b",
                        font: { size: 12, weight: "600" },
                    },
                    grid: { color: "rgba(148, 163, 184, 0.25)" },
                    ticks: {
                        color: "#64748b",
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 10,
                        callback: function (val) {
                            return fmtDate(val);
                        },
                    },
                },
                y: {
                    min: 0,
                    max: 100,
                    title: {
                        display: true,
                        text: "Score %",
                        color: "#64748b",
                        font: { size: 12, weight: "600" },
                    },
                    grid: { color: "rgba(148, 163, 184, 0.25)" },
                    ticks: {
                        color: "#64748b",
                        stepSize: 10,
                        callback: function (v) {
                            return v + "%";
                        },
                    },
                },
            },
        };
    }

    function esc(s) {
        return String(s ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/"/g, "&quot;");
    }

    function meanScore(papers) {
        var nums = [];
        for (var i = 0; i < papers.length; i++) {
            var n = Number(papers[i].score);
            if (!Number.isNaN(n)) nums.push(n);
        }
        if (!nums.length) return null;
        var s = 0;
        for (var j = 0; j < nums.length; j++) s += nums[j];
        return s / nums.length;
    }

    function gradedPapersForSlot(allPapers, subject, typeKey) {
        var out = [];
        for (var i = 0; i < allPapers.length; i++) {
            var p = allPapers[i];
            if (p.subject !== subject) continue;
            if (!G.isGraded(p.status)) continue;
            var sc = Number(p.score);
            if (Number.isNaN(sc)) continue;
            if (normType(p) !== typeKey) continue;
            out.push(p);
        }
        return out;
    }

    function prominentCohortFooter(pctMean, boundaries, subj) {
        if (pctMean == null || Number.isNaN(pctMean)) return "";
        var rounded = Math.round(pctMean);
        var letter = G.letterGradeFromPercent(pctMean, boundaries, subj);
        return (
            '<div class="mt-4 pt-4 border-t-2 border-slate-200/80">' +
            '<p class="text-[10px] font-black uppercase tracking-widest text-slate-500">Subject average (both papers)</p>' +
            '<div class="flex flex-wrap items-end gap-4 mt-2">' +
            '<div><p class="text-[10px] font-bold text-slate-500 uppercase mb-0.5">Percentage</p>' +
            '<p class="text-3xl md:text-4xl font-black text-slate-900 tabular-nums leading-none">' +
            esc(String(rounded)) +
            "%</p></div>" +
            '<div><p class="text-[10px] font-bold text-slate-500 uppercase mb-0.5">Grade</p>' +
            '<p class="text-4xl md:text-5xl font-black text-emerald-700 tabular-nums leading-none tracking-tight">' +
            esc(letter) +
            "</p></div>" +
            "</div>" +
            '<p class="text-[11px] text-slate-500 mt-2">From averaged % vs the same mark scheme as each paper (P1/P2 rows are equivalent).</p>' +
            "</div>"
        );
    }

    function avgPaperRow(label, meanVal, count, boundaries, subj) {
        var scoreTxt;
        var gradeTxt;
        if (meanVal == null || count < 1) {
            scoreTxt = '<span class="text-red-700 font-bold">TBC</span>';
            gradeTxt = "—";
        } else {
            scoreTxt = '<span class="tabular-nums">' + esc(String(Math.round(meanVal))) + "%</span>";
            gradeTxt = esc(G.letterGradeFromPercent(meanVal, boundaries, subj));
        }
        var sub =
            count > 0
                ? '<span class="block text-[9px] font-bold text-slate-400 mt-0.5">' +
                  esc(String(count)) +
                  " graded · mean</span>"
                : "";
        return (
            '<div class="flex justify-between items-start gap-3 py-2 border-t border-slate-100 first:border-t-0">' +
            '<span class="text-[10px] font-black uppercase text-slate-500 shrink-0">' +
            esc(label) +
            "</span>" +
            '<div class="text-right min-w-0">' +
            '<p class="text-sm md:text-base font-black text-slate-900">' +
            scoreTxt +
            "</p>" +
            sub +
            '<p class="text-xs font-black text-slate-600 uppercase mt-1">Grade <span class="text-slate-900">' +
            gradeTxt +
            "</span></p>" +
            "</div>" +
            "</div>"
        );
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

    function renderYearSnapshotCards(container, allPapers, boundaries, yearFilterRaw) {
        if (!container) return;

        var labelEl = document.getElementById("perf-year-cohort-label");
        var subjects = G.BACKLOG_SUBJECTS && G.BACKLOG_SUBJECTS.length ? G.BACKLOG_SUBJECTS : ["Psychology", "Business Studies"];

        if (yearFilterRaw === "all") {
            if (labelEl) {
                labelEl.innerHTML =
                    "<strong>All years</strong> — each value is the <em>mean %</em> of every graded paper of that type (any exam cohort). Pick a single year to see that cohort only.";
            }
            var html = "";
            for (var si = 0; si < subjects.length; si++) {
                var subj = subjects[si];
                var psych = String(subj).indexOf("Psychology") >= 0;
                var accent = psych ? "border-blue-300/80" : "border-emerald-300/80";
                var tone = psych ? "from-blue-50/80 to-white" : "from-emerald-50/80 to-white";
                var k1 = psych ? T.PSY_P1 : T.BUS_P1;
                var k2 = psych ? T.PSY_P2 : T.BUS_P2;
                var list1 = gradedPapersForSlot(allPapers, subj, k1);
                var list2 = gradedPapersForSlot(allPapers, subj, k2);
                var m1 = meanScore(list1);
                var m2 = meanScore(list2);
                var g1 = list1.length > 0;
                var g2 = list2.length > 0;
                var state = "tbc";
                if (g1 && g2) state = "complete";
                else if (g1 || g2) state = "partial";
                var banner =
                    state === "complete"
                        ? "bg-emerald-600 text-white"
                        : state === "partial"
                          ? "bg-amber-500 text-white"
                          : "bg-red-600 text-white";
                var stateLabel =
                    state === "complete" ? "Complete" : state === "partial" ? "Partial" : "To be completed";
                var overallMean = g1 && g2 ? (m1 + m2) / 2 : null;
                var footer = prominentCohortFooter(overallMean, boundaries, subj);
                html +=
                    '<article class="rounded-2xl border-2 ' +
                    accent +
                    " bg-gradient-to-br " +
                    tone +
                    ' shadow-sm overflow-hidden">' +
                    '<header class="px-4 py-3 ' +
                    banner +
                    ' flex justify-between items-center">' +
                    '<h3 class="text-sm font-black">' +
                    esc(subj) +
                    "</h3>" +
                    '<span class="text-[10px] font-black uppercase tracking-widest opacity-95">' +
                    stateLabel +
                    "</span>" +
                    "</header>" +
                    '<div class="px-4 pb-4 pt-1">' +
                    avgPaperRow("Paper 1", m1, list1.length, boundaries, subj) +
                    avgPaperRow("Paper 2", m2, list2.length, boundaries, subj) +
                    footer +
                    "</div>" +
                    "</article>";
            }
            container.innerHTML = html;
            return;
        }

        if (yearFilterRaw === "__none__") {
            if (labelEl) labelEl.innerHTML = "";
            container.innerHTML =
                '<p class="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-4">Choose a cohort with an <strong>exam year</strong> set on papers. <em>Unspecified year</em> cannot show a year snapshot.</p>';
            return;
        }

        var y = parseInt(yearFilterRaw, 10);
        if (!Number.isFinite(y)) {
            if (labelEl) labelEl.innerHTML = "";
            container.innerHTML = '<p class="text-sm text-slate-500">Invalid exam year.</p>';
            return;
        }

        if (labelEl) labelEl.innerHTML = "Exam cohort: <strong>" + esc(String(y)) + "</strong>";

        var noPaperYears = noPaperYearsSet();
        if (noPaperYears[String(y)]) {
            container.innerHTML =
                '<article class="rounded-2xl border border-slate-200 bg-slate-50 p-4">' +
                '<h3 class="text-sm font-black text-slate-700">No exam papers for this year</h3>' +
                '<p class="mt-1 text-xs text-slate-600">This cohort is intentionally blank (COVID disruption year), so it does not count as missing progress.</p>' +
                "</article>";
            return;
        }

        var html2 = "";
        for (var sj = 0; sj < subjects.length; sj++) {
            var subj2 = subjects[sj];
            var psych2 = String(subj2).indexOf("Psychology") >= 0;
            var accent2 = psych2 ? "border-blue-300/80" : "border-emerald-300/80";
            var tone2 = psych2 ? "from-blue-50/80 to-white" : "from-emerald-50/80 to-white";

            var p1 = G.findPaperForCohortSlot(allPapers, y, subj2, 1);
            var p2 = G.findPaperForCohortSlot(allPapers, y, subj2, 2);
            var g1b = !!(p1 && G.isGraded(p1.status));
            var g2b = !!(p2 && G.isGraded(p2.status));

            var state2 = "tbc";
            if (g1b && g2b) state2 = "complete";
            else if (g1b || g2b) state2 = "partial";

            var banner2 =
                state2 === "complete"
                    ? "bg-emerald-600 text-white"
                    : state2 === "partial"
                      ? "bg-amber-500 text-white"
                      : "bg-red-600 text-white";
            var stateLabel2 =
                state2 === "complete" ? "Complete" : state2 === "partial" ? "Partial" : "To be completed";

            function paperRowSingle(label, p, graded) {
                var ux = G.backlogUxStatus(p);
                var scoreTxt = "—";
                var gradeTxt = "—";
                if (graded && p) {
                    scoreTxt = p.score != null ? esc(String(p.score)) + "%" : "—";
                    gradeTxt = esc(G.letterGrade(p, boundaries));
                } else {
                    scoreTxt = '<span class="text-slate-600 text-xs font-bold">' + esc(ux) + "</span>";
                }
                return (
                    '<div class="flex justify-between items-center gap-3 py-2 border-t border-slate-100 first:border-t-0">' +
                    '<span class="text-[10px] font-black uppercase text-slate-500">' +
                    esc(label) +
                    "</span>" +
                    '<div class="text-right">' +
                    '<p class="text-sm font-black text-slate-900">' +
                    scoreTxt +
                    "</p>" +
                    '<p class="text-xs font-black text-slate-600 uppercase mt-1">Grade <span class="text-slate-900">' +
                    gradeTxt +
                    "</span></p>" +
                    "</div>" +
                    "</div>"
                );
            }

            var meanPair = null;
            if (g1b && g2b && p1 && p2) {
                meanPair = (Number(p1.score) + Number(p2.score)) / 2;
            }
            var footer2 = prominentCohortFooter(meanPair, boundaries, subj2);

            html2 +=
                '<article class="rounded-2xl border-2 ' +
                accent2 +
                " bg-gradient-to-br " +
                tone2 +
                ' shadow-sm overflow-hidden">' +
                '<header class="px-4 py-3 ' +
                banner2 +
                ' flex justify-between items-center">' +
                '<h3 class="text-sm font-black">' +
                esc(subj2) +
                "</h3>" +
                '<span class="text-[10px] font-black uppercase tracking-widest opacity-95">' +
                stateLabel2 +
                "</span>" +
                "</header>" +
                '<div class="px-4 pb-4 pt-1">' +
                paperRowSingle("Paper 1", p1, g1b) +
                paperRowSingle("Paper 2", p2, g2b) +
                footer2 +
                "</div>" +
                "</article>";
        }

        container.innerHTML = html2;
    }

    function updatePerfUxTabStyles() {
        var yBtn = document.getElementById("perf-ux-year");
        var tBtn = document.getElementById("perf-ux-timeline");
        var mode = G._perfUXMode;
        var active = "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide bg-slate-900 text-white shadow-sm";
        var idle =
            "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide bg-slate-100 text-slate-600 hover:bg-slate-200";
        if (yBtn) yBtn.className = mode === "year" ? active : idle;
        if (tBtn) tBtn.className = mode === "timeline" ? active : idle;

        var yearPanel = document.getElementById("performance-year-panel");
        var tlPanel = document.getElementById("performance-timeline-panel");
        var yearFilterWrap = document.getElementById("perf-year-filter-wrap");
        if (yearPanel) yearPanel.classList.toggle("hidden", mode !== "year");
        if (tlPanel) tlPanel.classList.toggle("hidden", mode !== "timeline");
        if (yearFilterWrap) yearFilterWrap.classList.toggle("hidden", mode === "timeline");

        var help = document.getElementById("performance-help");
        if (help) {
            help.innerHTML =
                mode === "year"
                    ? "<strong>Year snapshot:</strong> choose an <em>exam year</em> for that cohort, or <strong>All years</strong> for <em>mean scores</em> across every graded P1/P2. <span class='text-red-700 font-bold'>Red</span> = nothing graded; <span class='text-amber-700 font-bold'>amber</span> = one paper type graded; <span class='text-emerald-700 font-bold'>green</span> = both. The large grade is from the subject average % vs the mark scheme."
                    : "<strong>Progress over time:</strong> all graded papers for the selected subject, by the date each one was scheduled. P1 and P2 are separate lines — no exam-year filter here.";
        }
    }

    function ensurePerfYearFilter() {
        var sel = document.getElementById("perf-year-filter");
        if (!sel || sel._filled) return;
        sel._filled = true;
        while (sel.firstChild) sel.removeChild(sel.firstChild);
        var allOpt = document.createElement("option");
        allOpt.value = "all";
        allOpt.textContent = "All years (mean of all graded)";
        sel.appendChild(allOpt);
        var y0 = G.BACKLOG_YEAR_MIN;
        var y1 = G.BACKLOG_YEAR_MAX;
        var noPaperYears = noPaperYearsSet();
        if (typeof y0 === "number" && typeof y1 === "number") {
            for (var y = y0; y <= y1; y++) {
                var o = document.createElement("option");
                o.value = String(y);
                o.textContent = noPaperYears[String(y)] ? String(y) + " (no papers)" : String(y);
                sel.appendChild(o);
            }
        }
        var u = document.createElement("option");
        u.value = "__none__";
        u.textContent = "Unspecified year";
        sel.appendChild(u);
        sel.addEventListener("change", function () {
            G.renderPerformanceChart();
        });
    }

    function syncTimelineSubjectTabs() {
        var root = document.getElementById("perf-timeline-subject-tabs");
        if (!root) return;
        var cur = G._perfTimelineSubject || "Psychology";
        var active = "perf-tl-subj px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide bg-slate-900 text-white shadow-sm";
        var idle =
            "perf-tl-subj px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide bg-slate-100 text-slate-600 hover:bg-slate-200";
        root.querySelectorAll(".perf-tl-subj").forEach(function (btn) {
            var s = btn.getAttribute("data-subject");
            btn.className = s === cur ? active : idle;
        });
    }

    G.wirePerformanceTabs = function () {
        ensurePerfYearFilter();

        var yBtn = document.getElementById("perf-ux-year");
        var tBtn = document.getElementById("perf-ux-timeline");
        if (yBtn && !yBtn._wired) {
            yBtn._wired = true;
            yBtn.addEventListener("click", function () {
                G._perfUXMode = "year";
                if (perfChart) {
                    perfChart.destroy();
                    perfChart = null;
                }
                updatePerfUxTabStyles();
                G.renderPerformanceChart();
            });
        }
        if (tBtn && !tBtn._wired) {
            tBtn._wired = true;
            tBtn.addEventListener("click", function () {
                G._perfUXMode = "timeline";
                updatePerfUxTabStyles();
                G.renderPerformanceChart();
            });
        }

        var subRoot = document.getElementById("perf-timeline-subject-tabs");
        if (subRoot && !subRoot._wired) {
            subRoot._wired = true;
            subRoot.querySelectorAll(".perf-tl-subj").forEach(function (btn) {
                btn.addEventListener("click", function () {
                    var s = btn.getAttribute("data-subject");
                    if (!s) return;
                    G._perfTimelineSubject = s;
                    syncTimelineSubjectTabs();
                    G.renderPerformanceChart();
                });
            });
        }

        updatePerfUxTabStyles();
        syncTimelineSubjectTabs();
    };

    G.renderPerformanceChart = async function () {
        var Chart = w.Chart;
        if (!Chart) {
            console.error("Chart.js not loaded");
            return;
        }
        G.wirePerformanceTabs();

        var yearSel = document.getElementById("perf-year-filter");
        var yearFilter = yearSel && yearSel.value ? yearSel.value : "all";

        var allPapers = await G.fetchPapersSorted();
        var boundaries = G.getBoundaries();

        if (G._perfUXMode === "year") {
            var cardsEl = document.getElementById("perf-year-cards");
            var tlEmpty = document.getElementById("performance-empty-timeline");
            if (tlEmpty) tlEmpty.classList.add("hidden");

            renderYearSnapshotCards(cardsEl, allPapers, boundaries, yearFilter);
            if (perfChart) {
                perfChart.destroy();
                perfChart = null;
            }
            var summaryEl = document.getElementById("performance-summary");
            if (summaryEl) summaryEl.innerHTML = "";
            return;
        }

        /* Timeline mode */
        var chartEl = document.getElementById("mainChart");
        var emptyTl = document.getElementById("performance-empty-timeline");
        var panelEl = document.getElementById("performance-chart-panel");
        var summaryEl = document.getElementById("performance-summary");
        if (!chartEl) return;

        var ctx = chartEl.getContext("2d");

        var graded = allPapers.filter(function (p) {
            return G.isGraded(p.status);
        });
        var hasAnyGraded = graded.length > 0;

        var subj = G._perfTimelineSubject || "Psychology";
        var psych = String(subj).indexOf("Psychology") >= 0;
        var items = graded.filter(function (p) {
            return psych ? String(p.subject || "").indexOf("Psychology") >= 0 : String(p.subject || "").indexOf("Psychology") < 0;
        });

        if (!hasAnyGraded) {
            if (panelEl) panelEl.classList.add("hidden");
            if (emptyTl) {
                emptyTl.classList.remove("hidden");
                emptyTl.innerHTML =
                    '<p class="text-sm text-slate-600">No graded papers yet. Mark a paper to see scores over time.</p>';
            }
            if (summaryEl) summaryEl.innerHTML = "";
            if (perfChart) {
                perfChart.destroy();
                perfChart = null;
            }
            return;
        }

        if (panelEl) panelEl.classList.remove("hidden");
        if (emptyTl) {
            if (!items.length) {
                emptyTl.classList.remove("hidden");
                emptyTl.innerHTML =
                    '<p class="text-sm text-slate-600">No graded papers for this subject yet.</p>';
            } else {
                emptyTl.classList.add("hidden");
            }
        }

        if (!items.length) {
            if (perfChart) {
                perfChart.destroy();
                perfChart = null;
            }
            if (panelEl) panelEl.classList.add("hidden");
            if (summaryEl) summaryEl.innerHTML = "";
            return;
        }

        if (panelEl) panelEl.classList.remove("hidden");

        var k1 = psych ? T.PSY_P1 : T.BUS_P1;
        var k2 = psych ? T.PSY_P2 : T.BUS_P2;
        var c1 = psych ? "#1d4ed8" : "#047857";
        var c2 = psych ? "#60a5fa" : "#34d399";

        var pts1 = filterValidPoints(
            items
                .filter(function (p) {
                    return normType(p) === k1;
                })
                .map(paperToPoint)
        );
        var pts2 = filterValidPoints(
            items
                .filter(function (p) {
                    return normType(p) === k2;
                })
                .map(paperToPoint)
        );

        var ds = [];
        if (pts1.length) {
            ds.push({
                label: psych ? "Psychology P1" : "Business P1",
                data: pts1,
                parsing: false,
                borderColor: c1,
                backgroundColor: "transparent",
                pointBackgroundColor: c1,
                pointBorderColor: "#fff",
                pointBorderWidth: 2,
                pointRadius: 6,
                pointHoverRadius: 8,
                tension: 0.2,
                fill: false,
                borderWidth: 2,
                spanGaps: false,
            });
        }
        if (pts2.length) {
            ds.push({
                label: psych ? "Psychology P2" : "Business P2",
                data: pts2,
                parsing: false,
                borderColor: c2,
                backgroundColor: "transparent",
                pointBackgroundColor: c2,
                pointBorderColor: "#fff",
                pointBorderWidth: 2,
                pointRadius: 6,
                pointHoverRadius: 8,
                tension: 0.2,
                fill: false,
                borderWidth: 2,
                spanGaps: false,
            });
        }

        var xr = xRangeFromItems(items);
        if (perfChart) perfChart.destroy();

        if (!ds.length) {
            if (summaryEl) {
                summaryEl.innerHTML =
                    "Graded papers found, but none match <strong>" +
                    (psych ? "Psychology" : "Business") +
                    "</strong> P1/P2 <code>paper_type</code> values.";
            }
            if (emptyTl) {
                emptyTl.classList.remove("hidden");
                emptyTl.innerHTML =
                    '<p class="text-sm text-slate-600">No P1 or P2 plot points for this subject. Check <code>paper_type</code> in PocketBase.</p>';
            }
            if (panelEl) panelEl.classList.add("hidden");
            if (perfChart) {
                perfChart.destroy();
                perfChart = null;
            }
            return;
        }

        if (summaryEl) {
            summaryEl.innerHTML =
                "<span class='text-slate-500'>Points plotted:</span> P1 <strong>" +
                pts1.length +
                "</strong>, P2 <strong>" +
                pts2.length +
                "</strong>. Each point is one graded paper at its scheduled date.";
        }

        if (emptyTl) emptyTl.classList.add("hidden");

        perfChart = new Chart(ctx, {
            type: "line",
            data: { datasets: ds },
            options: Object.assign({}, baseChartOptions(xr.min, xr.max), {
                plugins: Object.assign({}, baseChartOptions(xr.min, xr.max).plugins, {
                    tooltip: {
                        backgroundColor: "rgba(15, 23, 42, 0.94)",
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            title: function (items) {
                                if (!items.length) return "";
                                var raw = items[0].raw;
                                return raw && raw.paper_title ? raw.paper_title : "";
                            },
                            label: function (ctx) {
                                var raw = ctx.raw;
                                if (!raw || raw.y == null) return "";
                                var when = raw.scheduled_date ? fmtDate(parseScheduleTime(raw)) : "";
                                var typ = raw.paper_type ? " · " + raw.paper_type : "";
                                var yr = raw.examYear ? " · exam year " + raw.examYear : "";
                                return " Score: " + raw.y + "% (" + when + typ + yr + ")";
                            },
                        },
                    },
                }),
            }),
        });
    };
})(window);
