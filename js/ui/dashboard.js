(function (w) {
    const G = w.GF;
    G.renderExamCountdownStrip = function (container) {
        if (!container) return;
        const parts = [];
        for (const exam of G.EXAM_SETTING_KEYS) {
            const dt = G.getSettingDate(exam.key);
            if (!dt || Number.isNaN(dt.getTime())) continue;
            const diff = Math.ceil((dt - new Date()) / (1000 * 60 * 60 * 24));
            parts.push(`
            <div class="min-w-[140px] p-3 rounded-xl bg-white border border-slate-200 shadow-sm snap-center shrink-0">
                <div class="w-8 h-1 ${exam.color} rounded-full mb-2"></div>
                <p class="text-[9px] font-black text-slate-400 uppercase">${exam.label}</p>
                <p class="text-lg font-black text-slate-800">${diff}d</p>
            </div>`);
        }
        if (parts.length === 0) {
            container.innerHTML =
                '<p class="text-sm text-slate-400">Add exam dates in PocketBase <code class="text-xs">settings</code>.</p>';
            return;
        }
        container.innerHTML = parts.join("");
    };
})(window);
