const PB_URL = "http://mycloudex2ultra.local:8090";
let myChart;
let dbBoundaries = [];

// --- 1. INITIALIZATION ---
window.onload = async () => {
    await fetchBoundaries(); 
    loadTasks();            
    renderExamCards();
};

async function fetchBoundaries() {
    try {
        const res = await fetch(`${PB_URL}/api/collections/boundaries/records`);
        const data = await res.json();
        dbBoundaries = data.items;
        console.log("Boundaries loaded:", dbBoundaries);
    } catch (err) {
        console.error("Could not load boundaries:", err);
    }
}

// --- 2. VIEW NAVIGATION ---
function showView(viewId) {
    document.querySelectorAll('.view-content').forEach(v => v.classList.add('hidden'));
    document.getElementById('view-' + viewId).classList.remove('hidden');
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('bg-slate-800', 'text-blue-400');
        btn.classList.add('text-slate-400');
    });
    const activeBtn = document.getElementById('btn-' + viewId);
    if(activeBtn) activeBtn.classList.add('bg-slate-800', 'text-blue-400');

    if (viewId === 'tasks') loadTasks();
    if (viewId === 'progress') renderChart();
}

// --- 3. CALENDAR & EXAM CARDS ---
function renderExamCards() {
    const exams = [
        { name: 'Business P1', date: '2026-05-19', color: 'bg-emerald-500' },
        { name: 'Business P2', date: '2026-05-22', color: 'bg-emerald-500' },
        { name: 'Psychology P1', date: '2026-05-11', color: 'bg-blue-500' },
        { name: 'Psychology P2', date: '2026-05-19', color: 'bg-blue-500' }
    ];
    const container = document.getElementById('exam-timeline');
    if (!container) return;
    container.innerHTML = '';
    
    exams.forEach(exam => {
        const diff = Math.ceil((new Date(exam.date) - new Date()) / (1000 * 60 * 60 * 24));
        container.innerHTML += `
            <div class="min-w-[160px] p-4 rounded-2xl bg-white border border-slate-200 shadow-sm snap-center">
                <div class="w-8 h-1 ${exam.color} rounded-full mb-3"></div>
                <p class="text-[10px] font-black text-slate-400 uppercase">${exam.name} Date</p>
                <p class="text-xl font-black text-slate-800">${diff} Days</p>
            </div>`;
    });
}

function renderCalendar(papers) {
    const grid = document.getElementById('calendar-grid');
    const monthLabel = document.getElementById('calendar-month');
    if (!grid) return;
    grid.innerHTML = '';

    const now = new Date();
    monthLabel.innerText = now.toLocaleString('default', { month: 'long', year: 'numeric' });
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    
    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const dayPapers = papers.filter(p => p.scheduled_date.startsWith(dateStr));
        const isMarked = dayPapers.length > 0 && dayPapers.every(p => p.status === 'Marked');

        let color = 'bg-slate-50';
        if (dayPapers.length > 0) color = 'bg-blue-100 border-blue-200';
        if (isMarked) color = 'bg-emerald-500 border-emerald-600 text-white';

        grid.innerHTML += `<div class="aspect-square rounded-lg border ${color} flex items-center justify-center text-[10px] font-bold">${i}</div>`;
    }
}

// --- 4. TASK LOGIC ---
async function loadTasks() {
    const filterEl = document.getElementById('subjectFilter');
    const filter = filterEl ? filterEl.value : 'all';
    
    try {
        const res = await fetch(`${PB_URL}/api/collections/papers/records?sort=scheduled_date`);
        const data = await res.json();
        const container = document.getElementById('task-list');
        if(!container) return;
        container.innerHTML = "";
        
        let items = filter === 'all' ? data.items : data.items.filter(i => i.subject === filter);

        // Update Calendar & Stats
        renderCalendar(data.items);
        const planned = items.filter(i => i.status === 'Planned').length;
        const total = items.length;
        const pct = total > 0 ? Math.round(((total - planned) / total) * 100) : 0;
        
        if(document.getElementById('pending-count')) document.getElementById('pending-count').innerText = planned;
        if(document.getElementById('progress-bar')) document.getElementById('progress-bar').style.width = `${pct}%`;
        if(document.getElementById('progress-text')) document.getElementById('progress-text').innerText = `${pct}%`;

        items.forEach(paper => {
            const isMarked = paper.status === 'Marked';
            let gradeDisplay = "N/A";

            if (isMarked) {
                // MATCHING: paper_type (e.g. 'Psychology P1') -> paper_key in boundaries
                const b = dbBoundaries.find(x => x.paper_key === paper.paper_type);
                if (b) {
                    const rawMark = (paper.score / 100) * b.max_mark;
                    if (rawMark >= b.a) gradeDisplay = "A";
                    else if (rawMark >= b.b) gradeDisplay = "B";
                    else if (rawMark >= b.c) gradeDisplay = "C";
                    else if (rawMark >= b.d) gradeDisplay = "D";
                    else if (rawMark >= b.e) gradeDisplay = "E";
                    else gradeDisplay = "U";
                }
            }

            const paperUrl = paper.file_paper ? `${PB_URL}/api/files/${paper.collectionId}/${paper.id}/${paper.file_paper}` : null;
            const schemeUrl = paper.file_scheme ? `${PB_URL}/api/files/${paper.collectionId}/${paper.id}/${paper.file_scheme}` : null;

            container.innerHTML += `
                <div class="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex justify-between items-center mb-4">
                    <div class="flex items-center gap-4">
                        <div class="w-1.5 h-12 ${paper.subject.includes('Psychology') ? 'bg-blue-500' : 'bg-emerald-500'} rounded-full"></div>
                        <div>
                            <p class="text-[10px] font-black uppercase text-slate-400 tracking-widest">${paper.paper_type || 'No Type'}</p>
                            <h3 class="font-bold text-slate-800 text-lg">${paper.paper_title}</h3>
                            <div class="flex gap-4 mt-1">
                                ${paperUrl ? `<a href="${paperUrl}" target="_blank" class="text-[10px] font-bold text-blue-500">PAPER</a>` : ''}
                                ${schemeUrl ? `<a href="${schemeUrl}" target="_blank" class="text-[10px] font-bold text-emerald-500">SCHEME</a>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-6">
                        ${isMarked ? `
                            <div class="text-right">
                                <p class="text-2xl font-black text-emerald-600">${paper.score}%</p>
                                <p class="text-[10px] font-black text-slate-400 uppercase">Grade: ${gradeDisplay}</p>
                            </div>
                        ` : `
                            <button onclick="logResult('${paper.id}')" class="bg-slate-900 text-white px-6 py-2 rounded-xl font-black text-xs uppercase hover:bg-slate-800">Log Result</button>
                        `}
                    </div>
                </div>`;
        });
    } catch (err) { console.error("Error loading tasks:", err); }
}

// --- 5. VAULT & LOGGING ---
async function savePaper() {
    const formData = new FormData();
    formData.append('paper_title', document.getElementById('paperTitle').value);
    formData.append('subject', document.getElementById('paperSub').value);
    formData.append('paper_type', document.getElementById('paperSub').value + " " + document.getElementById('paperP').value); // Combines to "Business P1"
    formData.append('status', 'Planned');
    formData.append('scheduled_date', document.getElementById('paperDate').value + " 12:00:00.000Z");

    const fp = document.getElementById('filePaper').files[0];
    const fs = document.getElementById('fileScheme').files[0];
    if (fp) formData.append('file_paper', fp);
    if (fs) formData.append('file_scheme', fs);

    const res = await fetch(`${PB_URL}/api/collections/papers/records`, { method: 'POST', body: formData });
    if (res.ok) {
        showView('tasks');
        loadTasks();
    } else {
        alert("Upload failed.");
    }
}

async function logResult(id) {
    const yaml = prompt("Paste Gemini YAML:");
    if (!yaml) return;
    const match = yaml.match(/score:\s*(\d+)/i);
    const score = match ? parseInt(match[1]) : null;

    await fetch(`${PB_URL}/api/collections/papers/records/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, status: 'Marked', full_yaml: yaml })
    });
    loadTasks();
}

async function renderChart() {
    const chartEl = document.getElementById('mainChart');
    if (!chartEl) return;
    const ctx = chartEl.getContext('2d');
    const res = await fetch(`${PB_URL}/api/collections/papers/records?filter=(status='Marked')&sort=scheduled_date`);
    const data = await res.json();
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.items.map(p => p.paper_title),
            datasets: [{ label: 'Score %', data: data.items.map(p => p.score), borderColor: '#3b82f6', tension: 0.4 }]
        }
    });
}