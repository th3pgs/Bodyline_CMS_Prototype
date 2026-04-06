const API_BASE_URL = 'https://bodyline-cms-api.onrender.com/api'; 
let scanner = null; 
let currentAsset = null; 
let vState = { flow: null, empScanned: null };
let liveTimerInterval = null;
let mutexPollInterval = null;
let calendarWeekOffset = 0;

// ==========================================
// 1. BOOT SEQUENCE & ROUTING
// ========================================


document.addEventListener('DOMContentLoaded', () => {
    startNasaClock();
    fetchAndPopulateSettings();
});

function startNasaClock() {
    setInterval(() => { document.getElementById('current-time-display').innerText = new Date().toLocaleTimeString('en-US', { hour12: false }); }, 1000);
}

function navTo(viewId) {
    ['view-gateway', 'view-tracker', 'view-supervisor', 'view-admin', 'view-asset'].forEach(id => document.getElementById(id).classList.add('hidden'));
    const header = document.getElementById('main-header');
    if (viewId === 'gateway') header.classList.add('hidden'); else header.classList.remove('hidden');

    if (viewId === 'admin-auth') { const m = document.getElementById('admin-auth-modal'); m.classList.remove('hidden'); setTimeout(() => m.classList.remove('opacity-0'), 10); } 
    else if (viewId === 'supervisor-auth') { const m = document.getElementById('supervisor-auth-modal'); m.classList.remove('hidden'); setTimeout(() => m.classList.remove('opacity-0'), 10); } 
    else {
        document.getElementById(`view-${viewId}`).classList.remove('hidden');
        if (viewId === 'tracker') loadTrackerGrid();
        if (viewId === 'admin') switchAdminTab('sys');
        if (viewId === 'supervisor') { calendarWeekOffset = 0; loadSupervisorDashboard(); }
    }
}

// ==========================================
// 2. MODALS & UNIVERSAL UI
// ==========================================
function closeModal(modalId) { const m = document.getElementById(modalId); m.classList.add('opacity-0'); setTimeout(() => m.classList.add('hidden'), 300); }
function executeAdminLogin() { closeModal('admin-auth-modal'); navTo('admin'); }
function executeSupervisorLogin() { closeModal('supervisor-auth-modal'); navTo('supervisor'); }
function promptLogout() { const m = document.getElementById('logout-modal'); m.classList.remove('hidden'); setTimeout(() => m.classList.remove('opacity-0'), 10); }
function executeLogout() { closeModal('logout-modal'); navTo('gateway'); }

function showToast(msg, type="success") {
    const t = document.createElement('div');
    const color = type === "error" ? "bg-red-900 border-red-500 text-red-100" : "bg-neutral-800 border-blue-500 text-blue-100";
    const icon = type === "error" ? "ph-warning-octagon text-red-500" : "ph-check-circle text-blue-500";
    t.className = `fixed top-6 right-6 ${color} border px-6 py-4 rounded shadow-2xl z-[100] fade-in font-mono text-xs uppercase tracking-widest flex items-center gap-3`;
    t.innerHTML = `<i class="ph-fill ${icon} text-xl"></i> ${msg}`;
    document.body.appendChild(t);
    setTimeout(() => { t.classList.replace('fade-in', 'opacity-0'); t.style.transition = 'opacity 0.3s ease'; setTimeout(() => t.remove(), 300); }, 3500);
}

function printQR(targetId) { const el = document.getElementById(targetId); el.classList.add('print-active'); window.print(); el.classList.remove('print-active'); }

// ==========================================
// 3. ADMIN: MASTER LEDGER & SYSTEM
// ==========================================
function switchAdminTab(tabName) {
    ['sys', 'reg', 'info'].forEach(t => {
        document.getElementById(`admin-tab-${t}`).classList.add('hidden');
        document.getElementById(`tab-btn-${t}`).className = "px-6 py-3 font-mono text-xs uppercase tracking-widest border-b-2 border-transparent text-neutral-500 hover:text-neutral-300 transition-colors";
    });
    document.getElementById(`admin-tab-${tabName}`).classList.remove('hidden');
    document.getElementById(`tab-btn-${tabName}`).className = "px-6 py-3 font-mono text-xs uppercase tracking-widest border-b-2 border-blue-500 text-blue-400 transition-colors";
    if(tabName === 'sys') loadSystemSettingsList();
    if(tabName === 'info') { loadAuditLog(); loadLedger('patterns'); }
    if(tabName === 'reg') fetchAndPopulateSettings();
}

async function fetchAndPopulateSettings() {
    try {
        const res = await fetch(`${API_BASE_URL}/settings`); const settings = await res.json();
        const dd = { 'Brand': document.getElementById('reg-brand'), 'Size': document.getElementById('reg-size'), 'Rack': document.getElementById('reg-rack-l'), 'Role': document.getElementById('reg-emp-role') };
        Object.keys(dd).forEach(key => { if(dd[key]) dd[key].innerHTML = `<option value="">Select ${key}</option>`; });
        settings.forEach(s => { if (dd[s.Category]) { const opt = document.createElement('option'); opt.value = s.SettingValue; opt.dataset.prefix = s.PrefixData || ''; opt.innerText = s.SettingValue; dd[s.Category].appendChild(opt); } });
    } catch (e) {}
}

async function addSystemSetting() {
    const cat = document.getElementById('sys-cat').value; const val = document.getElementById('sys-val').value; const prefix = document.getElementById('sys-prefix').value;
    if(!val) return showToast("Enter a parameter", "error");
    try { await fetch(`${API_BASE_URL}/settings`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ category: cat, value: val, prefix: prefix }) }); document.getElementById('sys-val').value = ''; document.getElementById('sys-prefix').value = ''; showToast(`Injected: ${val}`); loadSystemSettingsList(); } catch(e) { showToast("Injection Failed", "error"); }
}

async function loadSystemSettingsList() {
    try {
        const filter = document.getElementById('sys-filter').value; const res = await fetch(`${API_BASE_URL}/settings`); let settings = await res.json();
        if (filter !== 'All') settings = settings.filter(s => s.Category === filter);
        document.getElementById('system-settings-list').innerHTML = settings.map(s => `<li class="flex justify-between items-center p-3 bg-black border border-neutral-800 rounded group"><span class="text-neutral-300 font-bold tracking-wide">${s.Category}: <span class="text-white">${s.SettingValue}</span></span> <div class="flex items-center gap-3"><span class="text-[10px] text-blue-500">${s.PrefixData || ''}</span><button onclick="deleteSystemSetting(${s.SettingID})" class="text-neutral-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><i class="ph ph-trash"></i></button></div></li>`).join('');
    } catch (e) { }
}

async function deleteSystemSetting(id) { try { await fetch(`${API_BASE_URL}/settings/${id}`, { method: 'DELETE' }); loadSystemSettingsList(); showToast("Parameter purged."); } catch(e) { showToast("Purge failed.", "error"); } }

async function loadAuditLog() {
    try {
        const filter = document.getElementById('log-filter').value; const res = await fetch(`${API_BASE_URL}/auditlog`); let logs = await res.json();
        if (filter !== 'All') logs = logs.filter(l => l.LogCategory === filter);
        document.getElementById('audit-log-terminal').innerHTML = logs.map(l => { const color = l.LogCategory === 'Delete' ? 'text-red-400' : l.LogCategory === 'Register' ? 'text-blue-400' : 'text-amber-400'; return `<div class="border-b border-neutral-800 pb-2"><span class="text-neutral-500">[${new Date(l.CreatedAt).toLocaleString()}]</span> <span class="font-bold ${color} ml-2">${l.ActionType}</span><br><span class="opacity-70 text-neutral-400 ml-4">${l.LogData}</span></div>`; }).join('') || '<p class="text-neutral-600">No logs found.</p>';
    } catch (e) { }
}

// REGISTER ASSETS & BORROWERS (Truncated for space, identical to previous logic but hitting new DB)
async function registerAsset() {
    const name = document.getElementById('reg-name').value; const brandDd = document.getElementById('reg-brand'); const brand = brandDd.value; const prefix = brandDd.options[brandDd.selectedIndex]?.dataset.prefix || 'PAT';
    const style = document.getElementById('reg-style').value; const size = document.getElementById('reg-size').value; const rackL = document.getElementById('reg-rack-l').value; const rackP = document.getElementById('reg-rack-p').value; const imgUrl = document.getElementById('reg-img').value || 'https://placehold.co/400x400/171717/ffffff?text=No+Image';
    if(!name || !brand || !style || !size || !rackL || !rackP) return showToast("Config Incomplete", "error");
    const newId = `${prefix}-${style}-${Math.floor(100 + Math.random() * 900)}`; const loc = `Rack ${rackL}-${rackP.padStart(2, '0')}`;
    await fetch(`${API_BASE_URL}/patterns/register`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id: newId, name, brand, style, size, loc, imgUrl}) });
    document.getElementById('admin-qr-output-pattern').classList.remove('hidden'); document.getElementById('qr-text-pattern').innerText = newId;
    setTimeout(() => { document.getElementById('qrcode-image-pattern').innerHTML = ""; new QRCode(document.getElementById("qrcode-image-pattern"), { text: newId, width: 140, height: 140, colorDark: "#000000" }); }, 50);
}
async function registerOperator() {
    const name = document.getElementById('reg-emp-name').value; const role = document.getElementById('reg-emp-role').value; const imgUrl = document.getElementById('reg-emp-img').value || 'https://placehold.co/400x400/171717/ffffff?text=Face';
    if(!name || !role) return showToast("Config Incomplete", "error");
    const newId = `EMP-${Math.floor(1000 + Math.random() * 9000)}`;
    await fetch(`${API_BASE_URL}/borrowers/register`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id: newId, name, role, imgUrl}) });
    document.getElementById('admin-qr-output-emp').classList.remove('hidden'); document.getElementById('qr-text-emp').innerText = newId;
    setTimeout(() => { document.getElementById('qrcode-image-emp').innerHTML = ""; new QRCode(document.getElementById("qrcode-image-emp"), { text: newId, width: 140, height: 140, colorDark: "#059669" }); }, 50);
}
function finishRegistering(type) { document.getElementById(`admin-qr-output-${type}`).classList.add('hidden'); if(type === 'pattern') { ['reg-name', 'reg-style', 'reg-rack-p', 'reg-img'].forEach(id => document.getElementById(id).value = ''); } else { ['reg-emp-name', 'reg-emp-img'].forEach(id => document.getElementById(id).value = ''); } }

// MASTER LEDGER EDIT/DELETE
let currentLedgerView = 'patterns'; let ledgerMemory = []; let editingId = null;
async function loadLedger(type) {
    currentLedgerView = type;
    document.getElementById('btn-ledger-pat').className = type === 'patterns' ? "bg-blue-600/20 text-blue-400 border border-blue-500/50 font-mono text-[10px] px-3 py-1 rounded uppercase tracking-widest transition-colors" : "bg-transparent border border-neutral-700 text-neutral-400 font-mono text-[10px] px-3 py-1 rounded uppercase tracking-widest hover:bg-neutral-800 transition-colors";
    document.getElementById('btn-ledger-emp').className = type === 'borrowers' ? "bg-blue-600/20 text-blue-400 border border-blue-500/50 font-mono text-[10px] px-3 py-1 rounded uppercase tracking-widest transition-colors" : "bg-transparent border border-neutral-700 text-neutral-400 font-mono text-[10px] px-3 py-1 rounded uppercase tracking-widest hover:bg-neutral-800 transition-colors";
    try {
        const res = await fetch(`${API_BASE_URL}/${type}`); ledgerMemory = await res.json();
        const thead = document.getElementById('ledger-header'); const tbody = document.getElementById('ledger-body');
        if (type === 'patterns') {
            thead.innerHTML = '<th class="p-3 font-medium">ID</th><th class="p-3 font-medium">Name</th><th class="p-3 font-medium">Status</th><th class="p-3 font-medium">Loc</th><th class="p-3 font-medium text-right">Actions</th>';
            tbody.innerHTML = ledgerMemory.map(p => `<tr class="hover:bg-neutral-900 transition-colors group"><td class="p-3 text-white">${p.PatternID}</td><td class="p-3">${p.PatternName}</td><td class="p-3"><span class="${p.Status==='Available'?'text-emerald-400':p.Status.includes('Locked')?'text-amber-400':'text-blue-400'}">${p.Status}</span></td><td class="p-3">${p.RackLocation}</td><td class="p-3 text-right"><button onclick="openEditModal('${p.PatternID}')" class="text-neutral-500 hover:text-blue-400 mr-2 opacity-0 group-hover:opacity-100"><i class="ph ph-pencil-simple text-base"></i></button><button onclick="deleteLedgerRecord('${p.PatternID}')" class="text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100"><i class="ph ph-trash text-base"></i></button></td></tr>`).join('');
        } else {
            thead.innerHTML = '<th class="p-3 font-medium">ID</th><th class="p-3 font-medium">Name</th><th class="p-3 font-medium">Role</th><th class="p-3 font-medium text-right">Actions</th>';
            tbody.innerHTML = ledgerMemory.map(b => `<tr class="hover:bg-neutral-900 transition-colors group"><td class="p-3 text-white">${b.BorrowerID}</td><td class="p-3 flex items-center gap-2"><img src="${b.ImageUrl}" class="w-6 h-6 rounded-full border border-neutral-700" onerror="this.src='https://placehold.co/100?text=Face'"> ${b.FullName}</td><td class="p-3 text-emerald-400">${b.Role}</td><td class="p-3 text-right"><button onclick="openEditModal('${b.BorrowerID}')" class="text-neutral-500 hover:text-blue-400 mr-2 opacity-0 group-hover:opacity-100"><i class="ph ph-pencil-simple text-base"></i></button><button onclick="deleteLedgerRecord('${b.BorrowerID}')" class="text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100"><i class="ph ph-trash text-base"></i></button></td></tr>`).join('');
        }
    } catch (e) { showToast("Ledger Sync Failed", "error"); }
}
function openEditModal(id) {
    editingId = id; const item = ledgerMemory.find(x => x.PatternID === id || x.BorrowerID === id); const form = document.getElementById('edit-modal-form');
    if (currentLedgerView === 'patterns') { form.innerHTML = `<input type="text" id="edit-name" value="${item.PatternName}" class="w-full p-3 bg-black border border-neutral-800 rounded outline-none font-mono text-sm text-white focus:border-blue-500"><input type="text" id="edit-brand" value="${item.Brand}" class="w-full p-3 bg-black border border-neutral-800 rounded outline-none font-mono text-sm text-white focus:border-blue-500"><input type="text" id="edit-style" value="${item.StyleNumber}" class="w-full p-3 bg-black border border-neutral-800 rounded outline-none font-mono text-sm text-white focus:border-blue-500"><input type="text" id="edit-size" value="${item.SizeCategory}" class="w-full p-3 bg-black border border-neutral-800 rounded outline-none font-mono text-sm text-white focus:border-blue-500"><input type="text" id="edit-loc" value="${item.RackLocation}" class="w-full p-3 bg-black border border-neutral-800 rounded outline-none font-mono text-sm text-white focus:border-blue-500"><input type="text" id="edit-img" value="${item.ImageUrl}" class="w-full p-3 bg-black border border-neutral-800 rounded outline-none font-mono text-sm text-white focus:border-blue-500">`; } 
    else { form.innerHTML = `<input type="text" id="edit-name" value="${item.FullName}" class="w-full p-3 bg-black border border-neutral-800 rounded outline-none font-mono text-sm text-white focus:border-blue-500"><input type="text" id="edit-role" value="${item.Role}" class="w-full p-3 bg-black border border-neutral-800 rounded outline-none font-mono text-sm text-white focus:border-blue-500"><input type="text" id="edit-img" value="${item.ImageUrl}" class="w-full p-3 bg-black border border-neutral-800 rounded outline-none font-mono text-sm text-white focus:border-blue-500">`; }
    const m = document.getElementById('edit-modal'); m.classList.remove('hidden'); setTimeout(() => m.classList.remove('opacity-0'), 10);
}
async function saveLedgerEdit() {
    try {
        if (currentLedgerView === 'patterns') { const body = { name: document.getElementById('edit-name').value, brand: document.getElementById('edit-brand').value, style: document.getElementById('edit-style').value, size: document.getElementById('edit-size').value, loc: document.getElementById('edit-loc').value, imgUrl: document.getElementById('edit-img').value }; await fetch(`${API_BASE_URL}/patterns/${editingId}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) }); } 
        else { const body = { name: document.getElementById('edit-name').value, role: document.getElementById('edit-role').value, imgUrl: document.getElementById('edit-img').value }; await fetch(`${API_BASE_URL}/borrowers/${editingId}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) }); }
        showToast("Record Updated"); closeModal('edit-modal'); loadLedger(currentLedgerView); loadAuditLog();
    } catch(e) { showToast("Update Failed", "error"); }
}
async function deleteLedgerRecord(id) { if(!confirm(`Permanently purge ${id}?`)) return; try { await fetch(`${API_BASE_URL}/${currentLedgerView}/${id}`, { method: 'DELETE' }); showToast("Record Purged"); loadLedger(currentLedgerView); loadAuditLog(); } catch(e) { showToast("Purge Failed", "error"); } }

// ==========================================
// 4. DIGITAL PATTERN ROOM (Grid & Search)
// ==========================================
let allPatternsMemory = [];
async function loadTrackerGrid() {
    try { const res = await fetch(`${API_BASE_URL}/patterns`); allPatternsMemory = await res.json(); renderGrid(allPatternsMemory); } 
    catch (e) { document.getElementById('tracker-grid').innerHTML = '<p class="text-red-500 font-mono text-sm">Database Link Severed.</p>'; }
}
function renderGrid(data) {
    const grid = document.getElementById('tracker-grid');
    if(data.length === 0) { grid.innerHTML = '<p class="text-neutral-500 font-mono text-sm col-span-full">No assets found matching parameters.</p>'; return; }
    grid.innerHTML = data.map(p => `
        <div onclick="selectAsset('${p.PatternID}')" class="asset-grid-card bg-neutral-900 rounded-lg overflow-hidden cursor-pointer flex flex-col h-64 relative group">
            <div class="h-32 w-full bg-black relative"><img src="${p.ImageUrl}" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity">
                <div class="absolute top-2 right-2 px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-widest ${p.Status === 'Available' ? 'bg-blue-600/90 text-white' : p.Status.includes('Locked') ? 'bg-amber-500/90 text-black shadow-[0_0_10px_rgba(245,158,11,0.5)] animate-pulse' : 'bg-neutral-600 text-white'}">${p.Status === 'Locked_Pending' ? 'LOCKED (15m)' : p.Status}</div>
            </div>
            <div class="p-4 flex-1 flex flex-col justify-between border-t border-neutral-800">
                <div><p class="text-[9px] font-mono text-blue-500 uppercase tracking-widest mb-1">${p.Brand}</p><h3 class="font-bold text-sm text-neutral-200 leading-tight line-clamp-2">${p.PatternName}</h3></div>
                <div class="flex justify-between items-end mt-2"><p class="font-mono text-[10px] text-neutral-500">${p.PatternID}</p><p class="font-mono text-[10px] text-neutral-400 bg-neutral-800 px-1.5 py-0.5 rounded">${p.RackLocation}</p></div>
            </div>
        </div>
    `).join('');
}

document.getElementById('searchInput').addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase().trim();
    if (val.length > 0) document.getElementById('clearBtn').classList.remove('hidden'); else document.getElementById('clearBtn').classList.add('hidden');
    const filtered = allPatternsMemory.filter(p => p.PatternName.toLowerCase().includes(val) || p.PatternID.toLowerCase().includes(val) || p.Brand.toLowerCase().includes(val) || p.StyleNumber.toLowerCase().includes(val));
    renderGrid(filtered);
});
function clearSearch() { document.getElementById('searchInput').value = ''; document.getElementById('searchInput').dispatchEvent(new Event('input')); }

async function selectAsset(id) {
    try {
        const res = await fetch(`${API_BASE_URL}/patterns/exact/${id}`); currentAsset = await res.json();
        const isAvail = currentAsset.Status === 'Available';
        const isLocked = currentAsset.Status.includes('Locked');
        let html = `
            <div class="bg-neutral-900 w-full rounded-xl border border-neutral-800 overflow-hidden shadow-2xl">
                <div class="h-64 w-full bg-black relative border-b border-neutral-800">
                    <img src="${currentAsset.ImageUrl}" class="w-full h-full object-cover opacity-90">
                    <div class="absolute top-4 right-4 px-3 py-1 rounded text-xs uppercase font-bold tracking-widest ${isAvail ? 'bg-blue-600 text-white' : isLocked ? 'bg-amber-500 text-black shadow-[0_0_15px_rgba(245,158,11,0.5)] animate-pulse' : 'bg-neutral-600 text-white'}">${isLocked ? 'MUTEX LOCKED' : currentAsset.Status}</div>
                </div>
                <div class="p-8">
                    <p class="text-xs font-mono uppercase tracking-widest text-blue-500 mb-2">${currentAsset.Brand}</p><h2 class="text-3xl font-bold text-white mb-1">${currentAsset.PatternName}</h2><p class="font-mono text-neutral-500 mb-8">${currentAsset.PatternID}</p>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                        <div class="bg-black p-4 rounded border border-neutral-800"><p class="text-[10px] text-neutral-500 font-mono uppercase tracking-widest">Location</p><p class="font-bold text-neutral-200">${currentAsset.RackLocation}</p></div>
                        <div class="bg-black p-4 rounded border border-neutral-800"><p class="text-[10px] text-neutral-500 font-mono uppercase tracking-widest">Style</p><p class="font-bold text-neutral-200">${currentAsset.StyleNumber}</p></div>
                        <div class="bg-black p-4 rounded border border-neutral-800 col-span-2"><p class="text-[10px] text-neutral-500 font-mono uppercase tracking-widest">Size Category</p><p class="font-bold text-neutral-200">${currentAsset.SizeCategory}</p></div>
                    </div>
        `;
        if (isAvail || isLocked) { // Allow initiation even if locked, server will block if it's someone else's lock
            html += `<button onclick="startVerification('borrow')" class="w-full ${isLocked ? 'bg-amber-600 hover:bg-amber-500' : 'bg-blue-600 hover:bg-blue-500'} text-white font-bold py-4 rounded text-sm tracking-widest uppercase flex items-center justify-center gap-2 transition-colors"><i class="ph ph-qr-code text-xl"></i> Initiate Checkout Sequence</button>`;
        } else {
            html += `<div class="bg-neutral-800 p-4 rounded border border-neutral-700 mb-6 flex justify-between items-center"><div class="flex flex-col"><p class="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">Active Operator</p><p class="font-bold text-white mt-1">${currentAsset.BorrowedBy}</p></div><div class="text-right"><p class="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">Shift Check</p><p class="font-bold text-blue-400 mt-1">${currentAsset.ShiftCheckout}</p></div></div>
                     <button onclick="startVerification('return')" class="w-full bg-transparent border border-neutral-600 text-white font-bold py-4 rounded hover:bg-neutral-800 text-sm tracking-widest uppercase flex items-center justify-center gap-2 transition-colors"><i class="ph ph-qr-code text-xl"></i> Process Return</button>`;
        }
        document.getElementById('asset-card-container').innerHTML = html + `</div></div>`;
        document.getElementById('view-tracker').classList.add('hidden'); document.getElementById('view-asset').classList.remove('hidden');
    } catch (err) { showToast("Asset fetch failed", "error"); }
}

// ==========================================
// 5. SUPERVISOR CALENDAR (Drag & Drop)
// ==========================================
function changeCalendarWeek(offset) { calendarWeekOffset += offset; loadSupervisorDashboard(); }

async function loadSupervisorDashboard() {
    try {
        const [borrowersRes, assignRes, reqsRes] = await Promise.all([ fetch(`${API_BASE_URL}/borrowers`), fetch(`${API_BASE_URL}/assignments`), fetch(`${API_BASE_URL}/requests`) ]);
        const allBorrowers = await borrowersRes.json();
        const assignments = await assignRes.json();
        const requests = await reqsRes.json();

        // 1. Build the Unassigned Pool (Operators not working today)
        const todayStr = new Date().toISOString().split('T')[0];
        const assignedToday = assignments.filter(a => a.AssignedDate.split('T')[0] === todayStr).map(a => a.BorrowerID);
        const pool = allBorrowers.filter(b => !assignedToday.includes(b.BorrowerID));
        
        document.getElementById('operator-pool').innerHTML = pool.map(b => `
            <div class="operator-card bg-black border border-neutral-800 rounded p-2 flex items-center gap-2 shadow hover:border-blue-500" draggable="true" ondragstart="dragStart(event, '${b.BorrowerID}')">
                <img src="${b.ImageUrl}" class="w-8 h-8 rounded-full object-cover pointer-events-none" onerror="this.src='https://placehold.co/100?text=Face'">
                <div class="pointer-events-none"><p class="text-[10px] font-bold text-white leading-tight">${b.FullName.split(' ')[0]}</p><p class="text-[8px] font-mono text-neutral-500">${b.BorrowerID}</p></div>
            </div>
        `).join('') || '<p class="text-neutral-500 text-xs font-mono w-full p-2">Pool Empty</p>';

        // 2. Build 7-Day Calendar Grid
        const grid = document.getElementById('calendar-grid');
        grid.innerHTML = '';
        
        // Calculate dates for the week
        const now = new Date();
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 1 + (calendarWeekOffset * 7))); // Monday start
        document.getElementById('calendar-week-label').innerText = `Week of ${startOfWeek.toLocaleDateString('en-US', {month:'short', day:'numeric'})}`;

        const shifts = ['Morning [06:00]', 'Afternoon [14:00]', 'Night [22:00]'];
        const shiftKeys = ['Morning', 'Afternoon', 'Night'];

        for (let i = 0; i < 7; i++) {
            const dayDate = new Date(startOfWeek); dayDate.setDate(dayDate.getDate() + i);
            const dateStr = dayDate.toISOString().split('T')[0];
            const isToday = dateStr === new Date().toISOString().split('T')[0];

            let colHtml = `<div class="flex flex-col gap-2 min-w-[150px]"><div class="bg-neutral-950 p-2 text-center rounded border ${isToday ? 'border-blue-500' : 'border-neutral-800'}"><p class="text-[10px] font-mono uppercase tracking-widest ${isToday ? 'text-blue-400' : 'text-neutral-500'}">${dayDate.toLocaleDateString('en-US', {weekday:'short'})}</p><p class="font-bold text-white text-sm">${dayDate.getDate()}</p></div>`;
            
            shifts.forEach((shiftName, idx) => {
                const shiftKey = shiftKeys[idx];
                const dayAssignments = assignments.filter(a => a.AssignedDate.split('T')[0] === dateStr && a.ShiftType === shiftKey);
                
                colHtml += `
                    <div class="drop-zone flex-1 bg-black rounded border border-neutral-800 border-dashed p-2 min-h-[100px] flex flex-col gap-1" ondragover="dragOver(event)" ondragleave="dragLeave(event)" ondrop="drop(event, '${dateStr}', '${shiftKey}')">
                        <p class="text-[8px] font-mono text-neutral-600 uppercase tracking-widest mb-1 text-center">${shiftName}</p>
                        ${dayAssignments.map(a => {
                            const b = allBorrowers.find(x => x.BorrowerID === a.BorrowerID);
                            return b ? `<div class="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-[9px] font-mono text-white flex items-center gap-2"><img src="${b.ImageUrl}" class="w-4 h-4 rounded-full"> ${b.FullName.split(' ')[0]}</div>` : '';
                        }).join('')}
                    </div>`;
            });
            grid.innerHTML += colHtml + `</div>`;
        }

        // 3. Populate Ticketing Queue
        const qList = document.getElementById('supervisor-queue-list');
        const pendingReqs = requests.filter(r => r.RequestStatus === 'Pending');
        qList.innerHTML = pendingReqs.map(r => `
            <div class="p-3 bg-black rounded border border-amber-900/50 flex flex-col gap-2 shadow-[0_0_10px_rgba(245,158,11,0.1)]">
                <div class="flex justify-between items-start"><div class="flex items-center gap-2"><img src="${r.ImageUrl}" class="w-6 h-6 rounded-full opacity-80"><p class="font-bold text-white text-xs">${r.FullName}</p></div><span class="text-[8px] font-mono uppercase bg-amber-900/30 text-amber-500 px-1 py-0.5 rounded border border-amber-800/50 animate-pulse">Clearance Req</span></div>
                <div class="bg-neutral-900 p-2 rounded border border-neutral-800 flex justify-between items-center"><p class="text-[10px] font-mono text-neutral-400">Target: <span class="text-blue-400">${r.PatternID}</span></p><p class="text-[10px] font-mono text-neutral-400">Shift: <span class="text-white">${r.RequestedShift}</span></p></div>
                <div class="flex gap-1 mt-1"><button onclick="resolveTicket(${r.RequestID}, 'Approve', '${r.BorrowerID}', '${r.RequestedDate.split('T')[0]}', '${r.RequestedShift}', '${r.PatternID}')" class="flex-1 bg-amber-600/20 text-amber-500 border border-amber-600/50 py-1.5 rounded text-[10px] uppercase tracking-widest font-bold hover:bg-amber-600 hover:text-black transition-colors">Grant</button><button onclick="resolveTicket(${r.RequestID}, 'Decline', '${r.BorrowerID}', '${r.RequestedDate.split('T')[0]}', '${r.RequestedShift}', '${r.PatternID}')" class="flex-1 bg-neutral-800 text-neutral-400 border border-neutral-700 py-1.5 rounded text-[10px] uppercase tracking-widest font-bold hover:bg-neutral-700 hover:text-white transition-colors">Deny</button></div>
            </div>
        `).join('') || '<p class="text-neutral-500 font-mono text-[10px] text-center py-4">No active tickets.</p>';

    } catch (e) { showToast("Dashboard Sync Failed", "error"); }
}

// Drag and Drop Handlers
function dragStart(e, borrowerId) { e.dataTransfer.setData('text/plain', borrowerId); e.target.style.opacity = '0.5'; }
function dragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function dragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
async function drop(e, dateStr, shift) {
    e.preventDefault(); e.currentTarget.classList.remove('drag-over');
    const borrowerId = e.dataTransfer.getData('text/plain');
    if (!borrowerId) return;
    try { await fetch(`${API_BASE_URL}/assignments`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ borrowerId, date: dateStr, shift }) }); loadSupervisorDashboard(); } 
    catch(err) { showToast("Assignment Failed", "error"); }
}

async function resolveTicket(reqId, action, borrowerId, date, shift, patternId) {
    try { await fetch(`${API_BASE_URL}/requests/resolve`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ requestId: reqId, action, borrowerId, date, shift, patternId }) }); loadSupervisorDashboard(); } 
    catch(e) { showToast("Resolve Failed", "error"); }
}

// ==========================================
// 6. OVERWATCH SCANNER & MUTEX SYSTEM
// ==========================================
function startVerification(flowType) {
    vState = { flow: flowType, empScanned: null };
    document.getElementById('modal-title').innerText = flowType === 'borrow' ? "Checkout Protocol" : "Return Protocol";
    document.getElementById('step-1-indicator').innerHTML = `<div class="w-2 h-2 rounded-full border border-current"></div> Target`; document.getElementById('step-1-indicator').className = "flex items-center gap-2 text-neutral-600";
    document.getElementById('step-2-indicator').innerHTML = `<div class="w-2 h-2 rounded-full border border-current"></div> Operator`; document.getElementById('step-2-indicator').className = "flex items-center gap-2 text-neutral-600";
    const modal = document.getElementById('verify-modal'); modal.classList.remove('hidden'); setTimeout(() => modal.classList.remove('opacity-0'), 10);
    triggerCameraForStep("Awaiting Asset QR", handlePatternScan, 'pattern');
}
function openQuickScan() {
    currentAsset = null; vState = { flow: null, empScanned: null }; document.getElementById('modal-title').innerText = "Quick Locate";
    document.getElementById('step-1-indicator').parentElement.classList.add('hidden');
    const m = document.getElementById('verify-modal'); m.classList.remove('hidden'); setTimeout(() => m.classList.remove('opacity-0'), 10);
    triggerCameraForStep("Awaiting Asset QR", handlePatternScan, 'pattern');
}

async function triggerCameraForStep(message, callback, targetType) {
    let simButtons = '';
    try {
        if (targetType === 'pattern') { const res = await fetch(`${API_BASE_URL}/patterns`); const patterns = await res.json(); simButtons = patterns.map(p => `<button onclick="simulateScan('${p.PatternID}')" class="text-[10px] bg-black text-neutral-300 font-mono px-3 py-2 rounded border border-neutral-800 hover:border-blue-500 w-full text-left flex items-center gap-3 transition-all"><img src="${p.ImageUrl}" class="w-6 h-6 rounded object-cover"> <div class="flex-1"><span class="block text-white">${p.PatternID}</span><span class="block text-neutral-500">${p.PatternName}</span></div></button>`).join(''); } 
        else { const res = await fetch(`${API_BASE_URL}/borrowers`); const emps = await res.json(); simButtons = emps.map(e => `<button onclick="simulateScan('${e.BorrowerID}')" class="text-[10px] bg-black text-neutral-300 font-mono px-3 py-2 rounded border border-neutral-800 hover:border-blue-500 w-full text-left flex items-center gap-3 transition-all"><img src="${e.ImageUrl}" class="w-6 h-6 rounded-full object-cover"> <div class="flex-1"><span class="block text-white">${e.BorrowerID}</span><span class="block text-neutral-500">${e.FullName}</span></div></button>`).join(''); }
    } catch(e) { simButtons = '<p class="text-xs text-red-500 font-mono">Sandbox Offline</p>'; }

    document.getElementById('modal-dynamic-area').innerHTML = `<div class="text-center w-full flex flex-col h-full overflow-hidden"><p class="font-mono text-sm text-blue-400 mb-4 tracking-widest uppercase shrink-0 animate-pulse">${message}...</p><div id="camera-stream" class="w-full bg-black rounded overflow-hidden shadow-inner mb-4 border border-neutral-800 min-h-[200px] shrink-0"></div><div class="mt-2 pt-4 border-t border-neutral-800 w-full flex-1 flex flex-col min-h-0"><p class="text-[9px] uppercase font-mono text-neutral-600 mb-3 text-left tracking-widest shrink-0"><i class="ph-fill ph-code"></i> Dev Sandbox Override</p><div class="overflow-y-auto space-y-2 pr-1 pb-2 custom-scroll flex-1">${simButtons}</div></div></div>`;
    scanner = new Html5Qrcode("camera-stream"); scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: {