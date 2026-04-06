/**
 * Study Vault bootstrap (classic script — works from file:// and http://).
 * Depends on window.GF from prior scripts and window.jsyaml from js-yaml CDN.
 */
(function (w) {
    const G = w.GF;
    let allPapers = [];

    function getSubjectFilter() {
        const el = document.getElementById("subjectFilter");
        return el ? el.value : "all";
    }

    function filterPapers(items, filter) {
        if (filter === "all") return items;
        return items.filter((i) => i.subject === filter);
    }

    function updateFocusLabel(filter) {
        const el = document.getElementById("current-focus-label");
        if (!el) return;
        if (filter === "all") el.innerText = "All";
        else if (filter === "Psychology") el.innerText = "Psychology";
        else if (filter === "Business Studies") el.innerText = "Business";
        else el.innerText = filter;
    }

    function papersByIdMap(papers) {
        const m = {};
        for (const p of papers) m[p.id] = p;
        return m;
    }

    function bindPaperRowEvents(root) {
        root.querySelectorAll(".js-log-result").forEach((btn) => {
            btn.addEventListener("click", function () {
                const id = btn.getAttribute("data-id");
                if (id) logResult(id);
            });
        });
        root.querySelectorAll(".js-toggle-detail").forEach((btn) => {
            btn.addEventListener("click", function () {
                const tid = btn.getAttribute("data-target");
                const panel = tid ? document.getElementById(tid) : null;
                if (panel) panel.classList.toggle("hidden");
            });
        });
    }

    const yamlApi = function () {
        return G.resolveYamlApi();
    };

    function partitionQueueByStatus(items) {
        const planned = [];
        const completed = [];
        const graded = [];
        const other = [];
        for (let i = 0; i < items.length; i++) {
            const p = items[i];
            if (G.isGraded(p.status)) graded.push(p);
            else if (p.status === "Completed") completed.push(p);
            else if (p.status === "Planned") planned.push(p);
            else other.push(p);
        }
        return { planned, completed, graded, other };
    }

    function renderSegmentedPaperBlocks(items, boundaries, byId, variant) {
        const q = partitionQueueByStatus(items);
        const sections = [
            {
                title: "Planned",
                subtitle: "Paper and mark scheme on record. Add attempt when you sit the paper.",
                items: q.planned,
            },
            {
                title: "Completed",
                subtitle: "Attempt uploaded — use Log result when you have Gemini YAML.",
                items: q.completed,
            },
            {
                title: "Graded",
                subtitle: "Marked and scored.",
                items: q.graded,
            },
        ];
        if (q.other.length) {
            sections.push({
                title: "Other status",
                subtitle: "Needs a quick check in PocketBase.",
                items: q.other,
            });
        }

        let html = "";
        for (let s = 0; s < sections.length; s++) {
            const sec = sections[s];
            if (!sec.items.length) continue;
            html +=
                '<section class="mb-10 last:mb-0">' +
                '<div class="mb-3 border-b border-slate-200 pb-2">' +
                '<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">' +
                '<h4 class="text-sm font-black uppercase tracking-widest text-slate-800">' +
                sec.title +
                "</h4>" +
                '<span class="text-[10px] font-bold text-slate-400 tabular-nums">' +
                sec.items.length +
                "</span></div>" +
                (sec.subtitle
                    ? '<p class="text-[11px] text-slate-500 mt-1 max-w-2xl">' + sec.subtitle + "</p>"
                    : "") +
                "</div>" +
                '<div class="grid gap-3">';
            for (let j = 0; j < sec.items.length; j++) {
                html += G.buildPaperRowHtml(sec.items[j], boundaries, { variant: variant });
            }
            html += "</div></section>";
        }
        if (!html) {
            html = '<p class="text-sm text-slate-400 py-6">No papers in this filter.</p>';
        }
        return html;
    }

    async function refreshPapersUi() {
        const boundaries = G.getBoundaries();
        const filter = getSubjectFilter();
        const items = filterPapers(allPapers, filter);
        updateFocusLabel(filter);

        const byId = papersByIdMap(allPapers);

        G.renderExamCountdownStrip(document.getElementById("exam-timeline"));
        G.updateSprintPanel(items);

        const grid = document.getElementById("calendar-grid");
        const monthLabel = document.getElementById("calendar-month");
        G.renderCalendar(
            grid,
            monthLabel,
            items,
            function (p) {
                return G.isGraded(p.status);
            },
            filter
        );

        const taskList = document.getElementById("task-list");
        if (taskList) {
            taskList.innerHTML = renderSegmentedPaperBlocks(items, boundaries, byId, "card");
            G.hydrateMarkingDetails(taskList, byId);
            bindPaperRowEvents(taskList);
        }

        const vaultGrid = document.getElementById("vault-paper-grid");
        if (vaultGrid) {
            vaultGrid.innerHTML = renderSegmentedPaperBlocks(items, boundaries, byId, "row");
            G.hydrateMarkingDetails(vaultGrid, byId);
            bindPaperRowEvents(vaultGrid);
        }
    }

    async function loadAllData() {
        await G.loadBoundaries();
        await G.loadSettings();
        allPapers = await G.fetchPapersSorted();
        await refreshPapersUi();
    }

    async function logResult(id) {
        const ytext = w.prompt("Paste Gemini YAML:");
        if (!ytext) return;
        const api = yamlApi();
        const parsed = G.parseMarkingYaml(ytext, api);
        if (parsed.warnings.length && !w.confirm(parsed.warnings.join("\n") + "\n\nSave anyway?")) return;
        let score = parsed.data ? G.scoreFromParsed(parsed.data) : null;
        if (score == null) {
            const m = ytext.match(/score:\s*(\d+)/i);
            if (m) score = parseInt(m[1], 10);
        }
        if (
            score == null &&
            !w.confirm(parsed.error ? parsed.error + "\nNo valid score. Save anyway?" : "No valid score. Save anyway?")
        )
            return;

        const ai_summary = parsed.data ? G.summaryFromParsed(parsed.data) : "";
        await G.patchPaperRecord(id, {
            score: score !== undefined && score !== null ? score : undefined,
            status: G.STATUS_GRADED,
            full_yaml: ytext,
            ai_summary: ai_summary || undefined,
        });
        await loadAllData();
    }

    async function savePaper() {
        const form = document.getElementById("vault-deposit-form");
        const titleEl = document.getElementById("paperTitle");
        const title = titleEl && titleEl.value ? titleEl.value.trim() : "";
        const subjectEl = document.getElementById("paperSub");
        const subject = subjectEl ? subjectEl.value : "";
        const partEl = document.getElementById("paperP");
        const part = partEl ? partEl.value : "";
        const dateEl = document.getElementById("paperDate");
        const dateVal = dateEl ? dateEl.value : "";
        const histEl = document.getElementById("historicYaml");
        const historicYaml = histEl && histEl.value ? histEl.value.trim() : "";

        if (!title || !dateVal) {
            w.alert("Paper title and target date are required.");
            return;
        }

        const fp = document.getElementById("filePaper") && document.getElementById("filePaper").files[0];
        const fs = document.getElementById("fileScheme") && document.getElementById("fileScheme").files[0];
        const fa = document.getElementById("fileAttempt") && document.getElementById("fileAttempt").files[0];

        let hasGrading = false;
        let score = null;
        let full_yaml = "";
        let ai_summary = "";
        const api = yamlApi();

        if (historicYaml) {
            const parsed = G.parseMarkingYaml(historicYaml, api);
            if (parsed.error && !w.confirm("YAML issue: " + parsed.error + "\nContinue without structured fields?")) return;
            if (parsed.warnings.length && !w.confirm(parsed.warnings.join("\n") + "\n\nContinue?")) return;
            if (parsed.data) {
                score = G.scoreFromParsed(parsed.data);
                ai_summary = G.summaryFromParsed(parsed.data);
                full_yaml = historicYaml;
                hasGrading = score != null;
            }
        }

        const status = G.depositStatus({ hasAttempt: !!fa, hasGrading: hasGrading });
        const typePrefix =
            subject === "Business Studies" ? "Business" : subject === "Psychology" ? "Psychology" : subject.split(" ")[0];
        const paper_type = typePrefix + " " + part;

        const formData = new FormData();
        formData.append("paper_title", title);
        formData.append("subject", subject);
        formData.append("paper_type", paper_type);
        formData.append("status", status);
        formData.append("scheduled_date", dateVal + " 12:00:00.000Z");
        if (fp) formData.append("file_paper", fp);
        if (fs) formData.append("file_scheme", fs);
        if (fa) formData.append("file_attempt", fa);
        if (hasGrading) {
            formData.append("score", String(score));
            formData.append("full_yaml", full_yaml);
            if (ai_summary) formData.append("ai_summary", ai_summary);
        }

        const res = await G.createPaperRecord(formData);
        if (res.ok) {
            if (form) form.reset();
            G.showView("action");
            await loadAllData();
        } else {
            const t = await res.text();
            console.error(t);
            w.alert("Upload failed.");
        }
    }

    function wireCalendarNav() {
        const prev = document.getElementById("cal-prev");
        if (prev)
            prev.addEventListener("click", function () {
                G.shiftMonth(-1);
                refreshPapersUi();
            });
        const next = document.getElementById("cal-next");
        if (next)
            next.addEventListener("click", function () {
                G.shiftMonth(1);
                refreshPapersUi();
            });
        const today = document.getElementById("cal-today");
        if (today)
            today.addEventListener("click", function () {
                const n = new Date();
                G.setCalendarView(n.getFullYear(), n.getMonth());
                refreshPapersUi();
            });
    }

    w.showView = G.showView;
    w.savePaper = savePaper;
    w.logResult = logResult;

    w.addEventListener("DOMContentLoaded", async function () {
        const n = new Date();
        G.setCalendarView(n.getFullYear(), n.getMonth());

        G.registerViewLoader("dashboard", function () {
            refreshPapersUi();
        });
        G.registerViewLoader("action", function () {
            refreshPapersUi();
        });
        G.registerViewLoader("vault", function () {
            refreshPapersUi();
        });
        G.registerViewLoader("progress", function () {
            G.renderPerformanceChart();
        });

        const sub = document.getElementById("subjectFilter");
        if (sub)
            sub.addEventListener("change", function () {
                refreshPapersUi();
            });

        wireCalendarNav();

        try {
            await loadAllData();
        } catch (e) {
            console.error(e);
        }
        G.showView("dashboard");
    });
})(window);
