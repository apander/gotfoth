(function (w) {
    const G = w.GF;

    function startOfWeek(d) {
        const x = new Date(d);
        const day = x.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        x.setDate(x.getDate() + diff);
        x.setHours(0, 0, 0, 0);
        return x;
    }

    function endOfWeek(d) {
        const s = startOfWeek(d);
        const e = new Date(s);
        e.setDate(e.getDate() + 6);
        e.setHours(23, 59, 59, 999);
        return e;
    }

    G.updateSprintPanel = function (items) {
        const total = items.length;
        const graded = items.filter((p) => G.isGraded(p.status)).length;
        const pct = total > 0 ? Math.round((graded / total) * 100) : 0;

        const elBar = document.getElementById("sprint-progress-bar");
        const elPct = document.getElementById("sprint-progress-text");
        const elRemain = document.getElementById("sprint-remaining");
        if (elBar) elBar.style.width = `${pct}%`;
        if (elPct) elPct.innerText = `${pct}%`;
        if (elRemain) elRemain.innerText = String(items.filter((p) => G.needsGrading(p.status)).length);

        const psy = items.filter((p) => String(p.subject).includes("Psychology"));
        const bus = items.filter((p) => !String(p.subject).includes("Psychology"));
        const subjPct = (arr) => {
            if (!arr.length) return 0;
            const g = arr.filter((p) => G.isGraded(p.status)).length;
            return Math.round((g / arr.length) * 100);
        };
        const pPsy = subjPct(psy);
        const pBus = subjPct(bus);

        const barPsy = document.getElementById("sprint-bar-psy");
        const barBus = document.getElementById("sprint-bar-bus");
        const txtPsy = document.getElementById("sprint-pct-psy");
        const txtBus = document.getElementById("sprint-pct-bus");
        if (barPsy) barPsy.style.width = `${pPsy}%`;
        if (barBus) barBus.style.width = `${pBus}%`;
        if (txtPsy) txtPsy.innerText = `${pPsy}%`;
        if (txtBus) txtBus.innerText = `${pBus}%`;

        const pending = items
            .filter((p) => G.needsGrading(p.status) && !G.isUnscheduledPaper(p))
            .map((p) => ({ p, t: new Date(p.scheduled_date) }))
            .filter((x) => !Number.isNaN(x.t.getTime()))
            .sort((a, b) => a.t - b.t);

        function startOfLocalDay(d) {
            const x = new Date(d);
            x.setHours(0, 0, 0, 0);
            return x.getTime();
        }

        const nextEl = document.getElementById("sprint-next-due");
        const nextLabel = document.getElementById("sprint-next-due-label");
        const nextCard = document.getElementById("sprint-next-due-card");

        function setNextDueOverdue(overdue) {
            if (!nextEl) return;
            nextEl.classList.remove("text-slate-300", "text-red-400");
            nextEl.classList.add(overdue ? "text-red-400" : "text-slate-300");
            if (nextLabel) {
                nextLabel.classList.remove("text-slate-500", "text-red-400");
                nextLabel.classList.add(overdue ? "text-red-400" : "text-slate-500");
            }
            if (nextCard) {
                nextCard.classList.remove("border-slate-700/50", "border-red-500/50");
                nextCard.classList.add(overdue ? "border-red-500/50" : "border-slate-700/50");
            }
        }

        if (nextEl) {
            if (pending.length === 0) {
                nextEl.innerText = "—";
                setNextDueOverdue(false);
            } else {
                const x = pending[0].p;
                const due = pending[0].t;
                nextEl.innerText = `${x.paper_title} · ${due.toLocaleDateString()}`;
                const todayStart = startOfLocalDay(new Date());
                const dueStart = startOfLocalDay(due);
                setNextDueOverdue(dueStart < todayStart);
            }
        }

        let nearestExamDays = null;
        const now = new Date();
        for (const exam of G.EXAM_SETTING_KEYS) {
            const dt = G.getSettingDate(exam.key);
            if (!dt || Number.isNaN(dt.getTime())) continue;
            const diff = Math.ceil((dt - now) / (1000 * 60 * 60 * 24));
            if (nearestExamDays === null || diff < nearestExamDays) nearestExamDays = diff;
        }
        const examEl = document.getElementById("sprint-nearest-exam");
        if (examEl) examEl.innerText = nearestExamDays == null ? "—" : `${nearestExamDays}d`;

        const ws = startOfWeek(now);
        const we = endOfWeek(now);
        const weekDue = items.filter((p) => {
            if (G.isGraded(p.status)) return false;
            if (G.isUnscheduledPaper(p)) return false;
            const t = new Date(p.scheduled_date);
            if (Number.isNaN(t.getTime())) return false;
            return t >= ws && t <= we;
        }).length;
        const weekEl = document.getElementById("sprint-week-due");
        if (weekEl) weekEl.innerText = String(weekDue);
    };
})(window);
