const API_BASE_URL = 'https://bodyline-cms-api.onrender.com/api'; 
let scanner = null; 
let currentAsset = null; 
let vState = { flow: null, empScanned: null, isDelegate: false };
let liveTimerInterval = null;

// ==========================================
// 1. INITIALIZATION & ROUTING
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    startNasaClock();
    initSystem();
});

async function initSystem() {
    await fetchAndPopulateSettings();
}

function startNasaClock() {
    setInterval(() => {
        const now = new Date();
        document.getElementById('current-time-display').innerText = now.toLocaleTimeString('en-US', { hour12: false });
    }, 1000);
}

function navTo(viewId) {
    ['view-gateway', 'view-tracker', 'view-supervisor', 'view-admin', 'view-asset'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    
    const header = document.getElementById('main-header');
    if (viewId === 'gateway') header.classList.add('hidden');
    else header.classList.remove('hidden');

    if (viewId === 'admin-auth') {
        const m = document.getElementById('admin-auth-modal');
        m.classList.remove('hidden'); setTimeout(() => m.classList.remove('opacity-0'), 10);
    } else if (viewId === 'supervisor-auth') {
        const m = document.getElementById('supervisor-auth-modal');
        m.classList.remove('hidden'); setTimeout(() => m.classList.remove('opacity-0'), 10);
    } else {
        document.getElementById(`view-${viewId}`).classList.remove('hidden');
        if (viewId === 'tracker') { loadTrackerGrid(); }
        if (viewId === 'admin') { switchAdminTab('sys'); }
        if (viewId === 'supervisor') { loadSupervisorDashboard(); }
    }
}

// ==========================================
// 2. MODAL & UI MANAGEMENT
// ==========================================
function closeModal(modalId) {
    const m = document.getElementById(modalId);
    m.classList.add('opacity-0');
    setTimeout(() => m.classList.add('hidden'), 300);
}

function executeAdminLogin() { closeModal('admin-auth-modal'); navTo('admin'); }
function executeSupervisorLogin() { closeModal('supervisor-auth-modal'); navTo('supervisor'); }
function promptLogout() { const m = document.getElementById('logout-modal'); m.classList.remove('hidden'); setTimeout(() => m.classList.remove('opacity-0'), 10); }
function executeLogout() { closeModal('logout-modal'); navTo('gateway'); }

function showToast(msg, type="success") {
    const t = document.createElement('div');
    const color = type === "error" ? "bg-red-900 border-red-500 text-red-100" : "bg-neutral-800 border-blue-500 text-blue-100";
    const icon = type === "error" ? "ph-warning-octagon text-red-500" : "ph-check-circle text-blue-500";
    t.className = `fixed bottom-8 right-8 ${color} border px-6 py-4 rounded-lg shadow-2xl z-[100] fade-in font-mono text-xs uppercase tracking-widest flex items-center gap-3`;
    t.innerHTML = `<i class="ph-fill ${icon} text-2xl"></i> ${msg}`;
    document.body.appendChild(t);
    setTimeout(() => { t.classList.replace('fade-in', 'opacity-0'); t.style.transition = 'opacity 0.3s ease'; setTimeout(() => t.remove(), 300); }, 3500);
}

function printQR(targetId) {
    const el = document.getElementById(targetId);
    el.classList.add('print-active');
    window.print();
    el.classList.remove('print-active');
}

// ==========================================
// 3. ADMIN: TABS & SYSTEM PARAMETERS
// ==========================================
function switchAdminTab(tabName) {
    ['sys', 'reg', 'info'].forEach(t => {
        document.getElementById(`admin-tab-${t}`).classList.add('hidden');
        document.getElementById(`tab-btn-${t}`).className = "px-6 py-3 font-mono text-xs uppercase tracking-widest border-b-2 border-transparent text-neutral-500 hover:text-neutral-300 transition-colors";
    });
    
    document.getElementById(`admin-tab-${tabName}`).classList.remove('hidden');
    document.getElementById(`tab-btn-${tabName}`).className = "px-6 py-3 font-mono text-xs uppercase tracking-widest border-b-2 border-blue-500 text-blue-400 transition-colors";

    if(tabName === 'sys') loadSystemSettingsList();
    if(tabName === 'info') 
        { loadAuditLog(); loadLedger('patterns'); }
    if(tabName === 'reg') fetchAndPopulateSettings();
}

async function fetchAndPopulateSettings() {
    try {
        const res = await fetch(`${API_BASE_URL}/settings`);
        const settings = await res.json();
        
        const dd = {
            'Brand': document.getElementById('reg-brand'),
            'Size': document.getElementById('reg-size'),
            'Rack': document.getElementById('reg-rack-l'),
            'Role': document.getElementById('reg-emp-role')
        };
        Object.keys(dd).forEach(key => { if(dd[key]) dd[key].innerHTML = `<option value="">Select ${key}</option>`; });

        settings.forEach(s => {
            if (dd[s.Category]) {
                const opt = document.createElement('option');
                opt.value = s.SettingValue;
                opt.dataset.prefix = s.PrefixData || '';
                opt.innerText = s.SettingValue;
                dd[s.Category].appendChild(opt);
            }
        });
    } catch (e) { console.error("Config fetch failed"); }
}

async function addSystemSetting() {
    const cat = document.getElementById('sys-cat').value;
    const val = document.getElementById('sys-val').value;
    const prefix = document.getElementById('sys-prefix').value;
    if(!val) return showToast("Enter a parameter value", "error");
    
    try {
        await fetch(`${API_BASE_URL}/settings`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ category: cat, value: val, prefix: prefix }) });
        document.getElementById('sys-val').value = ''; document.getElementById('sys-prefix').value = '';
        showToast(`Parameter Injected: ${val}`);
        loadSystemSettingsList();
    } catch(e) { showToast("Injection Failed", "error"); }
}

async function loadSystemSettingsList() {
    try {
        const filter = document.getElementById('sys-filter').value;
        const res = await fetch(`${API_BASE_URL}/settings`);
        let settings = await res.json();
        if (filter !== 'All') settings = settings.filter(s => s.Category === filter);

        document.getElementById('system-settings-list').innerHTML = settings.map(s => `
            <li class="flex justify-between items-center p-3 bg-black border border-neutral-800 rounded group">
                <span class="text-neutral-300 font-bold tracking-wide">${s.Category}: <span class="text-white">${s.SettingValue}</span></span> 
                <div class="flex items-center gap-3">
                    <span class="text-[10px] text-blue-500">${s.PrefixData || ''}</span>
                    <button onclick="deleteSystemSetting(${s.SettingID})" class="text-neutral-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><i class="ph ph-trash"></i></button>
                </div>
            </li>
        `).join('');
    } catch (e) { }
}

async function deleteSystemSetting(id) {
    try {
        await fetch(`${API_BASE_URL}/settings/${id}`, { method: 'DELETE' });
        loadSystemSettingsList();
        showToast("Parameter purged.");
    } catch(e) { showToast("Purge failed.", "error"); }
}

// ==========================================
// 4. ADMIN: REGISTRATION & INFO CENTER
// ==========================================
async function loadAuditLog() {
    try {
        const filter = document.getElementById('log-filter').value;
        const res = await fetch(`${API_BASE_URL}/auditlog`);
        let logs = await res.json();
        if (filter !== 'All') logs = logs.filter(l => l.LogCategory === filter);

        const terminal = document.getElementById('audit-log-terminal');
        terminal.innerHTML = logs.map(l => {
            const color = l.LogCategory === 'Delete' ? 'text-red-400' : l.LogCategory === 'Register' ? 'text-blue-400' : 'text-amber-400';
            return `<div class="border-b border-neutral-800 pb-2">
                <span class="text-neutral-500">[${new Date(l.CreatedAt).toLocaleString()}]</span> 
                <span class="font-bold ${color} ml-2">${l.ActionType}</span><br>
                <span class="opacity-70 text-neutral-400 ml-4">${l.LogData}</span>
            </div>`;
        }).join('') || '<p class="text-neutral-600">No logs found.</p>';
    } catch (e) { }
}

async function registerAsset() {
    const name = document.getElementById('reg-name').value;
    const brandDd = document.getElementById('reg-brand');
    const brand = brandDd.value;
    const prefix = brandDd.options[brandDd.selectedIndex]?.dataset.prefix || 'PAT';
    const style = document.getElementById('reg-style').value;
    const size = document.getElementById('reg-size').value;
    const rackL = document.getElementById('reg-rack-l').value;
    const rackP = document.getElementById('reg-rack-p').value;
    const imgUrl = document.getElementById('reg-img').value || 'https://placehold.co/400x400/171717/ffffff?text=No+Image';

    if(!name || !brand || !style || !size || !rackL || !rackP) return showToast("Config Incomplete", "error");
    
    const newId = `${prefix}-${style}-${Math.floor(100 + Math.random() * 900)}`;
    const loc = `Rack ${rackL}-${rackP.padStart(2, '0')}`;
    
    await fetch(`${API_BASE_URL}/patterns/register`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id: newId, name, brand, style, size, loc, imgUrl}) });
    
    document.getElementById('admin-qr-output-pattern').classList.remove('hidden');
    document.getElementById('qr-text-pattern').innerText = newId;
    setTimeout(() => { document.getElementById('qrcode-image-pattern').innerHTML = ""; new QRCode(document.getElementById("qrcode-image-pattern"), { text: newId, width: 140, height: 140, colorDark: "#000000" }); }, 50);
}

async function registerOperator() {
    const name = document.getElementById('reg-emp-name').value;
    const role = document.getElementById('reg-emp-role').value;
    const imgUrl = document.getElementById('reg-emp-img').value || 'https://placehold.co/400x400/171717/ffffff?text=Face';

    if(!name || !role) return showToast("Config Incomplete", "error");
    
    const newId = `EMP-${Math.floor(1000 + Math.random() * 9000)}`;
    await fetch(`${API_BASE_URL}/borrowers/register`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id: newId, name, role, imgUrl}) });
    
    document.getElementById('admin-qr-output-emp').classList.remove('hidden');
    document.getElementById('qr-text-emp').innerText = newId;
    setTimeout(() => { document.getElementById('qrcode-image-emp').innerHTML = ""; new QRCode(document.getElementById("qrcode-image-emp"), { text: newId, width: 140, height: 140, colorDark: "#059669" }); }, 50);
}

function finishRegistering(type) {
    document.getElementById(`admin-qr-output-${type}`).classList.add('hidden');
    if(type === 'pattern') {
        ['reg-name', 'reg-style', 'reg-rack-p', 'reg-img'].forEach(id => document.getElementById(id).value = '');
    } else {
        ['reg-emp-name', 'reg-emp-img'].forEach(id => document.getElementById(id).value = '');
    }
}

// ==========================================
// 5. DIGITAL PATTERN ROOM (Grid & Search)
// ==========================================
let allPatternsMemory = [];

async function loadTrackerGrid() {
    try {
        const res = await fetch(`${API_BASE_URL}/patterns`);
        allPatternsMemory = await res.json();
        renderGrid(allPatternsMemory);
    } catch (e) { document.getElementById('tracker-grid').innerHTML = '<p class="text-red-500 font-mono text-sm">Database connection failed.</p>'; }
}

function renderGrid(data) {
    const grid = document.getElementById('tracker-grid');
    if(data.length === 0) { grid.innerHTML = '<p class="text-neutral-500 font-mono text-sm col-span-full">No assets found matching parameters.</p>'; return; }
    
    grid.innerHTML = data.map(p => `
        <div onclick="selectAsset('${p.PatternID}')" class="asset-grid-card bg-neutral-900 rounded-lg overflow-hidden cursor-pointer flex flex-col h-64 relative group">
            <div class="h-32 w-full bg-black relative">
                <img src="${p.ImageUrl}" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity">
                <div class="absolute top-2 right-2 px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-widest ${p.Status === 'Available' ? 'bg-blue-600/90 text-white' : 'bg-amber-500/90 text-black'}">${p.Status}</div>
            </div>
            <div class="p-4 flex-1 flex flex-col justify-between border-t border-neutral-800">
                <div>
                    <p class="text-[9px] font-mono text-blue-500 uppercase tracking-widest mb-1">${p.Brand}</p>
                    <h3 class="font-bold text-sm text-neutral-200 leading-tight line-clamp-2">${p.PatternName}</h3>
                </div>
                <div class="flex justify-between items-end mt-2">
                    <p class="font-mono text-[10px] text-neutral-500">${p.PatternID}</p>
                    <p class="font-mono text-[10px] text-neutral-400 bg-neutral-800 px-1.5 py-0.5 rounded">${p.RackLocation}</p>
                </div>
            </div>
        </div>
    `).join('');
}

// Local Instant Search
document.getElementById('searchInput').addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase().trim();
    if (val.length > 0) document.getElementById('clearBtn').classList.remove('hidden');
    else document.getElementById('clearBtn').classList.add('hidden');
    
    const filtered = allPatternsMemory.filter(p => 
        p.PatternName.toLowerCase().includes(val) || 
        p.PatternID.toLowerCase().includes(val) || 
        p.Brand.toLowerCase().includes(val) || 
        p.StyleNumber.toLowerCase().includes(val)
    );
    renderGrid(filtered);
});

function clearSearch() { document.getElementById('searchInput').value = ''; document.getElementById('searchInput').dispatchEvent(new Event('input')); }

async function selectAsset(id) {
    try {
        const res = await fetch(`${API_BASE_URL}/patterns/exact/${id}`);
        currentAsset = await res.json();
        renderAssetCard();
        document.getElementById('view-tracker').classList.add('hidden');
        document.getElementById('view-asset').classList.remove('hidden');
    } catch (err) { showToast("Fetch failed", "error"); }
}

function renderAssetCard() {
    const isAvail = currentAsset.Status === 'Available';
    let html = `
        <div class="bg-neutral-900 w-full rounded-xl border border-neutral-800 overflow-hidden shadow-2xl">
            <div class="h-64 w-full bg-black relative border-b border-neutral-800">
                <img src="${currentAsset.ImageUrl}" class="w-full h-full object-cover opacity-90">
                <div class="absolute top-4 right-4 px-3 py-1 rounded text-xs uppercase font-bold tracking-widest ${isAvail ? 'bg-blue-600 text-white' : 'bg-amber-500 text-black'}">${currentAsset.Status}</div>
            </div>
            <div class="p-8">
                <p class="text-xs font-mono uppercase tracking-widest text-blue-500 mb-2">${currentAsset.Brand}</p>
                <h2 class="text-3xl font-bold text-white mb-1">${currentAsset.PatternName}</h2>
                <p class="font-mono text-neutral-500 mb-8">${currentAsset.PatternID}</p>
                
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div class="bg-black p-4 rounded border border-neutral-800"><p class="text-[10px] text-neutral-500 font-mono uppercase tracking-widest">Location</p><p class="font-bold text-neutral-200">${currentAsset.RackLocation}</p></div>
                    <div class="bg-black p-4 rounded border border-neutral-800"><p class="text-[10px] text-neutral-500 font-mono uppercase tracking-widest">Style</p><p class="font-bold text-neutral-200">${currentAsset.StyleNumber}</p></div>
                    <div class="bg-black p-4 rounded border border-neutral-800 col-span-2"><p class="text-[10px] text-neutral-500 font-mono uppercase tracking-widest">Size Category</p><p class="font-bold text-neutral-200">${currentAsset.SizeCategory}</p></div>
                </div>
    `;
    if (isAvail) {
        html += `<button onclick="startVerification('borrow')" class="w-full bg-blue-600 text-white font-bold py-4 rounded hover:bg-blue-500 text-sm tracking-widest uppercase flex items-center justify-center gap-2"><i class="ph ph-qr-code text-xl"></i> Initiate Checkout Protocol</button>`;
    } else {
        html += `<div class="bg-amber-900/20 p-4 rounded border border-amber-700/50 mb-6 flex justify-between items-center"><div class="flex flex-col"><p class="text-[10px] font-mono text-amber-500 uppercase tracking-widest">Active Checkout</p><p class="font-bold text-amber-100 mt-1">${currentAsset.BorrowedBy}</p></div><div class="text-right"><p class="text-[10px] font-mono text-amber-500 uppercase tracking-widest">Shift</p><p class="font-bold text-amber-100 mt-1">${currentAsset.ShiftCheckout}</p></div></div>
                 <button onclick="startVerification('return')" class="w-full bg-neutral-800 text-white font-bold py-4 rounded border border-neutral-700 hover:bg-neutral-700 text-sm tracking-widest uppercase flex items-center justify-center gap-2"><i class="ph ph-qr-code text-xl"></i> Process Return</button>`;
    }
    document.getElementById('asset-card-container').innerHTML = html + `</div></div>`;
}

// ==========================================
// 6. SUPERVISOR COMMAND DASHBOARD (Timers & Queue)
// ==========================================
async function loadSupervisorDashboard() {
    try {
        const [requestsRes, patternsRes] = await Promise.all([ fetch(`${API_BASE_URL}/requests`), fetch(`${API_BASE_URL}/patterns`) ]);
        const requests = await requestsRes.json();
        const patterns = await patternsRes.json();

        // Populate Ticketing Queue
        const qList = document.getElementById('supervisor-queue-list');
        if(requests.length === 0) {
            qList.innerHTML = `<p class="text-neutral-500 font-mono text-xs text-center py-4">No pending clearance requests.</p>`;
        } else {
            qList.innerHTML = requests.map(r => `
                <div class="p-4 bg-black rounded border border-amber-900/50 flex flex-col gap-3">
                    <div class="flex justify-between items-start">
                        <div class="flex items-center gap-3">
                            <img src="${r.ImageUrl}" class="w-8 h-8 rounded-full opacity-80" onerror="this.src='https://placehold.co/100?text=Face'">
                            <div><p class="font-bold text-white text-sm">${r.FullName}</p><p class="text-[10px] font-mono text-neutral-500">${r.Role} | ${r.BorrowerID}</p></div>
                        </div>
                        <span class="text-[9px] font-mono uppercase bg-amber-900/30 text-amber-500 px-2 py-1 rounded border border-amber-800/50">Requires Clearance</span>
                    </div>
                    <div class="bg-neutral-900 p-2 rounded border border-neutral-800 flex justify-between items-center">
                        <p class="text-xs font-mono text-neutral-400">Target: <span class="text-blue-400">${r.PatternID}</span></p>
                        <p class="text-xs font-mono text-neutral-400">Req: <span class="text-white">${r.RequestedShift}</span></p>
                    </div>
                    <div class="flex gap-2 mt-1">
                        <button onclick="approveTicket('${r.BorrowerID}', '${r.RequestedShift}')" class="flex-1 bg-amber-600/20 text-amber-500 border border-amber-600/50 py-2 rounded text-xs uppercase tracking-widest font-bold hover:bg-amber-600 hover:text-black transition-colors">Grant Shift</button>
                        <button onclick="declineTicket(${r.RequestID})" class="flex-1 bg-neutral-800 text-neutral-400 border border-neutral-700 py-2 rounded text-xs uppercase tracking-widest font-bold hover:bg-neutral-700 hover:text-white transition-colors">Deny</button>
                    </div>
                </div>
            `).join('');
        }

        // Populate Chronometric Monitor
        const activePatterns = patterns.filter(p => p.Status === 'Borrowed');
        const pList = document.getElementById('supervisor-active-list');
        if (activePatterns.length === 0) {
            pList.innerHTML = `<p class="text-neutral-500 font-mono text-xs text-center py-4">All assets secure.</p>`;
        } else {
            pList.innerHTML = activePatterns.map(p => {
                // Determine CSS colors based on shift
                const sColor = p.ShiftCheckout.includes('Morning') ? 'text-amber-400' : p.ShiftCheckout.includes('Afternoon') ? 'text-blue-400' : 'text-purple-400';
                return `
                <div class="p-3 bg-black rounded border border-neutral-800 flex flex-col gap-2">
                    <div class="flex justify-between items-center">
                        <p class="font-bold text-white text-sm">${p.PatternID}</p>
                        <p class="text-[10px] font-mono ${sColor} bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">${p.ShiftCheckout}</p>
                    </div>
                    <div class="flex justify-between items-end border-t border-neutral-900 pt-2">
                        <p class="text-xs text-neutral-400"><i class="ph-fill ph-user text-neutral-600"></i> ${p.BorrowedBy}</p>
                        <div class="text-right">
                            <p class="text-[9px] font-mono uppercase tracking-widest text-neutral-500">Shift Time Remaining</p>
                            <p class="font-mono text-sm font-bold text-white countdown-timer" data-start="${p.CheckoutTime}">Calculating...</p>
                        </div>
                    </div>
                </div>`
            }).join('');
            
            // Start the NASA Chronometrics Loop
            if(liveTimerInterval) clearInterval(liveTimerInterval);
            liveTimerInterval = setInterval(updateChronometrics, 1000);
            updateChronometrics(); // Run immediately once
        }

    } catch (e) { showToast("Command Sync Failed", "error"); }
}

function updateChronometrics() {
    const timers = document.querySelectorAll('.countdown-timer');
    const now = new Date();
    timers.forEach(t => {
        const start = new Date(t.dataset.start);
        // A shift is 3 hours (10800 seconds)
        const shiftDurationMs = 3 * 60 * 60 * 1000;
        const endTime = new Date(start.getTime() + shiftDurationMs);
        const diffMs = endTime - now;

        if (diffMs <= 0) {
            t.innerText = "OVERDUE"; t.classList.add('text-red-500'); t.classList.remove('text-white');
        } else {
            const h = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((diffMs % (1000 * 60)) / 1000);
            t.innerText = `T- ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
    });
}

async function approveTicket(borrowerId, shift) {
    try { await fetch(`${API_BASE_URL}/borrowers/${borrowerId}/shift`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ shift }) }); showToast("Clearance Granted"); loadSupervisorDashboard(); } 
    catch(e) { showToast("Network Error", "error"); }
}
async function declineTicket(reqId) {
    try { await fetch(`${API_BASE_URL}/requests/decline`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ requestId: reqId }) }); showToast("Request Denied"); loadSupervisorDashboard(); } 
    catch(e) { showToast("Network Error", "error"); }
}

// ==========================================
// 7. OVERWATCH SCANNER PROTOCOL
// ==========================================
function startVerification(flowType) {
    vState = { flow: flowType, empScanned: null, isDelegate: false };
    document.getElementById('modal-title').innerText = flowType === 'borrow' ? "Checkout Protocol" : "Return Protocol";
    document.getElementById('step-1-indicator').innerHTML = `<div class="w-2 h-2 rounded-full border border-current"></div> Target`;
    document.getElementById('step-1-indicator').className = "flex items-center gap-2 text-neutral-600";
    document.getElementById('step-2-indicator').innerHTML = `<div class="w-2 h-2 rounded-full border border-current"></div> Operator`;
    document.getElementById('step-2-indicator').className = "flex items-center gap-2 text-neutral-600";
    const modal = document.getElementById('verify-modal');
    modal.classList.remove('hidden'); setTimeout(() => modal.classList.remove('opacity-0'), 10);
    triggerCameraForStep("Awaiting Asset QR", handlePatternScan, 'pattern');
}

function openQuickScan() {
    currentAsset = null;
    vState = { flow: null, empScanned: null, isDelegate: false };
    document.getElementById('modal-title').innerText = "Quick Locate";
    document.getElementById('step-1-indicator').parentElement.classList.add('hidden');
    const m = document.getElementById('verify-modal'); m.classList.remove('hidden'); setTimeout(() => m.classList.remove('opacity-0'), 10);
    triggerCameraForStep("Awaiting Asset QR", handlePatternScan, 'pattern');
}

async function triggerCameraForStep(message, callback, targetType) {
    let simButtons = '';
    try {
        if (targetType === 'pattern') {
            const res = await fetch(`${API_BASE_URL}/patterns`);
            const patterns = await res.json();
            simButtons = patterns.map(p => `<button onclick="simulateScan('${p.PatternID}')" class="text-xs bg-black text-neutral-300 font-mono px-3 py-2 rounded border border-neutral-800 hover:border-blue-500 w-full text-left flex items-center gap-3 transition-all"><img src="${p.ImageUrl}" class="w-6 h-6 rounded object-cover"> <div class="flex-1"><span class="block text-white">${p.PatternID}</span><span class="block text-[9px] text-neutral-500">${p.PatternName}</span></div></button>`).join('');
        } else {
            const res = await fetch(`${API_BASE_URL}/borrowers`);
            const emps = await res.json();
            simButtons = emps.map(e => `<button onclick="simulateScan('${e.BorrowerID}')" class="text-xs bg-black text-neutral-300 font-mono px-3 py-2 rounded border border-neutral-800 hover:border-blue-500 w-full text-left flex items-center gap-3 transition-all"><img src="${e.ImageUrl}" class="w-6 h-6 rounded-full object-cover"> <div class="flex-1"><span class="block text-white">${e.BorrowerID}</span><span class="block text-[9px] text-neutral-500">${e.FullName} | ${e.DesignatedShift}</span></div></button>`).join('');
        }
    } catch(e) { simButtons = '<p class="text-xs text-red-500 font-mono">Dev Sandbox Offline</p>'; }

    document.getElementById('modal-dynamic-area').innerHTML = `
        <div class="text-center w-full flex flex-col h-full overflow-hidden">
            <p class="font-mono text-sm text-blue-400 mb-4 tracking-widest uppercase shrink-0 animate-pulse">${message}...</p>
            <div id="camera-stream" class="w-full bg-black rounded overflow-hidden shadow-inner mb-4 border border-neutral-800 min-h-[200px] shrink-0"></div>
            <div class="mt-2 pt-4 border-t border-neutral-800 w-full flex-1 flex flex-col min-h-0">
                <p class="text-[9px] uppercase font-mono text-neutral-600 mb-3 text-left tracking-widest shrink-0"><i class="ph-fill ph-code"></i> Dev Override (Sandbox)</p>
                <div class="overflow-y-auto space-y-2 pr-1 pb-2 custom-scroll flex-1">${simButtons}</div>
            </div>
        </div>
    `;
    scanner = new Html5Qrcode("camera-stream");
    scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, (text) => { stopCamera(); callback(text); }, () => {}).catch(err => console.log("Camera off"));
    window.simulateScan = function(text) { stopCamera(); callback(text); }
}

function stopCamera() { if (scanner && scanner.isScanning) scanner.stop(); }
function closeVerifyModal() { stopCamera(); document.getElementById('verify-modal').classList.add('opacity-0'); setTimeout(() => document.getElementById('verify-modal').classList.add('hidden'), 300); }

async function handlePatternScan(scannedId) {
    if (!currentAsset) {
        try {
            const res = await fetch(`${API_BASE_URL}/patterns/exact/${scannedId}`);
            const data = await res.json();
            if (!data) { closeVerifyModal(); return showToast("Asset Not Found", "error"); }
            currentAsset = data;
            vState.flow = currentAsset.Status === 'Available' ? 'borrow' : 'return';
            document.getElementById('modal-title').innerText = vState.flow === 'borrow' ? "Checkout Protocol" : "Return Protocol";
            document.getElementById('step-1-indicator').parentElement.classList.remove('hidden');
            renderAssetCard();
            document.getElementById('view-tracker').classList.add('hidden');
            document.getElementById('view-asset').classList.remove('hidden');
        } catch (err) { closeVerifyModal(); return showToast("DB Link Failed", "error"); }
    } else {
        if (scannedId !== currentAsset.PatternID) return showToast("Asset Mismatch", "error");
    }

    document.getElementById('step-1-indicator').innerHTML = `<i class="ph-fill ph-check-circle text-lg"></i> Target Lock`;
    document.getElementById('step-1-indicator').className = "flex items-center gap-1 text-blue-500 font-mono";
    
    if (vState.flow === 'borrow') triggerCameraForStep("Awaiting Operator QR", handleOperatorScan, 'operator');
    else {
        document.getElementById('modal-dynamic-area').innerHTML = `
            <p class="font-mono text-white mb-8 text-center text-sm tracking-wide">CONFIRM ORIGINAL BORROWER IDENTITY</p>
            <div class="w-full space-y-4"><button onclick="vState.isDelegate=false; triggerCameraForStep('Scan Original Identity Badge', handleOperatorScan, 'operator')" class="w-full bg-blue-600 text-white font-mono text-xs uppercase tracking-widest py-4 rounded hover:bg-blue-500">I am the Original</button><button onclick="vState.isDelegate=true; triggerCameraForStep('Scan Proxy Identity Badge', handleOperatorScan, 'operator')" class="w-full bg-transparent border border-neutral-700 text-neutral-300 font-mono text-xs uppercase tracking-widest py-4 rounded hover:bg-neutral-800">I am a Proxy</button></div>
        `;
    }
}

async function handleOperatorScan(scannedId) {
    try {
        const res = await fetch(`${API_BASE_URL}/borrowers/${scannedId}`);
        if (!res.ok) return showToast("Identity Invalid", "error");
        const emp = await res.json();
        vState.empScanned = emp.BorrowerID;
        document.getElementById('step-2-indicator').innerHTML = `<i class="ph-fill ph-check-circle text-lg"></i> Identity Confirmed`;
        document.getElementById('step-2-indicator').className = "flex items-center gap-1 text-blue-500 font-mono";
        
        if (vState.flow === 'borrow') {
            document.getElementById('modal-dynamic-area').innerHTML = `
                <div class="bg-black p-4 rounded border border-neutral-800 w-full mb-8 flex items-center gap-4">
                    <img src="${emp.ImageUrl}" class="w-12 h-12 rounded-full object-cover" onerror="this.src='https://placehold.co/100?text=Face'">
                    <div><p class="text-[9px] font-mono uppercase text-blue-500 tracking-widest mb-1">Identity Lock</p><p class="font-bold text-white text-sm leading-none">${emp.FullName}</p><p class="text-[10px] font-mono text-neutral-500 mt-1">${emp.DesignatedShift}</p></div>
                </div>
                <p class="font-mono text-neutral-400 text-xs mb-2 w-full text-left uppercase tracking-widest">Select Target Shift</p>
                <select id="final-shift-select" class="w-full p-4 bg-black border border-neutral-800 rounded font-mono text-sm text-white outline-none mb-8 focus:border-blue-500">
                    <option value="Shift A (Morning)">Shift A (Morning) [0600 - 0900]</option><option value="Shift B (Afternoon)">Shift B (Afternoon) [1200 - 1500]</option><option value="Shift C (Evening)">Shift C (Evening) [1800 - 2100]</option>
                </select>
                <button onclick="processFinalBorrow()" class="w-full bg-blue-600 text-white font-mono text-xs uppercase tracking-widest py-4 rounded hover:bg-blue-500 flex justify-center items-center gap-2">Execute Command <i class="ph ph-terminal-window text-lg"></i></button>
            `;
        } else {
            processFinalReturn(); 
        }
    } catch (err) { showToast("Identity Verification Failed", "error"); }
}

async function processFinalBorrow() {
    const shift = document.getElementById('final-shift-select').value;
    try {
        const res = await fetch(`${API_BASE_URL}/patterns/borrow`, { 
            method: 'POST', headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ patternId: currentAsset.PatternID, borrowerId: vState.empScanned, requestedShift: shift }) 
        });
        const data = await res.json();
        
        if (!res.ok) {
            // OVERWATCH BLOCK
            const isTicket = data.type === "PENDING";
            document.getElementById('modal-dynamic-area').innerHTML = `
                <div class="flex flex-col items-center py-6 w-full fade-in text-center">
                    <i class="ph-fill ${isTicket ? 'ph-clock text-amber-500' : 'ph-warning-octagon text-red-500'} text-6xl mb-6"></i>
                    <h2 class="text-xl font-mono text-white mb-2 uppercase tracking-widest">${isTicket ? 'Clearance Required' : 'Access Denied'}</h2>
                    <p class="text-xs font-mono ${isTicket ? 'text-amber-400 border-amber-900/50 bg-amber-950/20' : 'text-red-400 border-red-900/50 bg-red-950/20'} border p-4 rounded mb-8 tracking-wide leading-relaxed">${data.error}</p>
                    <button onclick="closeVerifyModal()" class="w-full bg-neutral-800 text-white font-mono py-3 rounded hover:bg-neutral-700 text-xs uppercase tracking-widest">Acknowledge</button>
                </div>
            `;
        } else { showSuccessScreen("Checkout Confirmed"); }
    } catch (e) { showToast("Command execution failed", "error"); }
}

async function processFinalReturn() {
    try { await fetch(`${API_BASE_URL}/patterns/return`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patternId: currentAsset.PatternID }) }); showSuccessScreen("Return Processed"); } 
    catch (e) { showToast("Command execution failed", "error"); }
}

function showSuccessScreen(title) {
    document.getElementById('modal-dynamic-area').innerHTML = `
        <div class="flex flex-col items-center py-6 w-full fade-in text-center">
            <i class="ph-fill ph-check-circle text-6xl text-blue-500 mb-6 shadow-blue-500/20 drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]"></i>
            <h2 class="text-lg font-mono text-white mb-2 uppercase tracking-widest">${title}</h2>
            <p class="text-[10px] font-mono text-neutral-500 mb-8 uppercase tracking-widest">Link terminating in <span id="sec-text" class="text-blue-400">5</span>s...</p>
            <div class="flex gap-3 w-full"><button onclick="clearTimerAndStay()" class="flex-1 bg-transparent border border-neutral-700 text-neutral-400 font-mono text-xs uppercase py-3 rounded hover:bg-neutral-800 hover:text-white transition-colors">Hold Connection</button><button onclick="executeRedirect()" class="flex-1 bg-blue-600 text-white font-mono text-xs uppercase py-3 rounded hover:bg-blue-500 transition-colors">Terminate</button></div>
        </div>
    `;
    let timeLeft = 5;
    window.redirectTimer = setInterval(() => { timeLeft--; const el = document.getElementById('sec-text'); if(el) el.innerText = timeLeft; if (timeLeft <= 0) executeRedirect(); }, 1000);
}

function clearTimerAndStay() { clearInterval(window.redirectTimer); closeVerifyModal(); selectAsset(currentAsset.PatternID); }
function executeRedirect() { clearInterval(window.redirectTimer); closeVerifyModal(); navTo('tracker'); }

// ==========================================
// 8. MASTER LEDGER (Data Management)
// ==========================================
let currentLedgerView = 'patterns';
let ledgerMemory = [];
let editingId = null;

async function loadLedger(type) {
    currentLedgerView = type;
    
    // Toggle Button Styles
    document.getElementById('btn-ledger-pat').className = type === 'patterns' ? "bg-blue-600/20 text-blue-400 border border-blue-500/50 font-mono text-[10px] px-3 py-1 rounded uppercase tracking-widest transition-colors" : "bg-transparent border border-neutral-700 text-neutral-400 font-mono text-[10px] px-3 py-1 rounded uppercase tracking-widest hover:bg-neutral-800 transition-colors";
    document.getElementById('btn-ledger-emp').className = type === 'borrowers' ? "bg-blue-600/20 text-blue-400 border border-blue-500/50 font-mono text-[10px] px-3 py-1 rounded uppercase tracking-widest transition-colors" : "bg-transparent border border-neutral-700 text-neutral-400 font-mono text-[10px] px-3 py-1 rounded uppercase tracking-widest hover:bg-neutral-800 transition-colors";

    try {
        const res = await fetch(`${API_BASE_URL}/${type}`);
        ledgerMemory = await res.json();
        
        const thead = document.getElementById('ledger-header');
        const tbody = document.getElementById('ledger-body');
        
        if (type === 'patterns') {
            thead.innerHTML = '<th class="p-3 font-medium">ID</th><th class="p-3 font-medium">Name</th><th class="p-3 font-medium">Brand</th><th class="p-3 font-medium">Loc</th><th class="p-3 font-medium text-right">Actions</th>';
            tbody.innerHTML = ledgerMemory.map(p => `
                <tr class="hover:bg-neutral-900 transition-colors group">
                    <td class="p-3 text-white">${p.PatternID}</td>
                    <td class="p-3">${p.PatternName}</td>
                    <td class="p-3 text-blue-400">${p.Brand}</td>
                    <td class="p-3">${p.RackLocation}</td>
                    <td class="p-3 text-right">
                        <button onclick="openEditModal('${p.PatternID}')" class="text-neutral-500 hover:text-blue-400 mr-2 opacity-0 group-hover:opacity-100"><i class="ph ph-pencil-simple text-base"></i></button>
                        <button onclick="deleteLedgerRecord('${p.PatternID}')" class="text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100"><i class="ph ph-trash text-base"></i></button>
                    </td>
                </tr>
            `).join('');
        } else {
            thead.innerHTML = '<th class="p-3 font-medium">ID</th><th class="p-3 font-medium">Name</th><th class="p-3 font-medium">Role</th><th class="p-3 font-medium text-right">Actions</th>';
            tbody.innerHTML = ledgerMemory.map(b => `
                <tr class="hover:bg-neutral-900 transition-colors group">
                    <td class="p-3 text-white">${b.BorrowerID}</td>
                    <td class="p-3 flex items-center gap-2"><img src="${b.ImageUrl}" class="w-6 h-6 rounded-full border border-neutral-700" onerror="this.src='https://placehold.co/100?text=Face'"> ${b.FullName}</td>
                    <td class="p-3 text-emerald-400">${b.Role}</td>
                    <td class="p-3 text-right">
                        <button onclick="openEditModal('${b.BorrowerID}')" class="text-neutral-500 hover:text-blue-400 mr-2 opacity-0 group-hover:opacity-100"><i class="ph ph-pencil-simple text-base"></i></button>
                        <button onclick="deleteLedgerRecord('${b.BorrowerID}')" class="text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100"><i class="ph ph-trash text-base"></i></button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (e) { showToast("Ledger Sync Failed", "error"); }
}

function openEditModal(id) {
    editingId = id;
    const item = ledgerMemory.find(x => x.PatternID === id || x.BorrowerID === id);
    const form = document.getElementById('edit-modal-form');
    
    if (currentLedgerView === 'patterns') {
        form.innerHTML = `
            <input type="text" id="edit-name" value="${item.PatternName}" class="w-full p-3 bg-black border border-neutral-800 rounded outline-none font-mono text-sm text-white focus:border-blue-500">
            <input type="text" id="edit-brand" value="${item.Brand}" class="w-full p-3 bg-black border border-neutral-800 rounded outline-none font-mono text-sm text-white focus:border-blue-500">
            <input type="text" id="edit-style" value="${item.StyleNumber}" class="w-full p-3 bg-black border border-neutral-800 rounded outline-none font-mono text-sm text-white focus:border-blue-500">
            <input type="text" id="edit-size" value="${item.SizeCategory}" class="w-full p-3 bg-black border border-neutral-800 rounded outline-none font-mono text-sm text-white focus:border-blue-500">
            <input type="text" id="edit-loc" value="${item.RackLocation}" class="w-full p-3 bg-black border border-neutral-800 rounded outline-none font-mono text-sm text-white focus:border-blue-500">
            <input type="text" id="edit-img" value="${item.ImageUrl}" class="w-full p-3 bg-black border border-neutral-800 rounded outline-none font-mono text-sm text-white focus:border-blue-500">
        `;
    } else {
        form.innerHTML = `
            <input type="text" id="edit-name" value="${item.FullName}" class="w-full p-3 bg-black border border-neutral-800 rounded outline-none font-mono text-sm text-white focus:border-blue-500">
            <input type="text" id="edit-role" value="${item.Role}" class="w-full p-3 bg-black border border-neutral-800 rounded outline-none font-mono text-sm text-white focus:border-blue-500">
            <input type="text" id="edit-img" value="${item.ImageUrl}" class="w-full p-3 bg-black border border-neutral-800 rounded outline-none font-mono text-sm text-white focus:border-blue-500">
        `;
    }
    
    const m = document.getElementById('edit-modal');
    m.classList.remove('hidden'); setTimeout(() => m.classList.remove('opacity-0'), 10);
}

async function saveLedgerEdit() {
    try {
        if (currentLedgerView === 'patterns') {
            const body = {
                name: document.getElementById('edit-name').value, brand: document.getElementById('edit-brand').value,
                style: document.getElementById('edit-style').value, size: document.getElementById('edit-size').value,
                loc: document.getElementById('edit-loc').value, imgUrl: document.getElementById('edit-img').value
            };
            await fetch(`${API_BASE_URL}/patterns/${editingId}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
        } else {
            const body = {
                name: document.getElementById('edit-name').value, role: document.getElementById('edit-role').value, imgUrl: document.getElementById('edit-img').value
            };
            await fetch(`${API_BASE_URL}/borrowers/${editingId}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
        }
        showToast("Record Updated");
        closeModal('edit-modal');
        loadLedger(currentLedgerView);
        loadAuditLog(); // Refresh logs to show edit
    } catch(e) { showToast("Update Failed", "error"); }
}

async function deleteLedgerRecord(id) {
    if(!confirm(`Are you sure you want to permanently delete ${id}?`)) return;
    try {
        await fetch(`${API_BASE_URL}/${currentLedgerView}/${id}`, { method: 'DELETE' });
        showToast("Record Purged");
        loadLedger(currentLedgerView);
        loadAuditLog(); // Refresh logs to show deletion
    } catch(e) { showToast("Purge Failed", "error"); }
}