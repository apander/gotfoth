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
                if (id) void openGradeYamlModal(id);
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

    function cloneReplaceFileInput(id) {
        const el = document.getElementById(id);
        if (!el || el.type !== "file") return;
        const next = el.cloneNode(true);
        next.value = "";
        el.parentNode.replaceChild(next, el);
    }

    function clearVaultUploadFilesAndYaml() {
        cloneReplaceFileInput("filePaper");
        cloneReplaceFileInput("fileScheme");
        cloneReplaceFileInput("fileAttempt");
        cloneReplaceFileInput("historicYamlFile");
        const hy = document.getElementById("historicYaml");
        if (hy) hy.value = "";
    }

    function prepareExamAdminView() {
        clearVaultUploadFilesAndYaml();
        updateVaultDerivedNamePreview();
    }

    function showVaultUploadPanel() {
        const el = document.getElementById("vault-upload-panel");
        if (!el) return;
        el.classList.remove("hidden");
        try {
            el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } catch (e) {}
    }

    function hideVaultUploadPanel() {
        const el = document.getElementById("vault-upload-panel");
        if (!el) return;
        el.classList.add("hidden");
    }

    function updateVaultDerivedNamePreview() {
        const el = document.getElementById("vault-derived-name");
        if (!el || typeof G.derivedPaperDisplayNameFromVaultFields !== "function") return;
        const subEl = document.getElementById("paperSub");
        const partEl = document.getElementById("paperP");
        const yearEl = document.getElementById("paperYear");
        const sub = subEl ? subEl.value : "";
        const part = partEl ? partEl.value : "";
        const yr = yearEl ? yearEl.value : "";
        el.textContent = G.derivedPaperDisplayNameFromVaultFields(sub, part, yr);
    }

    function subjectToPaperTypePrefix(subject) {
        if (subject === "Business Studies") return "Business";
        if (subject === "Psychology") return "Psychology";
        return String(subject || "").split(" ")[0] || "Psychology";
    }

    function openExamsUploadWithPrefill(subject, year, paperNum) {
        G.showView("exams");
        prepareExamAdminView();
        const subjectEl = document.getElementById("paperSub");
        const yearEl = document.getElementById("paperYear");
        const partEl = document.getElementById("paperP");
        if (subjectEl && subject) subjectEl.value = String(subject);
        if (yearEl && year) yearEl.value = String(year);
        if (partEl && paperNum) partEl.value = String(paperNum) === "2" ? "P2" : "P1";
        updateVaultDerivedNamePreview();
        showVaultUploadPanel();
    }

    function scheduledDateForInput(paper) {
        const d = paper && paper.scheduled_date;
        if (!d || String(d).startsWith(G.SCHEDULE_TBD_PREFIX)) return "";
        return String(d).slice(0, 10);
    }

    function clearExamEditFileInputs() {
        cloneReplaceFileInput("exam-edit-file-paper");
        cloneReplaceFileInput("exam-edit-file-scheme");
        cloneReplaceFileInput("exam-edit-file-attempt");
        cloneReplaceFileInput("exam-edit-yaml-file");
        const y = document.getElementById("exam-edit-yaml");
        if (y) y.value = "";
    }

    function bindCurrentFileLink(anchorId, paper, field) {
        const a = document.getElementById(anchorId);
        if (!a) return;
        const u = paper && G.fileUrl ? G.fileUrl(paper, field) : null;
        if (!u) {
            a.classList.add("hidden");
            a.removeAttribute("href");
            return;
        }
        a.href = u;
        a.classList.remove("hidden");
    }

    function readTextFromOptionalFile(inputId) {
        const inp = document.getElementById(inputId);
        const f = inp && inp.files && inp.files[0];
        if (!f) return Promise.resolve("");
        return new Promise(function (resolve, reject) {
            const fr = new FileReader();
            fr.onload = function () {
                resolve(String(fr.result || ""));
            };
            fr.onerror = function () {
                reject(new Error("Could not read file from " + inputId));
            };
            fr.readAsText(f);
        });
    }

    async function collectYamlFromInputs(textId, fileId) {
        const textEl = document.getElementById(textId);
        const typed = textEl && textEl.value ? String(textEl.value).trim() : "";
        if (typed) return typed;
        const fromFile = await readTextFromOptionalFile(fileId);
        return fromFile ? String(fromFile).trim() : "";
    }

    function openExamEditModal(paper) {
        const modal = document.getElementById("exam-edit-modal");
        if (!modal || !paper) return;
        document.getElementById("exam-edit-id").value = paper.id;
        const sub = document.getElementById("exam-edit-subject");
        if (sub) sub.value = paper.subject === "Business Studies" ? "Business Studies" : "Psychology";
        const yr = document.getElementById("exam-edit-year");
        if (yr && paper.year != null && paper.year !== "") yr.value = String(paper.year).trim();
        const part = document.getElementById("exam-edit-part");
        if (part) {
            const n = G.paperNumFromType(paper);
            part.value = n === 2 ? "P2" : "P1";
        }
        const dt = document.getElementById("exam-edit-date");
        if (dt) dt.value = scheduledDateForInput(paper);
        bindCurrentFileLink("exam-edit-link-paper", paper, "file_paper");
        bindCurrentFileLink("exam-edit-link-scheme", paper, "file_scheme");
        bindCurrentFileLink("exam-edit-link-attempt", paper, "file_attempt");
        clearExamEditFileInputs();
        const yEl = document.getElementById("exam-edit-yaml");
        if (yEl && typeof G.resolveMarkingYamlText === "function" && typeof G.hasMarkingYamlContent === "function") {
            if (G.hasMarkingYamlContent(paper)) {
                void G.resolveMarkingYamlText(paper).then(function (t) {
                    if (t) yEl.value = t;
                });
            }
        }
        modal.classList.remove("hidden");
        modal.classList.add("flex");
    }

    function closeExamEditModal() {
        const modal = document.getElementById("exam-edit-modal");
        if (!modal) return;
        modal.classList.add("hidden");
        modal.classList.remove("flex");
        clearExamEditFileInputs();
    }

    async function saveExamEdit(opts) {
        opts = opts || {};
        const id = document.getElementById("exam-edit-id") && document.getElementById("exam-edit-id").value;
        if (!id) return;
        const subj = document.getElementById("exam-edit-subject") && document.getElementById("exam-edit-subject").value;
        const yearVal =
            document.getElementById("exam-edit-year") && document.getElementById("exam-edit-year").value;
        const part = document.getElementById("exam-edit-part") && document.getElementById("exam-edit-part").value;
        const dateVal = document.getElementById("exam-edit-date") && document.getElementById("exam-edit-date").value;
        const prefix = subjectToPaperTypePrefix(subj);
        const paper_type = prefix + " " + String(part || "P1").toUpperCase();
        const fp = document.getElementById("exam-edit-file-paper") && document.getElementById("exam-edit-file-paper").files[0];
        const fs = document.getElementById("exam-edit-file-scheme") && document.getElementById("exam-edit-file-scheme").files[0];
        const fa = document.getElementById("exam-edit-file-attempt") && document.getElementById("exam-edit-file-attempt").files[0];
        const hasFileUploads = !!(fp || fs || fa);

        const editYaml = await collectYamlFromInputs("exam-edit-yaml", "exam-edit-yaml-file");
        let parsedPrimary = null;
        if (editYaml) {
            parsedPrimary = G.parseMarkingYaml(editYaml, yamlApi());
            if (parsedPrimary.error && !w.confirm("YAML issue: " + parsedPrimary.error + "\nSave anyway?")) return;
            if (parsedPrimary.warnings.length && !w.confirm(parsedPrimary.warnings.join("\n") + "\n\nSave anyway?")) return;
        } else if (opts.retake) {
            if (!fa) {
                w.alert("Retake requires a new attempt file.");
                return;
            }
        }

        const scheduled =
            dateVal ? dateVal + " 12:00:00.000Z" : G.SCHEDULE_TBD_PREFIX + " 12:00:00.000Z";

        const existingPaper = allPapers.find(function (p) {
            return p.id === id;
        });
        const yamlPack = editYaml
            ? typeof G.packMarkingYamlForSave === "function"
                ? G.packMarkingYamlForSave(editYaml, {
                      hadMarkingFile: !!(existingPaper && existingPaper.file_marking_yaml),
                  })
                : { full_yaml: editYaml, markingBlob: null, clearMarkingFile: false }
            : null;
        const needsYamlMultipart = !!(yamlPack && yamlPack.markingBlob);
        const useMultipart = hasFileUploads || needsYamlMultipart;

        try {
            if (useMultipart) {
                const fd = new FormData();
                fd.append("subject", subj);
                if (yearVal) fd.append("year", String(yearVal).trim());
                fd.append("paper_type", paper_type);
                fd.append("scheduled_date", scheduled);
                if (fp) fd.append("file_paper", fp);
                if (fs) fd.append("file_scheme", fs);
                if (fa) fd.append("file_attempt", fa);
                if (editYaml && yamlPack) {
                    const sum = parsedPrimary.data ? G.summaryFromParsed(parsedPrimary.data) : "";
                    const sc = parsedPrimary.data ? G.scoreFromParsed(parsedPrimary.data) : null;
                    fd.append("full_yaml", yamlPack.full_yaml);
                    if (yamlPack.markingBlob) fd.append("file_marking_yaml", yamlPack.markingBlob, "marking.yaml");
                    if (sum) fd.append("ai_summary", sum);
                    if (sc != null) fd.append("score", String(sc));
                    fd.append("status", G.STATUS_GRADED);
                } else if (opts.retake) {
                    fd.append("status", G.STATUS_COMPLETED);
                    fd.append("score", "");
                    fd.append("full_yaml", "");
                    fd.append("ai_summary", "");
                }
                await G.patchPaperRecordMultipart(id, fd);
                if (yamlPack && yamlPack.clearMarkingFile && !yamlPack.markingBlob) {
                    await G.patchPaperRecord(id, { file_marking_yaml: null });
                }
                if (opts.retake && existingPaper && existingPaper.file_marking_yaml) {
                    await G.patchPaperRecord(id, { file_marking_yaml: null });
                }
            } else {
                const body = {
                    subject: subj,
                    paper_type: paper_type,
                    scheduled_date: scheduled,
                };
                if (yearVal) body.year = String(yearVal).trim();
                if (editYaml && yamlPack) {
                    body.full_yaml = yamlPack.full_yaml;
                    const sum = parsedPrimary.data ? G.summaryFromParsed(parsedPrimary.data) : "";
                    if (sum) body.ai_summary = sum;
                    const sc = parsedPrimary.data ? G.scoreFromParsed(parsedPrimary.data) : null;
                    if (sc != null) body.score = sc;
                    body.status = G.STATUS_GRADED;
                    if (yamlPack.clearMarkingFile) body.file_marking_yaml = null;
                }
                await G.patchPaperRecord(id, body);
            }
            closeExamEditModal();
            await loadAllData();
        } catch (e) {
            console.error(e);
            w.alert(
                "Could not save changes." +
                    (e && e.message ? "\n\n" + e.message : "\n\nCheck the browser Network tab for the PATCH response.")
            );
        }
    }

    function yamlStrOrArrayToList(val) {
        if (val == null) return [];
        if (Array.isArray(val)) {
            const out = [];
            for (let i = 0; i < val.length; i++) {
                const s = val[i] == null ? "" : String(val[i]).trim();
                if (s) out.push(s);
            }
            return out;
        }
        const t = String(val).trim();
        return t ? [t] : [];
    }

    function yamlHtmlUl(items) {
        if (!items || !items.length) return "";
        let h = '<ul class="list-disc pl-4 space-y-1 text-xs text-slate-700">';
        for (let i = 0; i < items.length; i++) h += "<li>" + escHtml(items[i]) + "</li>";
        return h + "</ul>";
    }

    function normalizeYamlQuestion(item, idx) {
        const q = item || {};
        const rawLabel = q.id != null ? String(q.id) : q.question_no != null ? "Q" + q.question_no : "Q" + (idx + 1);
        const rawScore = q.score;
        const rawMax = q.max;
        const score = rawScore != null && !Number.isNaN(Number(rawScore)) ? Number(rawScore) : null;
        const max = rawMax != null && !Number.isNaN(Number(rawMax)) ? Number(rawMax) : null;
        const pct = score != null && max != null && max > 0 ? Math.round((score / max) * 100) : null;
        const isFullMarks = score != null && max != null && max > 0 && score >= max;
        const needsImprovement = score != null && max != null && max > 0 && score < max;
        const tone =
            pct == null ? "bg-slate-100 text-slate-700 border-slate-200" : pct >= 70 ? "bg-emerald-100 text-emerald-800 border-emerald-200" : pct >= 50 ? "bg-amber-100 text-amber-900 border-amber-200" : "bg-rose-100 text-rose-800 border-rose-200";
        const gObj = q.guidance && typeof q.guidance === "object" ? q.guidance : null;
        const topicsList = yamlStrOrArrayToList(
            gObj && gObj.topics_to_review != null ? gObj.topics_to_review : q.topics_to_review
        );
        const techniqueList = yamlStrOrArrayToList(
            gObj && gObj.exam_technique_tips != null ? gObj.exam_technique_tips : q.exam_technique_tips
        );
        return {
            key: "q-" + idx,
            label: rawLabel,
            scoreText: (score != null ? score : "—") + "/" + (max != null ? max : "—"),
            pctText: pct == null ? "—" : pct + "%",
            tone: tone,
            questionText: q.question_text ? String(q.question_text) : "",
            answer: q.student_answer ? String(q.student_answer) : "",
            perfectAnswer: q.perfect_answer ? String(q.perfect_answer) : "",
            note: q.improvement_tip ? String(q.improvement_tip) : "",
            topicsList: topicsList,
            techniqueList: techniqueList,
            isFullMarks: isFullMarks,
            needsImprovement: needsImprovement,
        };
    }

    function yamlCommentsHtml(parsed, paper) {
        if (!parsed || !parsed.data) {
            return '<p class="text-sm text-amber-800">No structured YAML comments found for this paper.</p>';
        }
        const d = parsed.data;
        const strengths = Array.isArray(d.strengths) ? d.strengths : [];
        const weaknesses = Array.isArray(d.weaknesses) ? d.weaknesses : [];
        const questions = Array.isArray(d.questions) ? d.questions : [];
        const overallPctRaw = d.total_percentage;
        const overallPct =
            overallPctRaw != null && !Number.isNaN(Number(overallPctRaw)) ? Math.round(Number(overallPctRaw)) : null;
        const grade =
            overallPct != null && paper && paper.subject
                ? G.letterGradeFromPercent(overallPct, G.getBoundaries(), paper.subject)
                : "N/A";
        const summary = typeof d.overall_summary === "string" ? d.overall_summary : "";
        const sg = d.study_guidance && typeof d.study_guidance === "object" ? d.study_guidance : null;
        const globalTopics = yamlStrOrArrayToList(sg && sg.topics_to_review != null ? sg.topics_to_review : null);
        const globalTechnique = yamlStrOrArrayToList(
            sg && sg.exam_technique_tips != null ? sg.exam_technique_tips : null
        );
        const calmMessage =
            sg && typeof sg.calm_message === "string" && sg.calm_message.trim()
                ? sg.calm_message.trim()
                : typeof d.calm_message === "string" && d.calm_message.trim()
                  ? d.calm_message.trim()
                  : "";
        const cards = [];
        for (let q = 0; q < questions.length; q++) cards.push(normalizeYamlQuestion(questions[q], q));
        const fullMarksCount = cards.filter(function (c) {
            return c.isFullMarks;
        }).length;
        const improveCount = cards.filter(function (c) {
            return c.needsImprovement;
        }).length;

        let html = "";
        html +=
            '<p class="text-xs text-slate-500 leading-relaxed mb-3">Pause for a moment. Use the tabs below—start with your score, then your study plan, then each question.</p>' +
            '<nav class="sticky top-0 z-20 -mx-1 px-1 py-2 mb-3 flex flex-wrap gap-1.5 bg-slate-50 border-b border-slate-200/80" role="tablist" aria-label="Review sections">' +
            '<button type="button" role="tab" aria-selected="true" class="js-review-tab px-3 py-2 rounded-xl border text-xs font-black border-slate-900 bg-slate-900 text-white shadow-sm" data-review-tab="overview">1 · Score</button>' +
            '<button type="button" role="tab" aria-selected="false" class="js-review-tab px-3 py-2 rounded-xl border text-xs font-black border-slate-200 bg-white text-slate-600 hover:bg-slate-100" data-review-tab="guidance">2 · Study plan</button>' +
            '<button type="button" role="tab" aria-selected="false" class="js-review-tab px-3 py-2 rounded-xl border text-xs font-black border-slate-200 bg-white text-slate-600 hover:bg-slate-100" data-review-tab="questions">3 · Questions</button>' +
            "</nav>";

        html += '<div class="js-review-panel" data-review-tab="overview">';
        if (calmMessage) {
            html +=
                '<div class="rounded-xl border border-sky-100 bg-sky-50/80 p-3 mb-3"><p class="text-xs text-sky-900 leading-relaxed">' +
                escHtml(calmMessage) +
                "</p></div>";
        }
        html +=
            '<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm mb-4">' +
            '<p class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Your result</p>' +
            '<div class="grid grid-cols-2 gap-x-8 gap-y-0 items-start text-left max-w-sm">' +
            '<div class="flex flex-col gap-1 min-w-0">' +
            '<p class="text-[10px] font-black uppercase tracking-wide text-slate-500 leading-none">Grade</p>' +
            '<p class="text-4xl font-black text-slate-900 tabular-nums leading-none tracking-tight">' +
            escHtml(grade || "N/A") +
            "</p></div>" +
            '<div class="flex flex-col gap-1 min-w-0">' +
            '<p class="text-[10px] font-black uppercase tracking-wide text-slate-500 leading-none">Score</p>' +
            '<p class="text-4xl font-black text-slate-800 tabular-nums leading-none tracking-tight">' +
            escHtml(overallPct == null ? "—" : String(overallPct) + "%") +
            "</p></div></div>";
        if (summary) {
            html +=
                '<p class="mt-4 text-sm text-slate-700 leading-relaxed border-t border-slate-100 pt-4">' +
                escHtml(summary) +
                "</p>";
        }
        html += "</div>";
        if (strengths.length || weaknesses.length) {
            html += '<div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">';
            if (strengths.length) {
                html +=
                    '<section class="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3"><h4 class="text-[10px] font-black uppercase tracking-widest text-emerald-800 mb-2">What went well</h4>' +
                    yamlHtmlUl(strengths) +
                    "</section>";
            }
            if (weaknesses.length) {
                html +=
                    '<section class="rounded-xl border border-amber-100 bg-amber-50/40 p-3"><h4 class="text-[10px] font-black uppercase tracking-widest text-amber-900 mb-2">Overall gaps</h4>' +
                    yamlHtmlUl(weaknesses) +
                    "</section>";
            }
            html += "</div>";
        }
        html += "</div>";

        html += '<div class="js-review-panel hidden" data-review-tab="guidance">';
        html +=
            '<p class="text-xs text-slate-600 mb-3">Section <span class="font-black text-slate-800">A</span> is syllabus content to revisit. Section <span class="font-black text-slate-800">B</span> is how to approach papers and wording under exam conditions.</p>';
        if (globalTopics.length || globalTechnique.length) {
            html +=
                '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' +
                '<section class="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 min-h-[4rem]"><h4 class="text-[10px] font-black uppercase tracking-widest text-indigo-900 mb-2">A · Topics &amp; content</h4>' +
                (globalTopics.length ? yamlHtmlUl(globalTopics) : '<p class="text-xs text-slate-500">No topics listed yet.</p>') +
                "</section>" +
                '<section class="rounded-xl border border-teal-100 bg-teal-50/50 p-3 min-h-[4rem]"><h4 class="text-[10px] font-black uppercase tracking-widest text-teal-900 mb-2">B · Exam technique</h4>' +
                (globalTechnique.length ? yamlHtmlUl(globalTechnique) : '<p class="text-xs text-slate-500">No technique tips listed yet.</p>') +
                "</section></div>";
        } else {
            html +=
                '<div class="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-600">' +
                "When your grading file includes <code class=\"text-xs bg-slate-100 px-1 rounded\">study_guidance</code> with " +
                "<code class=\"text-xs bg-slate-100 px-1 rounded\">topics_to_review</code> and " +
                "<code class=\"text-xs bg-slate-100 px-1 rounded\">exam_technique_tips</code>, they will appear here.</div>";
        }
        html += "</div>";

        html += '<div class="js-review-panel hidden" data-review-tab="questions">';
        if (cards.length) {
            html +=
                '<p class="text-xs text-slate-600 mb-2">Jump to a question, then open it for the same <span class="font-black">A</span> (content) and <span class="font-black">B</span> (technique) feedback.</p>' +
                '<div class="flex flex-wrap gap-1.5 mb-2">' +
                '<button type="button" class="js-qfilter px-2 py-1 rounded-md border text-[10px] font-black bg-slate-900 text-white border-slate-900" data-filter="all">All (' +
                cards.length +
                ")</button>" +
                '<button type="button" class="js-qfilter px-2 py-1 rounded-md border text-[10px] font-black text-amber-900 border-amber-200 bg-amber-50 hover:bg-amber-100" data-filter="needs-improvement">Needs work (' +
                improveCount +
                ")</button>" +
                '<button type="button" class="js-qfilter px-2 py-1 rounded-md border text-[10px] font-black text-emerald-800 border-emerald-200 bg-emerald-50 hover:bg-emerald-100" data-filter="full-marks">Full marks (' +
                fullMarksCount +
                ")</button>" +
                '<button type="button" class="js-qtoggle-dropped px-2 py-1 rounded-md border text-[10px] font-black text-slate-700 border-slate-300 bg-white hover:bg-slate-100" data-active="0">Dropped marks only</button>' +
                "</div>" +
                '<div class="flex flex-wrap gap-1.5 mb-2">';
            for (let i = 0; i < cards.length; i++) {
                const c = cards[i];
                html +=
                    '<button type="button" class="js-qnav px-2 py-1 rounded-md border text-[10px] font-black ' +
                    c.tone +
                    '" data-target="' +
                    escHtml(c.key) +
                    '" data-qfilter="' +
                    (c.isFullMarks ? "full-marks" : c.needsImprovement ? "needs-improvement" : "other") +
                    '">' +
                    escHtml(c.label) +
                    " " +
                    escHtml(c.scoreText) +
                    "</button>";
            }
            html += "</div><div class=\"space-y-2\">";
            for (let i = 0; i < cards.length; i++) {
                const c = cards[i];
                const hasAb = (c.topicsList && c.topicsList.length) || (c.techniqueList && c.techniqueList.length);
                let feedbackBlock = "";
                if (hasAb) {
                    feedbackBlock +=
                        '<div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">' +
                        '<div class="rounded-lg border border-indigo-100 bg-indigo-50/50 p-2"><p class="text-[10px] uppercase tracking-wide text-indigo-900 font-black mb-1">A · Content</p>' +
                        (c.topicsList && c.topicsList.length
                            ? yamlHtmlUl(c.topicsList)
                            : '<p class="text-xs text-slate-500">—</p>') +
                        "</div>" +
                        '<div class="rounded-lg border border-teal-100 bg-teal-50/50 p-2"><p class="text-[10px] uppercase tracking-wide text-teal-900 font-black mb-1">B · Technique</p>' +
                        (c.techniqueList && c.techniqueList.length
                            ? yamlHtmlUl(c.techniqueList)
                            : '<p class="text-xs text-slate-500">—</p>') +
                        "</div></div>";
                }
                if (c.note) {
                    feedbackBlock +=
                        '<div class="mt-2 rounded-md border border-amber-100 bg-amber-50/70 p-2"><p class="text-[10px] uppercase tracking-wide text-amber-800 font-black mb-1">' +
                        (hasAb ? "Extra note" : "Feedback") +
                        '</p><p class="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">' +
                        escHtml(c.note) +
                        "</p></div>";
                }
                html +=
                    '<details id="' +
                    escHtml(c.key) +
                    '" class="js-qdetail rounded-lg border border-slate-200 bg-white p-2 group" data-qfilter="' +
                    (c.isFullMarks ? "full-marks" : c.needsImprovement ? "needs-improvement" : "other") +
                    '">' +
                    '<summary class="cursor-pointer list-none flex items-start justify-between gap-2">' +
                    '<span class="min-w-0"><span class="text-xs font-black text-slate-800">' +
                    escHtml(c.label) +
                    '</span><span class="ml-2 inline-flex px-1.5 py-0.5 rounded-md border text-[10px] font-black ' +
                    c.tone +
                    '">' +
                    escHtml(c.pctText) +
                    "</span></span>" +
                    '<span class="text-[11px] font-black text-slate-700 tabular-nums shrink-0">' +
                    escHtml(c.scoreText) +
                    "</span></summary>" +
                    (c.questionText
                        ? '<div class="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2"><p class="text-[10px] uppercase tracking-wide text-slate-500 font-black mb-1">Question</p><p class="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">' +
                          escHtml(c.questionText) +
                          "</p></div>"
                        : "") +
                    (c.answer || c.perfectAnswer
                        ? '<div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">' +
                          (c.answer
                              ? '<div class="rounded-md border border-blue-100 bg-blue-50/70 p-2"><p class="text-[10px] uppercase tracking-wide text-blue-700 font-black mb-1">Your answer</p><p class="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">' +
                                escHtml(c.answer) +
                                "</p></div>"
                              : "") +
                          (c.perfectAnswer
                              ? '<div class="rounded-md border border-emerald-100 bg-emerald-50/70 p-2"><p class="text-[10px] uppercase tracking-wide text-emerald-700 font-black mb-1">Model answer</p><p class="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">' +
                                escHtml(c.perfectAnswer) +
                                "</p></div>"
                              : "") +
                          "</div>"
                        : "") +
                    (feedbackBlock ||
                        '<p class="mt-2 text-xs text-slate-500">No written feedback for this question in the file.</p>') +
                    "</details>";
            }
            html += "</div>";
        } else {
            html +=
                '<p class="text-sm text-slate-600">This file does not include per-question entries. Ask your teacher to add a <code class="text-xs bg-slate-100 px-1 rounded">questions</code> list for question-by-question navigation.</p>';
        }
        html += "</div>";

        if (parsed.warnings && parsed.warnings.length) {
            html +=
                '<p class="mt-4 text-xs text-amber-700 font-bold">Note: ' +
                escHtml(parsed.warnings.join(" · ")) +
                "</p>";
        }
        return html;
    }

    async function openYamlCommentsModal(paper) {
        const modal = document.getElementById("yaml-comments-modal");
        const close = document.getElementById("yaml-comments-close");
        const title = document.getElementById("yaml-comments-title");
        const body = document.getElementById("yaml-comments-body");
        const controls = document.getElementById("yaml-viewer-controls");
        const commentsPanel = document.getElementById("yaml-comments-panel");
        const btnPaper = document.getElementById("yaml-view-paper");
        const btnScheme = document.getElementById("yaml-view-scheme");
        const btnAttempt = document.getElementById("yaml-view-attempt");
        const viewerWrap = document.getElementById("yaml-file-viewer-wrap");
        const viewerPanel = document.getElementById("yaml-file-viewer-panel");
        const viewerTitle = document.getElementById("yaml-file-viewer-title");
        const viewerFrame = document.getElementById("yaml-file-viewer-frame");
        const viewerClose = document.getElementById("yaml-file-viewer-close");
        const viewerFullscreen = document.getElementById("yaml-file-viewer-fullscreen");
        if (!modal || !close || !title || !body) return;
        const raw =
            paper && typeof G.resolveMarkingYamlText === "function" ? await G.resolveMarkingYamlText(paper) : "";
        const parsed = raw ? G.parseMarkingYaml(raw, yamlApi()) : null;
        title.textContent = paper && G.derivedPaperDisplayName ? G.derivedPaperDisplayName(paper) : "";
        body.innerHTML = yamlCommentsHtml(parsed, paper);
        body.setAttribute("data-qfilter-mode", "all");
        body.setAttribute("data-qonly-dropped", "0");

        const filePaper = paper && G.fileUrl ? G.fileUrl(paper, "file_paper") : null;
        const fileScheme = paper && G.fileUrl ? G.fileUrl(paper, "file_scheme") : null;
        const fileAttempt = paper && G.fileUrl ? G.fileUrl(paper, "file_attempt") : null;
        if (controls) controls.classList.toggle("hidden", !filePaper && !fileScheme && !fileAttempt);
        if (btnPaper) btnPaper.classList.toggle("hidden", !filePaper);
        if (btnScheme) btnScheme.classList.toggle("hidden", !fileScheme);
        if (btnAttempt) btnAttempt.classList.toggle("hidden", !fileAttempt);
        if (viewerWrap) {
            viewerWrap.classList.add("max-h-0", "opacity-0", "mt-0");
            viewerWrap.classList.remove("max-h-screen", "opacity-100", "mt-2");
        }
        if (viewerFrame) viewerFrame.removeAttribute("src");
        let viewerExpandedFallback = false;

        modal.classList.remove("hidden");
        modal.classList.add("flex");

        function viewerSrcForUrl(url) {
            if (!url) return "";
            const m = String(url).match(/\.([a-z0-9]+)(?:$|[?#])/i);
            const ext = m ? String(m[1]).toLowerCase() : "";
            if (ext === "doc" || ext === "docx" || ext === "rtf") {
                return "https://view.officeapps.live.com/op/embed.aspx?src=" + encodeURIComponent(url);
            }
            return url;
        }

        function openViewer(url, label) {
            if (!url || !viewerWrap || !viewerFrame) return;
            if (viewerTitle) viewerTitle.textContent = label;
            viewerFrame.src = viewerSrcForUrl(url);
            viewerWrap.classList.remove("max-h-0", "opacity-0", "mt-0");
            viewerWrap.classList.add("max-h-screen", "opacity-100", "mt-2");
        }

        function hideViewer() {
            if (!viewerWrap) return;
            viewerWrap.classList.remove("max-h-screen", "opacity-100", "mt-2");
            viewerWrap.classList.add("max-h-0", "opacity-0", "mt-0");
        }

        function finish() {
            if (document.fullscreenElement === commentsPanel) {
                document.exitFullscreen().catch(function () {});
            }
            if (viewerExpandedFallback) {
                viewerExpandedFallback = false;
                applyViewerExpandedLayout(false);
            }
            modal.classList.add("hidden");
            modal.classList.remove("flex");
            close.removeEventListener("click", onClose);
            modal.removeEventListener("click", onBackdrop);
            body.removeEventListener("click", onBodyClick);
            if (btnPaper) btnPaper.removeEventListener("click", onViewPaper);
            if (btnScheme) btnScheme.removeEventListener("click", onViewScheme);
            if (btnAttempt) btnAttempt.removeEventListener("click", onViewAttempt);
            if (viewerClose) viewerClose.removeEventListener("click", onViewerClose);
            if (viewerFullscreen) viewerFullscreen.removeEventListener("click", onViewerFullscreen);
            document.removeEventListener("fullscreenchange", onFullscreenChange);
            if (viewerFrame) viewerFrame.removeAttribute("src");
        }
        function onClose() {
            finish();
        }
        function onBackdrop(ev) {
            if (ev.target === modal) finish();
        }
        function onViewPaper() {
            openViewer(filePaper, "Exam paper");
        }
        function onViewScheme() {
            openViewer(fileScheme, "Mark scheme");
        }
        function onViewAttempt() {
            openViewer(fileAttempt, "Answers / attempt");
        }
        function onViewerClose() {
            hideViewer();
        }
        function applyViewerExpandedLayout(on) {
            if (!commentsPanel || !viewerFrame || !modal) return;
            modal.classList.toggle("items-start", on);
            modal.classList.toggle("items-center", !on);
            commentsPanel.classList.toggle("max-w-3xl", !on);
            commentsPanel.classList.toggle("max-h-[92vh]", !on);
            commentsPanel.classList.toggle("max-w-none", on);
            commentsPanel.classList.toggle("w-[calc(100vw-2rem)]", on);
            commentsPanel.classList.toggle("h-[calc(100vh-2rem)]", on);
            commentsPanel.classList.toggle("max-h-none", on);
            commentsPanel.classList.toggle("flex", on);
            commentsPanel.classList.toggle("flex-col", on);
            commentsPanel.classList.toggle("fixed", on);
            commentsPanel.classList.toggle("inset-2", on);
            commentsPanel.classList.toggle("z-[60]", on);
            commentsPanel.classList.toggle("my-4", !on);
            viewerFrame.classList.toggle("h-[48vh]", !on);
            viewerFrame.classList.toggle("h-[76vh]", on);
        }
        function syncViewerFullscreenUi() {
            if (!viewerFullscreen || !commentsPanel) return;
            const active = document.fullscreenElement === commentsPanel || viewerExpandedFallback;
            viewerFullscreen.textContent = active ? "Exit full screen" : "Full screen";
            viewerFullscreen.classList.remove("bg-slate-900", "text-white", "border-slate-900");
            if (active) viewerFullscreen.classList.add("bg-slate-900", "text-white", "border-slate-900");
        }
        function onViewerFullscreen() {
            if (!commentsPanel) return;
            if (viewerExpandedFallback) {
                viewerExpandedFallback = false;
                applyViewerExpandedLayout(false);
                syncViewerFullscreenUi();
                return;
            }
            if (document.fullscreenElement === commentsPanel) {
                document.exitFullscreen().catch(function () {});
                return;
            }
            if (!document.fullscreenEnabled || typeof commentsPanel.requestFullscreen !== "function") {
                viewerExpandedFallback = true;
                applyViewerExpandedLayout(true);
                syncViewerFullscreenUi();
                return;
            }
            if (document.fullscreenElement) {
                document.exitFullscreen()
                    .catch(function () {})
                    .then(function () {
                        return commentsPanel.requestFullscreen();
                    })
                    .catch(function () {});
                return;
            }
            commentsPanel.requestFullscreen().catch(function () {
                viewerExpandedFallback = true;
                applyViewerExpandedLayout(true);
                syncViewerFullscreenUi();
            });
        }
        function onFullscreenChange() {
            if (!document.fullscreenElement && viewerExpandedFallback) {
                applyViewerExpandedLayout(true);
            }
            syncViewerFullscreenUi();
        }
        function onBodyClick(ev) {
            const reviewTabBtn = ev.target && ev.target.closest && ev.target.closest(".js-review-tab");
            if (reviewTabBtn) {
                const tabId = reviewTabBtn.getAttribute("data-review-tab");
                if (!tabId) return;
                body.querySelectorAll(".js-review-panel").forEach(function (p) {
                    p.classList.toggle("hidden", p.getAttribute("data-review-tab") !== tabId);
                });
                body.querySelectorAll(".js-review-tab").forEach(function (t) {
                    const on = t.getAttribute("data-review-tab") === tabId;
                    t.setAttribute("aria-selected", on ? "true" : "false");
                    t.classList.toggle("bg-slate-900", on);
                    t.classList.toggle("text-white", on);
                    t.classList.toggle("border-slate-900", on);
                    t.classList.toggle("shadow-sm", on);
                    t.classList.toggle("bg-white", !on);
                    t.classList.toggle("text-slate-600", !on);
                    t.classList.toggle("border-slate-200", !on);
                    t.classList.toggle("hover:bg-slate-100", !on);
                });
                return;
            }

            function applyQuestionVisibility() {
                const mode = body.getAttribute("data-qfilter-mode") || "all";
                const onlyDropped = body.getAttribute("data-qonly-dropped") === "1";
                const details = body.querySelectorAll(".js-qdetail");
                const chips = body.querySelectorAll(".js-qnav");
                const shouldShow = function (key) {
                    if (onlyDropped && key !== "needs-improvement") return false;
                    return mode === "all" || key === mode;
                };
                details.forEach(function (el) {
                    const key = el.getAttribute("data-qfilter") || "other";
                    el.classList.toggle("hidden", !shouldShow(key));
                });
                chips.forEach(function (el) {
                    const key = el.getAttribute("data-qfilter") || "other";
                    el.classList.toggle("hidden", !shouldShow(key));
                });
            }

            function paintFilterButtons(activeFilterBtn) {
                body.querySelectorAll(".js-qfilter").forEach(function (el) {
                    const active = el === activeFilterBtn;
                    if (active) {
                        el.classList.remove("text-slate-700", "border-slate-300", "bg-white", "hover:bg-slate-100");
                        el.classList.remove("text-amber-900", "border-amber-200", "bg-amber-50", "hover:bg-amber-100");
                        el.classList.remove("text-emerald-800", "border-emerald-200", "bg-emerald-50", "hover:bg-emerald-100");
                        el.classList.add("bg-slate-900", "text-white", "border-slate-900");
                    } else {
                        el.classList.remove("bg-slate-900", "text-white", "border-slate-900");
                        el.classList.remove("text-amber-900", "border-amber-200", "bg-amber-50", "hover:bg-amber-100");
                        el.classList.remove("text-emerald-800", "border-emerald-200", "bg-emerald-50", "hover:bg-emerald-100");
                        if (el.getAttribute("data-filter") === "all") {
                            el.classList.add("text-slate-700", "border-slate-300", "bg-white", "hover:bg-slate-100");
                            return;
                        }
                        const fm = el.getAttribute("data-filter") === "full-marks";
                        if (fm) el.classList.add("text-emerald-800", "border-emerald-200", "bg-emerald-50", "hover:bg-emerald-100");
                        else el.classList.add("text-amber-900", "border-amber-200", "bg-amber-50", "hover:bg-amber-100");
                    }
                });
            }

            function paintDroppedToggle() {
                const toggle = body.querySelector(".js-qtoggle-dropped");
                if (!toggle) return;
                const active = body.getAttribute("data-qonly-dropped") === "1";
                toggle.setAttribute("data-active", active ? "1" : "0");
                toggle.textContent = active ? "Showing dropped marks" : "Show only dropped marks";
                toggle.classList.remove("bg-slate-900", "text-white", "border-slate-900", "text-slate-700", "border-slate-300", "bg-white", "hover:bg-slate-100");
                if (active) toggle.classList.add("bg-slate-900", "text-white", "border-slate-900");
                else toggle.classList.add("text-slate-700", "border-slate-300", "bg-white", "hover:bg-slate-100");
            }

            const filterBtn = ev.target && ev.target.closest && ev.target.closest(".js-qfilter");
            if (filterBtn) {
                const mode = filterBtn.getAttribute("data-filter") || "all";
                if (mode === "all") {
                    body.setAttribute("data-qfilter-mode", "all");
                    body.setAttribute("data-qonly-dropped", "0");
                } else {
                    body.setAttribute("data-qfilter-mode", mode);
                    if (mode === "full-marks") body.setAttribute("data-qonly-dropped", "0");
                }
                const activeFilter = body.querySelector('.js-qfilter[data-filter="' + (body.getAttribute("data-qfilter-mode") || "all") + '"]');
                paintFilterButtons(activeFilter || filterBtn);
                paintDroppedToggle();
                applyQuestionVisibility();
                return;
            }

            const droppedToggle = ev.target && ev.target.closest && ev.target.closest(".js-qtoggle-dropped");
            if (droppedToggle) {
                const active = body.getAttribute("data-qonly-dropped") === "1";
                const next = active ? "0" : "1";
                body.setAttribute("data-qonly-dropped", next);
                if (next === "1" && body.getAttribute("data-qfilter-mode") === "full-marks") {
                    body.setAttribute("data-qfilter-mode", "all");
                    const allBtn = body.querySelector('.js-qfilter[data-filter="all"]');
                    if (allBtn) paintFilterButtons(allBtn);
                }
                paintDroppedToggle();
                applyQuestionVisibility();
                return;
            }
            const btn = ev.target && ev.target.closest && ev.target.closest(".js-qnav");
            if (!btn) return;
            const id = btn.getAttribute("data-target");
            if (!id) return;
            const el = document.getElementById(id);
            if (!el) return;
            if (typeof el.open !== "undefined") el.open = true;
            try {
                el.scrollIntoView({ behavior: "smooth", block: "nearest" });
            } catch (e) {}
        }
        close.addEventListener("click", onClose);
        modal.addEventListener("click", onBackdrop);
        body.addEventListener("click", onBodyClick);
        if (btnPaper) btnPaper.addEventListener("click", onViewPaper);
        if (btnScheme) btnScheme.addEventListener("click", onViewScheme);
        if (btnAttempt) btnAttempt.addEventListener("click", onViewAttempt);
        if (viewerClose) viewerClose.addEventListener("click", onViewerClose);
        if (viewerFullscreen) viewerFullscreen.addEventListener("click", onViewerFullscreen);
        document.addEventListener("fullscreenchange", onFullscreenChange);
        syncViewerFullscreenUi();
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

    function renderSegmentedPaperBlocks(items, boundaries, byId, variant, examAdmin) {
        const q = partitionQueueByStatus(items);
        const sections = [
            {
                title: "Scheduled",
                subtitle: "Paper and mark scheme on record (status: Planned). Add attempt when you sit the paper.",
                items: q.planned,
            },
            {
                title: "Complete",
                subtitle: "Attempt uploaded — use Log result when you have marking YAML (status: Completed).",
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
                subtitle: "Needs a quick status review.",
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
                html += G.buildPaperRowHtml(sec.items[j], boundaries, {
                    variant: variant,
                    examAdmin: !!examAdmin,
                });
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
            void G.hydrateMarkingDetails(taskList, byId);
            bindPaperRowEvents(taskList);
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

    async function openGradeYamlModal(id) {
        const modal = document.getElementById("grade-yaml-modal");
        const title = document.getElementById("grade-yaml-title");
        const hid = document.getElementById("grade-yaml-id");
        const txt = document.getElementById("grade-yaml-text");
        const dateEl = document.getElementById("grade-yaml-date");
        if (!modal || !hid || !txt) return;
        const paper = allPapers.find(function (p) {
            return p.id === id;
        });
        if (title) title.textContent = paper && G.derivedPaperDisplayName ? G.derivedPaperDisplayName(paper) : "";
        hid.value = id || "";
        txt.value = "";
        if (dateEl) {
            const sd = paper && paper.scheduled_date ? String(paper.scheduled_date) : "";
            dateEl.value = sd && !sd.startsWith(G.SCHEDULE_TBD_PREFIX) ? sd.slice(0, 10) : "";
        }
        cloneReplaceFileInput("grade-yaml-file");

        // Prefill YAML before showing the modal so a quick "Save grade" doesn't submit an empty textarea
        // while async file/YAML resolution is still in flight.
        if (paper && typeof G.hasMarkingYamlContent === "function" && G.hasMarkingYamlContent(paper) && typeof G.resolveMarkingYamlText === "function") {
            try {
                const t = await G.resolveMarkingYamlText(paper);
                if (t) txt.value = t;
            } catch (e) {
                console.error(e);
                w.alert("Could not load existing marking YAML yet. You can still paste YAML and save.");
            }
        }

        modal.classList.remove("hidden");
        modal.classList.add("flex");
    }

    function closeGradeYamlModal() {
        const modal = document.getElementById("grade-yaml-modal");
        if (!modal) return;
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }

    async function logResult(id, providedYaml, attemptDate) {
        const ytext = providedYaml != null ? String(providedYaml).trim() : "";
        if (!ytext) return;
        const api = yamlApi();
        const parsed = G.parseMarkingYaml(ytext, api);
        if (parsed.warnings.length && !w.confirm(parsed.warnings.join("\n") + "\n\nSave anyway?")) return;
        let score = parsed.data ? G.scoreFromParsed(parsed.data) : null;
        if (score == null) {
            const m = ytext.match(/total_percentage:\s*(\d+)/i);
            if (m) score = parseInt(m[1], 10);
        }
        if (
            score == null &&
            !w.confirm(parsed.error ? parsed.error + "\nNo valid score. Save anyway?" : "No valid score. Save anyway?")
        )
            return;

        const ai_summary = parsed.data ? G.summaryFromParsed(parsed.data) : "";
        const existing = allPapers.find(function (p) {
            return p.id === id;
        });
        const yamlPack = G.packMarkingYamlForSave
            ? G.packMarkingYamlForSave(ytext, { hadMarkingFile: !!(existing && existing.file_marking_yaml) })
            : { full_yaml: ytext, markingBlob: null, clearMarkingFile: false };

        if (yamlPack.markingBlob) {
            const fd = new FormData();
            fd.append("full_yaml", yamlPack.full_yaml);
            fd.append("file_marking_yaml", yamlPack.markingBlob, "marking.yaml");
            if (score !== undefined && score !== null) fd.append("score", String(score));
            fd.append("status", G.STATUS_GRADED);
            if (ai_summary) fd.append("ai_summary", ai_summary);
            if (attemptDate) fd.append("scheduled_date", String(attemptDate) + " 12:00:00.000Z");
            await G.patchPaperRecordMultipart(id, fd);
        } else {
            const body = {
                score: score !== undefined && score !== null ? score : undefined,
                status: G.STATUS_GRADED,
                full_yaml: yamlPack.full_yaml,
                ai_summary: ai_summary || undefined,
                scheduled_date: attemptDate ? String(attemptDate) + " 12:00:00.000Z" : undefined,
            };
            if (yamlPack.clearMarkingFile) body.file_marking_yaml = null;
            await G.patchPaperRecord(id, body);
        }
        await loadAllData();
    }

    async function saveGradeYamlModal() {
        const hid = document.getElementById("grade-yaml-id");
        const id = hid ? hid.value : "";
        if (!id) {
            w.alert("Missing exam id — close this dialog and try again.");
            return;
        }
        const saveBtn = document.getElementById("grade-yaml-save");
        const prevDisabled = saveBtn ? !!saveBtn.disabled : false;
        const prevText = saveBtn ? saveBtn.textContent : "";
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = "Saving…";
        }
        try {
            const dateEl = document.getElementById("grade-yaml-date");
            const attemptDate = dateEl && dateEl.value ? String(dateEl.value).trim() : "";
            const ytextPrimary = await collectYamlFromInputs("grade-yaml-text", "grade-yaml-file");
            if (!ytextPrimary) {
                w.alert("Paste YAML or choose a YAML file.");
                return;
            }
            await logResult(id, ytextPrimary, attemptDate);
            closeGradeYamlModal();
        } catch (e) {
            console.error(e);
            w.alert(e && e.message ? "Could not save grade:\n" + e.message : "Could not save grade.");
        } finally {
            if (saveBtn) {
                saveBtn.disabled = prevDisabled;
                saveBtn.textContent = prevText || "Save grade";
            }
        }
    }

    async function savePaper() {
        const form = document.getElementById("vault-deposit-form");
        const subjectEl = document.getElementById("paperSub");
        const subject = subjectEl ? subjectEl.value : "";
        const partEl = document.getElementById("paperP");
        const part = partEl ? partEl.value : "";
        const dateEl = document.getElementById("paperDate");
        const dateVal = dateEl ? dateEl.value : "";
        const historicYaml = await collectYamlFromInputs("historicYaml", "historicYamlFile");

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
        const paper_type = subjectToPaperTypePrefix(subject) + " " + part;

        const yearEl = document.getElementById("paperYear");
        const yearVal = yearEl && yearEl.value ? String(yearEl.value).trim() : "";

        const formData = new FormData();
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
            const yPack = G.packMarkingYamlForSave
                ? G.packMarkingYamlForSave(full_yaml, { hadMarkingFile: false })
                : { full_yaml: full_yaml, markingBlob: null, clearMarkingFile: false };
            formData.append("score", String(score));
            formData.append("full_yaml", yPack.full_yaml);
            if (yPack.markingBlob) formData.append("file_marking_yaml", yPack.markingBlob, "marking.yaml");
            if (ai_summary) formData.append("ai_summary", ai_summary);
        }

        const res = await G.createPaperRecord(formData);
        if (res.ok) {
            await loadAllData();
            const again = await askUploadAnotherExamModal();
            G.showView("exams");
            if (again) {
                if (form) form.reset();
                clearVaultUploadFilesAndYaml();
                updateVaultDerivedNamePreview();
                showVaultUploadPanel();
            } else {
                hideVaultUploadPanel();
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
    w.saveExamEdit = saveExamEdit;
    w.saveGradeYamlModal = saveGradeYamlModal;
    w.logResult = logResult;
    w.showExamsNav = function () {
        hideVaultUploadPanel();
        G.showView("exams");
    };

    w.addEventListener("DOMContentLoaded", async function () {
        const n = new Date();
        G.setCalendarView(n.getFullYear(), n.getMonth());

        G.registerViewLoader("schedule", function () {
            refreshPapersUi();
        });
        G.registerViewLoader("exams", function () {
            refreshPapersUi();
        });
        G.registerViewLoader("progress", function () {
            G.renderPerformanceChart();
        });
        G.registerViewLoader("history", function () {
            refreshPapersUi();
        });

        wireCalendarNav();

        (function wireVaultDerivedNamePreview() {
            ["paperSub", "paperP", "paperYear"].forEach(function (id) {
                const el = document.getElementById(id);
                if (el) el.addEventListener("change", updateVaultDerivedNamePreview);
            });
            updateVaultDerivedNamePreview();
        })();

        (function wireExamEditModal() {
            const cancel = document.getElementById("exam-edit-cancel");
            if (cancel) cancel.addEventListener("click", closeExamEditModal);
            const retake = document.getElementById("exam-edit-retake");
            if (retake) {
                retake.addEventListener("click", function () {
                    saveExamEdit({ retake: true });
                });
            }
            const del = document.getElementById("exam-edit-delete");
            if (del) {
                del.addEventListener("click", function () {
                    const id = document.getElementById("exam-edit-id") && document.getElementById("exam-edit-id").value;
                    if (!id || !w.confirm("Delete this exam record? This cannot be undone.")) return;
                    G.deletePaperRecord(id)
                        .then(function () {
                            closeExamEditModal();
                            return loadAllData();
                        })
                        .catch(function (e) {
                            console.error(e);
                            w.alert("Delete failed.");
                        });
                });
            }
            const closeUp = document.getElementById("vault-upload-panel-close");
            if (closeUp) closeUp.addEventListener("click", hideVaultUploadPanel);
            const modal = document.getElementById("exam-edit-modal");
            if (modal) {
                modal.addEventListener("click", function (ev) {
                    if (ev.target === modal) closeExamEditModal();
                });
            }
        })();

        (function wireGradeYamlModal() {
            const cancel = document.getElementById("grade-yaml-cancel");
            if (cancel) cancel.addEventListener("click", closeGradeYamlModal);
            const save = document.getElementById("grade-yaml-save");
            if (save) save.addEventListener("click", saveGradeYamlModal);
            const modal = document.getElementById("grade-yaml-modal");
            if (modal) {
                modal.addEventListener("click", function (ev) {
                    if (ev.target === modal) closeGradeYamlModal();
                });
            }
        })();

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
                openExamsUploadWithPrefill(
                    uploadBtn.getAttribute("data-subject"),
                    uploadBtn.getAttribute("data-year"),
                    uploadBtn.getAttribute("data-paper-num")
                );
                return;
            }
            const exEdit =
                ev.target && ev.target.closest && ev.target.closest(".js-exam-edit, .js-exam-settings");
            if (exEdit) {
                ev.preventDefault();
                const eid = exEdit.getAttribute("data-id");
                const rp = allPapers.find(function (p) {
                    return p.id === eid;
                });
                if (rp) openExamEditModal(rp);
                return;
            }
            const exDel = ev.target && ev.target.closest && ev.target.closest(".js-exam-delete");
            if (exDel) {
                ev.preventDefault();
                const did = exDel.getAttribute("data-id");
                if (!did || !w.confirm("Delete this exam record? This cannot be undone.")) return;
                G.deletePaperRecord(did)
                    .then(function () {
                        return loadAllData();
                    })
                    .catch(function (e) {
                        console.error(e);
                        w.alert("Delete failed.");
                    });
                return;
            }
            const gradeBtn = ev.target && ev.target.closest && ev.target.closest(".js-backlog-grade");
            if (gradeBtn) {
                ev.preventDefault();
                const gid = gradeBtn.getAttribute("data-id");
                if (gid) void openGradeYamlModal(gid);
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
                void openYamlCommentsModal(paper);
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
