(function (w) {
    const G = w.GF;

    function esc(s) {
        return String(s ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/"/g, "&quot;");
    }

    G.buildPaperRowHtml = function (paper, boundaries, opts) {
        opts = opts || {};
        const variant = opts.variant || "card";
        const graded = G.isGraded(paper.status);
        const gradeDisplay = graded ? G.letterGrade(paper, boundaries) : "N/A";
        const paperUrl = G.fileUrl(paper, "file_paper");
        const schemeUrl = G.fileUrl(paper, "file_scheme");
        const psych = String(paper.subject).includes("Psychology");
        const accent = psych ? "bg-blue-500" : "bg-emerald-500";
        const showLog = opts.showLogButton !== false && !graded;

        const ux = G.backlogUxStatus(paper);
        const badgeTone =
            ux === "Marked"
                ? "bg-emerald-100 text-emerald-800"
                : ux === "Complete"
                  ? "bg-amber-100 text-amber-900"
                  : ux === "Scheduled"
                    ? "bg-sky-100 text-sky-900"
                    : ux === "To be scheduled"
                      ? "bg-orange-100 text-orange-950"
                    : ux === "To be uploaded"
                        ? "bg-slate-200 text-slate-700"
                        : "bg-slate-100 text-slate-600";
        const statusBadge = `<span class="text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${badgeTone}">${esc(ux)}</span>`;

        const showSetDate = !graded && G.isUnscheduledPaper(paper);
        const setDateBtn = showSetDate
            ? `<button type="button" class="js-set-sitting-date w-full sm:w-auto bg-white text-slate-900 border-2 border-slate-200 px-4 py-2 rounded-xl font-black text-xs uppercase hover:border-blue-500 hover:text-blue-600 shrink-0" data-id="${esc(paper.id)}">Set date</button>`
            : "";

        const actionBlock = graded
            ? `<div class="text-right shrink-0">
            <p class="text-2xl font-black text-emerald-600">${paper.score ?? "—"}%</p>
            <p class="text-[10px] font-black text-slate-400 uppercase">Grade: ${gradeDisplay}</p>
          </div>`
            : `<div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">${setDateBtn}${
                  showLog
                      ? `<button type="button" class="js-log-result bg-slate-900 text-white px-5 py-2 rounded-xl font-black text-xs uppercase hover:bg-slate-800" data-id="${esc(paper.id)}">Log Result</button>`
                      : ""
              }</div>`;

        const detailId = `detail-${paper.id}`;
        const hasYaml = graded && paper.full_yaml;
        const detailToggle = hasYaml
            ? `<button type="button" class="js-toggle-detail text-[10px] font-bold text-blue-600 mt-2" data-target="${esc(detailId)}">Marking detail</button>
           <div id="${esc(detailId)}" class="hidden mt-3 text-xs text-slate-600 border-t border-slate-100 pt-3 font-mono whitespace-pre-wrap break-words js-marking-detail"></div>`
            : "";

        const wrap =
            variant === "row"
                ? "grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-center"
                : "flex justify-between items-center";

        return `
        <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm paper-row ${wrap}" data-paper-id="${esc(paper.id)}">
            <div class="flex items-center gap-3 min-w-0">
                <div class="w-1.5 h-10 ${accent} rounded-full shrink-0"></div>
                <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                        <p class="text-[10px] font-black uppercase text-slate-400 tracking-widest">${esc(paper.paper_type || "No Type")}</p>
                        ${statusBadge}
                    </div>
                    <h3 class="font-bold text-slate-800 truncate">${esc(paper.paper_title)}</h3>
                    <p class="text-[10px] ${G.isUnscheduledPaper(paper) ? "text-amber-700 font-bold" : "text-slate-400"}">${
                        G.isUnscheduledPaper(paper)
                            ? "No sitting date yet · use Set date"
                            : (paper.year != null && paper.year !== "" ? esc("Exam " + paper.year + " · ") : "") +
                              esc(String(paper.scheduled_date || ""))
                    }</p>
                    <div class="flex gap-3 mt-1">
                        ${paperUrl ? `<a href="${esc(paperUrl)}" target="_blank" rel="noopener" class="text-[10px] font-bold text-blue-500">PAPER</a>` : ""}
                        ${schemeUrl ? `<a href="${esc(schemeUrl)}" target="_blank" rel="noopener" class="text-[10px] font-bold text-emerald-500">SCHEME</a>` : ""}
                    </div>
                    ${detailToggle}
                </div>
            </div>
            <div class="flex items-center justify-end gap-4">${actionBlock}</div>
        </div>`;
    };

    G.hydrateMarkingDetails = function (root, papersById) {
        const yamlApi = G.resolveYamlApi();
        root.querySelectorAll(".js-marking-detail").forEach((el) => {
            const row = el.closest(".paper-row");
            const id = row && row.getAttribute("data-paper-id");
            if (!id) return;
            const paper = papersById[id];
            if (!paper || !paper.full_yaml) return;
            const parsed = G.parseMarkingYaml(paper.full_yaml, yamlApi);
            const bits = [];
            if (parsed.error) bits.push(`Parse error: ${parsed.error}`);
            parsed.warnings.forEach((w) => bits.push(`⚠ ${w}`));
            const data = parsed.data;
            if (data) {
                if (data.questions && data.questions.length) bits.push(JSON.stringify(data.questions, null, 2));
                if (data.qa) bits.push(`QA: ${JSON.stringify(data.qa, null, 2)}`);
                if (Array.isArray(data.strengths)) bits.push(`Strengths: ${data.strengths.join("; ")}`);
                if (Array.isArray(data.weaknesses)) bits.push(`Weaknesses: ${data.weaknesses.join("; ")}`);
            }
            el.textContent = bits.join("\n\n") || "(No structured detail)";
        });
    };
})(window);
