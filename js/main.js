/**
 * Study Vault bootstrap (classic script — works from file:// and http://).
 * Depends on window.GF from prior scripts and window.jsyaml from js-yaml CDN.
 */
(function (w) {
    const G = w.GF;
    let allPapers = [];

    function escHtml(s) {
        return String(s ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/"/g, "&quot;");
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

    function openSittingDatePicker(recordId) {
        if (!recordId) return;
        const inp = w.document.createElement("input");
        inp.type = "date";
        inp.className = "fixed -left-[9999px] top-0 opacity-0 w-1 h-1";
        inp.setAttribute("aria-hidden", "true");
        const cleanup = function () {
            try {
                if (inp.parentNode) inp.parentNode.removeChild(inp);
            } catch (e) {}
        };
        inp.addEventListener(
            "change",
            async function () {
                const v = inp.value;
                cleanup();
                if (!v) return;
                try {
                    await G.patchPaperRecord(recordId, { scheduled_date: v + " 12:00:00.000Z" });
                    await loadAllData();
                } catch (e) {
                    console.error(e);
                    w.alert("Could not save the date.");
                }
            },
            { once: true }
        );
        w.document.body.appendChild(inp);
        try {
            if (typeof inp.showPicker === "function") inp.showPicker();
            else inp.focus();
        } catch (e1) {
            try {
                inp.focus();
            } catch (e2) {}
        }
    }

    function askUploadAnotherExamModal() {
        const modal = document.getElementById("upload-again-modal");
        const yesBtn = document.getElementById("upload-again-yes");
        const noBtn = document.getElementById("upload-again-no");
        if (!modal || !yesBtn || !noBtn) {
            return Promise.resolve(w.confirm("Exam uploaded. Upload another exam now?"));
        }
        return new Promise(function (resolve) {
            modal.classList.remove("hidden");
            modal.classList.add("flex");

            function finish(v) {
                modal.classList.add("hidden");
                modal.classList.remove("flex");
                yesBtn.removeEventListener("click", onYes);
                noBtn.removeEventListener("click", onNo);
                modal.removeEventListener("click", onBackdrop);
                resolve(v);
            }
            function onYes() {
                finish(true);
            }
            function onNo() {
                finish(false);
            }
            function onBackdrop(ev) {
                if (ev.target === modal) finish(false);
            }
            yesBtn.addEventListener("click", onYes);
            noBtn.addEventListener("click", onNo);
            modal.addEventListener("click", onBackdrop);
        });
    }

    function goToVaultWithPrefill(subject, year, paperNum) {
        G.showView("vault");
        const subjectEl = document.getElementById("paperSub");
        const yearEl = document.getElementById("paperYear");
        const partEl = document.getElementById("paperP");
        if (subjectEl && subject) subjectEl.value = String(subject);
        if (yearEl && year) yearEl.value = String(year);
        if (partEl && paperNum) partEl.value = String(paperNum) === "2" ? "P2" : "P1";
    }

    function yamlCommentsHtml(parsed) {
        if (!parsed || !parsed.data) {
            return '<p class="text-sm text-amber-800">No structured YAML comments found for this paper.</p>';
        }
        const d = parsed.data;
        const strengths = Array.isArray(d.strengths) ? d.strengths : [];
        const weaknesses = Array.isArray(d.weaknesses) ? d.weaknesses : [];
        const questions = Array.isArray(d.questions) ? d.questions : [];
        const summary = typeof d.feedback_summary === "string" ? d.feedback_summary : "";
        var html = "";
        if (summary) {
            html +=
                '<section class="mb-4"><h4 class="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Summary</h4>' +
                '<p class="text-sm text-slate-700 leading-relaxed">' +
                escHtml(summary) +
                "</p></section>";
        }
        if (strengths.length) {
            html +=
                '<section class="mb-4"><h4 class="text-xs font-black uppercase tracking-widest text-emerald-700 mb-1">Strengths</h4><ul class="list-disc pl-5 space-y-1 text-sm text-slate-700">';
            for (let i = 0; i < strengths.length; i++) html += "<li>" + escHtml(strengths[i]) + "</li>";
            html += "</ul></section>";
        }
        if (weaknesses.length) {
            html +=
                '<section class="mb-4"><h4 class="text-xs font-black uppercase tracking-widest text-amber-700 mb-1">Improvements</h4><ul class="list-disc pl-5 space-y-1 text-sm text-slate-700">';
            for (let i = 0; i < weaknesses.length; i++) html += "<li>" + escHtml(weaknesses[i]) + "</li>";
            html += "</ul></section>";
        }
        if (questions.length) {
            html +=
                '<section><h4 class="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Question breakdown</h4><div class="space-y-2">';
            for (let q = 0; q < questions.length; q++) {
                const item = questions[q] || {};
                const qLabel = item.question_no != null ? "Q" + item.question_no : "Question";
                const mark = item.marks_awarded != null ? item.marks_awarded : "—";
                const max = item.max_marks != null ? item.max_marks : "—";
                const note = item.comment || item.feedback || "";
                html +=
                    '<div class="rounded-lg border border-slate-200 bg-white p-2">' +
                    '<p class="text-xs font-black text-slate-700">' +
                    escHtml(qLabel) +
                    " · " +
                    escHtml(mark) +
                    "/" +
                    escHtml(max) +
                    "</p>" +
                    (note ? '<p class="text-xs text-slate-600 mt-1">' + escHtml(note) + "</p>" : "") +
                    "</div>";
            }
            html += "</div></section>";
        }
        if (!html) {
            html = '<p class="text-sm text-slate-600">No comment fields found in this YAML record.</p>';
        }
        if (parsed.warnings && parsed.warnings.length) {
            html +=
                '<p class="mt-4 text-xs text-amber-700 font-bold">Note: ' +
                escHtml(parsed.warnings.join(" · ")) +
                "</p>";
        }
        return html;
    }

    function openYamlCommentsModal(paper) {
        const modal = document.getElementById("yaml-comments-modal");
        const close = document.getElementById("yaml-comments-close");
        const title = document.getElementById("yaml-comments-title");
        const body = document.getElementById("yaml-comments-body");
        if (!modal || !close || !title || !body) return;
        const parsed = paper && paper.full_yaml ? G.parseMarkingYaml(paper.full_yaml, yamlApi()) : null;
        title.textContent = paper && paper.paper_title ? paper.paper_title : "";
        body.innerHTML = yamlCommentsHtml(parsed);

        modal.classList.remove("hidden");
        modal.classList.add("flex");

        function finish() {
            modal.classList.add("hidden");
            modal.classList.remove("flex");
            close.removeEventListener("click", onClose);
            modal.removeEventListener("click", onBackdrop);
        }
        function onClose() {
            finish();
        }
        function onBackdrop(ev) {
            if (ev.target === modal) finish();
        }
        close.addEventListener("click", onClose);
        modal.addEventListener("click", onBackdrop);
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
                title: "Scheduled",
                subtitle: "Paper and mark scheme on record (PocketBase: Planned). Add attempt when you sit the paper.",
                items: q.planned,
            },
            {
                title: "Complete",
                subtitle: "Attempt uploaded — use Log result when you have Gemini YAML (PocketBase: Completed).",
                items: q.completed,
            },
            {
                title: "Marked",
                subtitle: "Graded and scored.",
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
        const items = allPapers;

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
            "all"
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

        const backlogEl = document.getElementById("backlog-grid");
        if (backlogEl) {
            if (typeof G.renderBacklogGrid !== "function") {
                backlogEl.innerHTML =
                    '<p class="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-4">Backlog UI did not load. Open the site from the folder that contains <code class="text-xs">js/ui/backlog.js</code> (or check the browser Network tab for a 404).</p>';
            } else {
                try {
                    const subj = G._backlogTabSubject || "Psychology";
                    if (typeof G.syncBacklogSubjectTabs === "function") G.syncBacklogSubjectTabs(subj);
                    G.renderBacklogGrid(backlogEl, allPapers, subj);
                } catch (e) {
                    console.error(e);
                    backlogEl.innerHTML =
                        '<p class="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-4">Backlog failed to render. Open the developer console (F12) for the error details.</p>';
                }
            }
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

        if (!title) {
            w.alert("Paper title is required.");
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

        const yearEl = document.getElementById("paperYear");
        const yearVal = yearEl && yearEl.value ? String(yearEl.value).trim() : "";

        const formData = new FormData();
        formData.append("paper_title", title);
        formData.append("subject", subject);
        formData.append("paper_type", paper_type);
        if (yearVal) formData.append("year", yearVal);
        formData.append("status", status);
        formData.append(
            "scheduled_date",
            dateVal ? dateVal + " 12:00:00.000Z" : G.SCHEDULE_TBD_PREFIX + " 12:00:00.000Z"
        );
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
            await loadAllData();
            const again = await askUploadAnotherExamModal();
            if (again) {
                if (form) form.reset();
                G.showView("vault");
            } else {
                G.showView("history");
            }
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

        G.registerViewLoader("schedule", function () {
            refreshPapersUi();
        });
        G.registerViewLoader("backlog", function () {
            refreshPapersUi();
        });
        G.registerViewLoader("vault", function () {
            refreshPapersUi();
        });
        G.registerViewLoader("progress", function () {
            G.renderPerformanceChart();
        });
        G.registerViewLoader("history", function () {
            refreshPapersUi();
        });

        wireCalendarNav();

        w.document.body.addEventListener("click", function (ev) {
            const setBtn = ev.target && ev.target.closest && ev.target.closest(".js-set-sitting-date");
            if (setBtn) {
                ev.preventDefault();
                const sid = setBtn.getAttribute("data-id");
                if (sid) openSittingDatePicker(sid);
                return;
            }
            const uploadBtn = ev.target && ev.target.closest && ev.target.closest(".js-backlog-upload");
            if (uploadBtn) {
                ev.preventDefault();
                goToVaultWithPrefill(
                    uploadBtn.getAttribute("data-subject"),
                    uploadBtn.getAttribute("data-year"),
                    uploadBtn.getAttribute("data-paper-num")
                );
                return;
            }
            const gradeBtn = ev.target && ev.target.closest && ev.target.closest(".js-backlog-grade");
            if (gradeBtn) {
                ev.preventDefault();
                const gid = gradeBtn.getAttribute("data-id");
                if (gid) logResult(gid);
                return;
            }
            const commentsBtn = ev.target && ev.target.closest && ev.target.closest(".js-view-yaml-comments");
            if (commentsBtn) {
                ev.preventDefault();
                const pid = commentsBtn.getAttribute("data-id");
                if (!pid) return;
                const paper = allPapers.find(function (p) {
                    return p.id === pid;
                });
                if (!paper) return;
                openYamlCommentsModal(paper);
            }
        });

        G._backlogTabSubject = G._backlogTabSubject || "Psychology";
        (function wireBacklogTabs() {
            const root = document.getElementById("backlog-subject-tabs");
            if (!root || root._wired) return;
            root._wired = true;
            root.querySelectorAll(".backlog-tab").forEach(function (btn) {
                btn.addEventListener("click", function () {
                    const s = btn.getAttribute("data-subject");
                    if (!s) return;
                    G._backlogTabSubject = s;
                    if (typeof G.syncBacklogSubjectTabs === "function") G.syncBacklogSubjectTabs(s);
                    const grid = document.getElementById("backlog-grid");
                    if (grid && typeof G.renderBacklogGrid === "function") {
                        try {
                            G.renderBacklogGrid(grid, allPapers, s);
                        } catch (e) {
                            console.error(e);
                        }
                    }
                });
            });
        })();

        try {
            await loadAllData();
        } catch (e) {
            console.error(e);
        }
        G.showView("schedule");
    });
})(window);
