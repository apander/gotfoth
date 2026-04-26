(function (w) {
    const G = w.GF;
    G.renderExamCountdownStrip = function (container) {
        if (!container) return;
        const mobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
        const parts = [];
        for (const exam of G.EXAM_SETTING_KEYS) {
            const dt = G.getSettingDate(exam.key);
            if (!dt || Number.isNaN(dt.getTime())) continue;
            const diff = Math.ceil((dt - new Date()) / (1000 * 60 * 60 * 24));
            if (mobile) {
                parts.push(
                    `<div class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 flex items-center gap-2">
                        <span class="w-1.5 h-5 rounded-full ${exam.color} shrink-0"></span>
                        <span class="text-[9px] font-black text-slate-600 uppercase leading-tight flex-1 min-w-0 truncate">${exam.label}</span>
                        <span class="text-xs font-black text-slate-900 tabular-nums shrink-0">${diff}d</span>
                    </div>`
                );
                continue;
            }
            parts.push(`
                <div class="flex items-center gap-2 py-1.5 border-b border-slate-100 last:border-b-0 first:pt-0">
                    <span class="w-1 self-stretch min-h-[2rem] rounded-full ${exam.color} shrink-0"></span>
                    <span class="text-[8px] font-black text-slate-600 uppercase leading-tight flex-1 min-w-0">${exam.label}</span>
                    <span class="text-sm font-black text-slate-900 tabular-nums shrink-0">${diff}d</span>
                </div>`);
        }
        if (parts.length === 0) {
            container.innerHTML =
                '<p class="text-sm text-slate-400">Add exam dates in <code class="text-xs">settings</code>.</p>';
            return;
        }
        container.innerHTML = mobile ? '<div class="grid grid-cols-1 gap-1.5">' + parts.join("") + "</div>" : parts.join("");
    };
})(window);
