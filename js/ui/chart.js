(function (w) {
    const G = w.GF;
    let perfChart = null;

    /** Normalized paper_type for matching PocketBase options. */
    const T = {
        BUS_P1: "business p1",
        BUS_P2: "business p2",
        PSY_P1: "psychology p1",
        PSY_P2: "psychology p2",
    };

    G._perfViewMode = "papers";

    function normType(paper) {
        return String(paper.paper_type || "")
            .trim()
            .toLowerCase();
    }

    function parseScheduleTime(p) {
        const t = new Date(p.scheduled_date);
        return t.getTime();
    }

    function sortBySchedule(a, b) {
        return parseScheduleTime(a) - parseScheduleTime(b);
    }

    function fmtDate(ts) {
        return new Date(ts).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    }

    /**
     * Walk grading events in date order; emit a combined point whenever both slots are filled.
     * Re-scores overwrite the latest P1/P2 value (re-sits / updates by row order).
     */
    function buildCombinedSeries(items, key1, key2, subjectLabel) {
        const filtered = items
            .filter(function (p) {
                const t = normType(p);
                return t === key1 || t === key2;
            })
            .sort(sortBySchedule);

        let s1 = null;
        let s2 = null;
        const points = [];
        for (let i = 0; i < filtered.length; i++) {
            const p = filtered[i];
            const t = normType(p);
            const sc = Number(p.score);
            if (Number.isNaN(sc)) continue;
            if (t === key1) s1 = sc;
            if (t === key2) s2 = sc;
            if (s1 != null && s2 != null) {
                points.push({
                    x: parseScheduleTime(p),
                    y: Math.round((s1 + s2) / 2),
                    p1Score: s1,
                    p2Score: s2,
                    subject: subjectLabel,
                    scheduled_date: p.scheduled_date,
                    afterPaper: p.paper_title || p.paper_type,
                });
            }
        }
        return { points: points, latestP1: s1, latestP2: s2 };
    }

    function paperToPoint(p) {
        const x = parseScheduleTime(p);
        return {
            x: x,
            y: Number(p.score),
            paper_title: p.paper_title || "(Untitled)",
            paper_type: p.paper_type || "",
            scheduled_date: p.scheduled_date,
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
                        text: "Scheduled date",
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

    function updatePerfTabStyles() {
        var mode = G._perfViewMode;
        var pBtn = document.getElementById("perf-tab-papers");
        var cBtn = document.getElementById("perf-tab-combined");
        var active = "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide bg-slate-900 text-white shadow-sm";
        var idle =
            "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide bg-slate-100 text-slate-600 hover:bg-slate-200";
        if (pBtn) pBtn.className = mode === "papers" ? active : idle;
        if (cBtn) cBtn.className = mode === "combined" ? active : idle;
        var help = document.getElementById("performance-help");
        if (help) {
            help.innerHTML =
                mode === "papers"
                    ? "<strong>By paper:</strong> four series — Business P1 &amp; P2, Psychology P1 &amp; P2. Each point is one graded paper."
                    : "<strong>Subject combined:</strong> a point appears only when <em>both</em> papers for that subject are graded. The value is the average of P1 and P2 (end-of-pair score). If only one paper is done, no combined point exists yet.";
        }
    }

    G.wirePerformanceTabs = function () {
        var pBtn = document.getElementById("perf-tab-papers");
        var cBtn = document.getElementById("perf-tab-combined");
        if (pBtn && !pBtn._wired) {
            pBtn._wired = true;
            pBtn.addEventListener("click", function () {
                G._perfViewMode = "papers";
                updatePerfTabStyles();
                G.renderPerformanceChart();
            });
        }
        if (cBtn && !cBtn._wired) {
            cBtn._wired = true;
            cBtn.addEventListener("click", function () {
                G._perfViewMode = "combined";
                updatePerfTabStyles();
                G.renderPerformanceChart();
            });
        }
        updatePerfTabStyles();
    };

    G.renderPerformanceChart = async function () {
        var Chart = w.Chart;
        if (!Chart) {
            console.error("Chart.js not loaded");
            return;
        }
        G.wirePerformanceTabs();

        var chartEl = document.getElementById("mainChart");
        var emptyEl = document.getElementById("performance-empty");
        var panelEl = document.getElementById("performance-chart-panel");
        var summaryEl = document.getElementById("performance-summary");
        if (!chartEl) return;

        var items = await G.fetchGradedPapersSorted();
        var hasAnyGraded = items.length > 0;

        if (emptyEl) emptyEl.classList.toggle("hidden", hasAnyGraded);
        if (panelEl) panelEl.classList.toggle("hidden", !hasAnyGraded);
        if (!hasAnyGraded) {
            if (summaryEl) summaryEl.innerHTML = "";
            if (perfChart) {
                perfChart.destroy();
                perfChart = null;
            }
            return;
        }

        var xr = xRangeFromItems(items);
        var ctx = chartEl.getContext("2d");
        if (perfChart) perfChart.destroy();

        if (G._perfViewMode === "papers") {
            var busP1 = filterValidPoints(
                items.filter(function (p) {
                    return normType(p) === T.BUS_P1;
                }).map(paperToPoint)
            );
            var busP2 = filterValidPoints(
                items.filter(function (p) {
                    return normType(p) === T.BUS_P2;
                }).map(paperToPoint)
            );
            var psyP1 = filterValidPoints(
                items.filter(function (p) {
                    return normType(p) === T.PSY_P1;
                }).map(paperToPoint)
            );
            var psyP2 = filterValidPoints(
                items.filter(function (p) {
                    return normType(p) === T.PSY_P2;
                }).map(paperToPoint)
            );

            var ds = [];
            function addDs(label, data, border, bg, pt) {
                if (!data.length) return;
                ds.push({
                    label: label,
                    data: data,
                    parsing: false,
                    borderColor: border,
                    backgroundColor: bg,
                    pointBackgroundColor: pt,
                    pointBorderColor: "#fff",
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    tension: 0.2,
                    fill: false,
                    borderWidth: 2,
                    spanGaps: false,
                });
            }
            addDs("Business P1", busP1, "#047857", "transparent", "#047857");
            addDs("Business P2", busP2, "#34d399", "transparent", "#34d399");
            addDs("Psychology P1", psyP1, "#1d4ed8", "transparent", "#1d4ed8");
            addDs("Psychology P2", psyP2, "#60a5fa", "transparent", "#60a5fa");

            if (!ds.length) {
                if (summaryEl) {
                    summaryEl.innerHTML =
                        "No graded papers matched <strong>Business P1/P2</strong> or <strong>Psychology P1/P2</strong> types. Check each record&rsquo;s <code>paper_type</code> in PocketBase.";
                }
                perfChart = new Chart(ctx, {
                    type: "line",
                    data: { datasets: [] },
                    options: Object.assign({}, baseChartOptions(xr.min, xr.max), {
                        plugins: {
                            legend: { display: false },
                            title: {
                                display: true,
                                text: "No P1/P2 series to plot — paper_type must match Business P1, Business P2, Psychology P1, or Psychology P2.",
                                color: "#94a3b8",
                                font: { size: 13, weight: "600" },
                                padding: { top: 24, bottom: 8 },
                            },
                        },
                    }),
                });
                return;
            }

            if (summaryEl) {
                summaryEl.innerHTML =
                    "<span class='text-slate-500'>Graded counts:</span> Business P1 <strong>" +
                    busP1.length +
                    "</strong>, P2 <strong>" +
                    busP2.length +
                    "</strong> · Psychology P1 <strong>" +
                    psyP1.length +
                    "</strong>, P2 <strong>" +
                    psyP2.length +
                    "</strong>. " +
                    "<span class='text-slate-500'>Switch to <em>Subject combined</em> for P1+P2 averages.</span>";
            }

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
                                    return " Score: " + raw.y + "% (" + when + typ + ")";
                                },
                            },
                        },
                    }),
                }),
            });
            return;
        }

        /* Combined view */
        var busB = buildCombinedSeries(items, T.BUS_P1, T.BUS_P2, "Business");
        var psyB = buildCombinedSeries(items, T.PSY_P1, T.PSY_P2, "Psychology");

        var busPoints = busB.points;
        var psyPoints = psyB.points;

        if (summaryEl) {
            var parts = [];
            if (busB.latestP1 != null && busB.latestP2 != null) {
                parts.push(
                    "<span class='font-bold text-emerald-700'>Business combined</span> (P1+P2 avg): <strong>" +
                        Math.round((busB.latestP1 + busB.latestP2) / 2) +
                        "%</strong> <span class='text-slate-400'>— P1: " +
                        busB.latestP1 +
                        "%, P2: " +
                        busB.latestP2 +
                        "%</span>"
                );
            } else {
                parts.push(
                    "<span class='font-bold text-emerald-700'>Business combined</span>: <span class='text-amber-700'>not available</span> — grade both <strong>Business P1</strong> and <strong>Business P2</strong>."
                );
            }
            if (psyB.latestP1 != null && psyB.latestP2 != null) {
                parts.push(
                    "<span class='font-bold text-blue-700'>Psychology combined</span> (P1+P2 avg): <strong>" +
                        Math.round((psyB.latestP1 + psyB.latestP2) / 2) +
                        "%</strong> <span class='text-slate-400'>— P1: " +
                        psyB.latestP1 +
                        "%, P2: " +
                        psyB.latestP2 +
                        "%</span>"
                );
            } else {
                parts.push(
                    "<span class='font-bold text-blue-700'>Psychology combined</span>: <span class='text-amber-700'>not available</span> — grade both <strong>Psychology P1</strong> and <strong>Psychology P2</strong>."
                );
            }
            parts.push(
                "<br><span class='text-slate-500 text-xs'>Trend points appear when the second paper of a pair is graded (or when you refresh the pair); the average uses the latest P1 and P2 scores to date.</span>"
            );
            summaryEl.innerHTML = parts.join("<br>");
        }

        var combinedDatasets = [];
        if (psyPoints.length) {
            combinedDatasets.push({
                label: "Psychology — average (P1 + P2)",
                data: psyPoints,
                parsing: false,
                borderColor: "#2563eb",
                backgroundColor: "rgba(37, 99, 235, 0.12)",
                pointBackgroundColor: "#2563eb",
                pointBorderColor: "#fff",
                pointBorderWidth: 2,
                pointRadius: 6,
                pointHoverRadius: 8,
                tension: 0.25,
                fill: true,
                borderWidth: 3,
                spanGaps: false,
            });
        }
        if (busPoints.length) {
            combinedDatasets.push({
                label: "Business — average (P1 + P2)",
                data: busPoints,
                parsing: false,
                borderColor: "#059669",
                backgroundColor: "rgba(5, 150, 105, 0.12)",
                pointBackgroundColor: "#059669",
                pointBorderColor: "#fff",
                pointBorderWidth: 2,
                pointRadius: 6,
                pointHoverRadius: 8,
                tension: 0.25,
                fill: true,
                borderWidth: 3,
                spanGaps: false,
            });
        }

        if (!combinedDatasets.length) {
            perfChart = new Chart(ctx, {
                type: "line",
                data: { datasets: [] },
                options: Object.assign({}, baseChartOptions(xr.min, xr.max), {
                    plugins: {
                        legend: { display: false },
                        title: {
                            display: true,
                            text: "No combined scores yet — both P1 and P2 must be graded per subject.",
                            color: "#94a3b8",
                            font: { size: 14, weight: "600" },
                            padding: { top: 24, bottom: 8 },
                        },
                    },
                }),
            });
            return;
        }

        perfChart = new Chart(ctx, {
            type: "line",
            data: { datasets: combinedDatasets },
            options: Object.assign({}, baseChartOptions(xr.min, xr.max), {
                plugins: Object.assign({}, baseChartOptions(xr.min, xr.max).plugins, {
                    tooltip: {
                        backgroundColor: "rgba(15, 23, 42, 0.94)",
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            title: function (items) {
                                if (!items.length) return "";
                                return items[0].dataset.label || "";
                            },
                                label: function (ctx) {
                                var raw = ctx.raw;
                                if (!raw) return "";
                                var when = raw.scheduled_date ? fmtDate(parseScheduleTime(raw)) : "";
                                return (
                                    " Combined: " +
                                    raw.y +
                                    "%  (P1: " +
                                    raw.p1Score +
                                    "%, P2: " +
                                    raw.p2Score +
                                    "%) · " +
                                    when
                                );
                            },
                            afterLabel: function (ctx) {
                                var raw = ctx.raw;
                                if (raw && raw.afterPaper) return "After: " + raw.afterPaper;
                                return "";
                            },
                        },
                    },
                }),
            }),
        });
    };
})(window);
