const API_BASE_URL = 'https://bodyline-cms-api.onrender.com/api'; 
let scanner = null; 
let currentAsset = null; 
let vState = { flow: null, empScanned: null, isDelegate: false };

// ==========================================
// 1. INITIALIZATION & ROUTING
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('current-date-display').innerText = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    initSystem();
});

async function initSystem() {
    await fetchAndPopulateSettings();
}

function navTo(viewId) {
    // Hide all views
    ['view-gateway', 'view-tracker', 'view-supervisor', 'view-admin'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    
    // Manage Header Visibility
    const header = document.getElementById('main-header');
    if (viewId === 'gateway') header.classList.add('hidden');
    else header.classList.remove('hidden');

    // Handle specific auth logic or direct routing
    if (viewId === 'admin-auth') {
        const m = document.getElementById('admin-auth-modal');
        m.classList.remove('hidden'); setTimeout(() => m.classList.remove('opacity-0'), 10);
    } else if (viewId === 'supervisor-auth') {
        const m = document.getElementById('supervisor-auth-modal');
        m.classList.remove('hidden'); setTimeout(() => m.classList.remove('opacity-0'), 10);
    } else {
        document.getElementById(`view-${viewId}`).classList.remove('hidden');
        if (viewId === 'tracker') {
            document.getElementById('view-asset').classList.add('hidden'); // Ensure detail card is hidden
            document.getElementById('searchInput').value = '';
            document.getElementById('autocomplete-dropdown').classList.add('hidden');
        }
        if (viewId === 'admin') { loadSystemSettingsList(); loadAuditLog(); }
        if (viewId === 'supervisor') loadSupervisorDashboard();
    }
}

// ==========================================
// 2. MODAL & AUTH MANAGEMENT
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
    t.className = `fixed bottom-8 left-1/2 transform -translate-x-1/2 ${type === "error" ? "bg-red-600" : "bg-emerald-600"} text-white px-6 py-3 rounded-xl shadow-2xl z-[100] fade-in font-bold tracking-wide flex items-center gap-2 border border-white/20`;
    t.innerHTML = `<i class="ph ${type === 'error' ? 'ph-warning-circle' : 'ph-check-circle'} text-xl"></i> ${msg}`;
    document.body.appendChild(t);
    setTimeout(() => { t.classList.replace('fade-in', 'opacity-0'); t.style.transition = 'opacity 0.3s ease'; setTimeout(() => t.remove(), 300); }, 3000);
}

// BULLETPROOF PRINTING
function printQR(targetId) {
    const el = document.getElementById(targetId);
    el.classList.add('print-active');
    window.print();
    el.classList.remove('print-active');
}

// ==========================================
// 3. DYNAMIC CONFIGURATION ENGINE
// ==========================================
async function fetchAndPopulateSettings() {
    try {
        const res = await fetch(`${API_BASE_URL}/settings`);
        const settings = await res.json();
        
        // Reset dropdowns
        const dd = {
            'Brand': document.getElementById('reg-brand'),
            'Size': document.getElementById('reg-size'),
            'Rack': document.getElementById('reg-rack-l'),
            'Department': document.getElementById('reg-emp-dept'),
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
    } catch (e) { console.error("Failed to load settings"); }
}

// ==========================================
// 4. ADMIN CONSOLE LOGIC
// ==========================================
async function addSystemSetting() {
    const cat = document.getElementById('sys-cat').value;
    const val = document.getElementById('sys-val').value;
    const prefix = document.getElementById('sys-prefix').value;
    
    if(!val) return showToast("Enter a value", "error");
    
    try {
        await fetch(`${API_BASE_URL}/settings`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ category: cat, value: val, prefix: prefix }) });
        document.getElementById('sys-val').value = ''; document.getElementById('sys-prefix').value = '';
        showToast(`Added ${val} to ${cat}`);
        fetchAndPopulateSettings();
        loadSystemSettingsList();
    } catch(e) { showToast("Error saving setting", "error"); }
}

async function loadSystemSettingsList() {
    try {
        const res = await fetch(`${API_BASE_URL}/settings`);
        const settings = await res.json();
        document.getElementById('system-settings-list').innerHTML = settings.map(s => `
            <li class="flex justify-between items-center p-2 bg-white rounded border border-slate-100">
                <span><b>${s.Category}:</b> ${s.SettingValue}</span> <span class="text-xs font-mono text-slate-400">${s.PrefixData || ''}</span>
            </li>
        `).join('');
    } catch (e) { }
}

async function loadAuditLog() {
    try {
        const res = await fetch(`${API_BASE_URL}/auditlog`);
        const logs = await res.json();
        const terminal = document.getElementById('audit-log-terminal');
        terminal.innerHTML = logs.map(l => `
            <div class="border-b border-green-900/50 pb-2">
                <span class="text-green-200">[${new Date(l.DeletedAt).toLocaleString()}]</span> 
                <span class="font-bold text-amber-400">${l.ActionType}</span><br>
                <span class="opacity-80">${l.DeletedData}</span>
            </div>
        `).join('') || '<p class="text-slate-500">No logs found.</p>';
    } catch (e) { }
}

async function registerAsset() {
    const name = document.getElementById('reg-name').value;
    const brandDropdown = document.getElementById('reg-brand');
    const brand = brandDropdown.value;
    const prefix = brandDropdown.options[brandDropdown.selectedIndex]?.dataset.prefix || 'PAT';
    const style = document.getElementById('reg-style').value;
    const size = document.getElementById('reg-size').value;
    const rackL = document.getElementById('reg-rack-l').value;
    const rackP = document.getElementById('reg-rack-p').value;
    const imgUrl = document.getElementById('reg-img').value;

    if(!name || !brand || !style || !size || !rackL) return showToast("Fill all asset fields", "error");
    
    const newId = `${prefix}-${style}-${Math.floor(100 + Math.random() * 900)}`;
    const loc = `Rack ${rackL}-${rackP}`;
    
    await fetch(`${API_BASE_URL}/patterns/register`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id: newId, name, brand, style, size, rackL, rackP, loc, imgUrl}) });
    
    document.getElementById('admin-qr-output-pattern').classList.remove('hidden');
    document.getElementById('qr-text-pattern').innerText = newId;
    
    setTimeout(() => {
        document.getElementById('qrcode-image-pattern').innerHTML = "";
        new QRCode(document.getElementById("qrcode-image-pattern"), { text: newId, width: 160, height: 160, colorDark: "#0f172a" });
    }, 50);
    showToast("Asset Block Registered!");
}

async function registerOperator() {
    const name = document.getElementById('reg-emp-name').value;
    const dept = document.getElementById('reg-emp-dept').value;
    const role = document.getElementById('reg-emp-role').value;
    const contact = document.getElementById('reg-emp-contact').value;
    const imgUrl = document.getElementById('reg-emp-img').value;

    if(!name || !dept || !role) return showToast("Fill all borrower fields", "error");
    
    const newId = `EMP-${Math.floor(1000 + Math.random() * 9000)}`;
    
    await fetch(`${API_BASE_URL}/borrowers/register`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id: newId, name, role, dept, contact, imgUrl}) });
    
    document.getElementById('admin-qr-output-emp').classList.remove('hidden');
    document.getElementById('qr-text-emp').innerText = newId;

    setTimeout(() => {
        document.getElementById('qrcode-image-emp').innerHTML = "";
        new QRCode(document.getElementById("qrcode-image-emp"), { text: newId, width: 160, height: 160, colorDark: "#2563eb" });
    }, 50);
    showToast("Borrower Registered!");
}

// ==========================================
// 5. SUPERVISOR PORTAL LOGIC
// ==========================================
async function loadSupervisorDashboard() {
    try {
        const [borrowersRes, patternsRes] = await Promise.all([
            fetch(`${API_BASE_URL}/borrowers`),
            fetch(`${API_BASE_URL}/patterns`)
        ]);
        const borrowers = await borrowersRes.json();
        const patterns = await patternsRes.json();

        // Populate Shift Management (Focus on UNASSIGNED)
        const bList = document.getElementById('supervisor-borrowers-list');
        bList.innerHTML = borrowers.map(b => `
            <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl border ${b.DesignatedShift === 'UNASSIGNED' ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}">
                <div class="flex items-center gap-3">
                    <img src="${b.ImageUrl}" class="w-10 h-10 rounded-full object-cover shadow-sm" onerror="this.src='https://placehold.co/100x100?text=Face'">
                    <div><p class="font-bold text-slate-800 leading-tight">${b.FullName}</p><p class="text-[10px] text-slate-500 font-mono">${b.BorrowerID} | ${b.Role}</p></div>
                </div>
                <div class="flex items-center gap-2">
                    <select id="shift-assign-${b.BorrowerID}" class="p-2 text-sm rounded-lg border border-slate-200 outline-none font-bold ${b.DesignatedShift === 'UNASSIGNED' ? 'text-amber-600' : 'text-slate-700'}">
                        <option value="UNASSIGNED" ${b.DesignatedShift === 'UNASSIGNED' ? 'selected' : ''}>UNASSIGNED</option>
                        <option value="Shift A (Morning)" ${b.DesignatedShift === 'Shift A (Morning)' ? 'selected' : ''}>Shift A</option>
                        <option value="Shift B (Afternoon)" ${b.DesignatedShift === 'Shift B (Afternoon)' ? 'selected' : ''}>Shift B</option>
                        <option value="Shift C (Evening)" ${b.DesignatedShift === 'Shift C (Evening)' ? 'selected' : ''}>Shift C</option>
                    </select>
                    <button onclick="updateShift('${b.BorrowerID}')" class="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700"><i class="ph ph-check-bold"></i></button>
                </div>
            </div>
        `).join('');

        // Populate Active Checkouts
        const activePatterns = patterns.filter(p => p.Status === 'Borrowed');
        const pList = document.getElementById('supervisor-active-list');
        if (activePatterns.length === 0) {
            pList.innerHTML = `<p class="text-slate-400 text-sm text-center py-4">No active checkouts.</p>`;
        } else {
            pList.innerHTML = activePatterns.map(p => `
                <div class="p-3 bg-blue-50 rounded-xl border border-blue-100 flex items-center justify-between">
                    <div><p class="font-bold text-blue-900">${p.PatternName}</p><p class="text-xs text-blue-700 font-mono">${p.PatternID} | ${p.Location}</p></div>
                    <div class="text-right"><p class="text-[10px] font-bold uppercase tracking-widest text-blue-500">Held By</p><p class="font-bold text-slate-800">${p.BorrowedBy}</p></div>
                </div>
            `).join('');
        }

    } catch (e) { showToast("Failed to load dashboard", "error"); }
}

async function updateShift(borrowerId) {
    const shift = document.getElementById(`shift-assign-${borrowerId}`).value;
    try {
        await fetch(`${API_BASE_URL}/borrowers/${borrowerId}/shift`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ shift }) });
        showToast("Shift updated!");
        loadSupervisorDashboard(); // Refresh
    } catch(e) { showToast("Update failed", "error"); }
}

// ==========================================
// 6. ASSET TRACKER & OVERWATCH SEARCH
// ==========================================
const searchInput = document.getElementById('searchInput');
const dropdown = document.getElementById('autocomplete-dropdown');

searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { const val = e.target.value.trim(); if(val) selectPattern(val); } });
searchInput.addEventListener('input', async (e) => {
    const val = e.target.value.trim();
    if (val.length > 0) document.getElementById('clearBtn').classList.remove('hidden');
    else { document.getElementById('clearBtn').classList.add('hidden'); dropdown.classList.add('hidden'); return; }

    try {
        const res = await fetch(`${API_BASE_URL}/patterns/autocomplete/${val}`);
        const matches = await res.json();
        if (matches.length > 0) {
            dropdown.innerHTML = matches.map(m => `
                <div onclick="selectPattern('${m.PatternID}')" class="px-5 py-3 hover:bg-slate-50 cursor-pointer flex items-center gap-4 border-b border-slate-50 group">
                    <img src="${m.ImageUrl}" class="w-12 h-12 object-cover rounded-lg border border-slate-200 shadow-sm" onerror="this.src='https://placehold.co/400x400/e2e8f0/475569?text=Image+Error'">
                    <div class="flex-1"><p class="font-bold text-slate-700 group-hover:text-blue-600">${m.PatternName}</p><p class="text-xs font-mono text-slate-400">${m.PatternID}</p></div>
                </div>
            `).join('');
            dropdown.classList.remove('hidden');
        }
    } catch (err) {}
});

function clearSearch() { searchInput.value = ''; searchInput.dispatchEvent(new Event('input')); }

async function selectPattern(id) {
    dropdown.classList.add('hidden');
    try {
        const res = await fetch(`${API_BASE_URL}/patterns/exact/${id}`);
        const data = await res.json();
        if(!data) return showToast("Pattern Not Found", "error");
        currentAsset = data;
        renderAssetCard();
        document.getElementById('view-tracker').classList.add('hidden');
        document.getElementById('view-asset').classList.remove('hidden');
    } catch (err) { showToast("Database error.", "error"); }
}

function renderAssetCard() {
    const isAvail = currentAsset.Status === 'Available';
    let html = `
        <div class="bg-white w-full rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
            <div class="h-64 w-full bg-slate-100 border-b border-slate-200 relative">
                <img src="${currentAsset.ImageUrl}" class="w-full h-full object-cover" onerror="this.src='https://placehold.co/800x400/e2e8f0/475569?text=No+Image'">
                <div class="absolute top-4 right-4 px-4 py-2 rounded-full text-xs uppercase font-bold tracking-widest shadow-md ${isAvail ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}">${currentAsset.Status}</div>
            </div>
            <div class="p-8">
                <p class="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">${currentAsset.Brand}</p>
                <h2 class="text-3xl font-bold text-slate-800 mb-1">${currentAsset.PatternName}</h2>
                <p class="font-mono text-slate-500 mb-6">ID: ${currentAsset.PatternID}</p>
                
                <div class="grid grid-cols-2 gap-4 mb-8">
                    <div class="bg-slate-50 p-4 rounded-xl border border-slate-100"><p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Location</p><p class="font-bold text-slate-800">${currentAsset.Location}</p></div>
                    <div class="bg-slate-50 p-4 rounded-xl border border-slate-100"><p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Style No.</p><p class="font-bold text-slate-800">${currentAsset.StyleNumber}</p></div>
                    <div class="bg-slate-50 p-4 rounded-xl border border-slate-100 col-span-2"><p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Size Category</p><p class="font-bold text-slate-800">${currentAsset.SizeCategory}</p></div>
                </div>
    `;
    if (isAvail) {
        html += `<button onclick="startVerification('borrow')" class="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-blue-700 text-lg flex items-center justify-center gap-2"><i class="ph ph-qr-code text-2xl"></i> Initiate Checkout</button>`;
    } else {
        html += `<div class="bg-amber-50 p-4 rounded-xl border border-amber-200 mb-6"><p class="text-[10px] font-bold text-amber-700 uppercase tracking-widest">Active Checkout</p><p class="font-bold text-slate-800 mt-1">Operator ID: ${currentAsset.BorrowedBy}</p><p class="text-xs mt-2 text-amber-600 font-bold">Due: ${currentAsset.DueDate}</p></div>
                 <button onclick="startVerification('return')" class="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-slate-800 text-lg flex items-center justify-center gap-2"><i class="ph ph-qr-code text-2xl"></i> Process Return</button>`;
    }
    document.getElementById('asset-card-container').innerHTML = html + `</div></div>`;
}

// ==========================================
// 7. OVERWATCH SCANNER PROTOCOL
// ==========================================
function startVerification(flowType) {
    vState = { flow: flowType, empScanned: null, isDelegate: false };
    document.getElementById('modal-title').innerText = flowType === 'borrow' ? "Checkout Protocol" : "Return Protocol";
    document.getElementById('step-1-indicator').innerHTML = `<i class="ph ph-circle text-lg"></i> Pattern`;
    document.getElementById('step-1-indicator').className = "flex items-center gap-1 text-slate-400";
    document.getElementById('step-2-indicator').innerHTML = `<i class="ph ph-circle text-lg"></i> Operator`;
    document.getElementById('step-2-indicator').className = "flex items-center gap-1 text-slate-400";
    const modal = document.getElementById('verify-modal');
    modal.classList.remove('hidden'); setTimeout(() => modal.classList.remove('opacity-0'), 10);
    triggerCameraForStep("Scan physical Pattern QR", handlePatternScan, 'pattern');
}

function openQuickScan() {
    currentAsset = null;
    vState = { flow: null, empScanned: null, isDelegate: false };
    document.getElementById('modal-title').innerText = "Quick Locate Asset";
    document.getElementById('step-1-indicator').parentElement.classList.add('hidden');
    const m = document.getElementById('verify-modal'); m.classList.remove('hidden'); setTimeout(() => m.classList.remove('opacity-0'), 10);
    triggerCameraForStep("Scan physical Pattern QR", handlePatternScan, 'pattern');
}

async function triggerCameraForStep(message, callback, targetType) {
    let simButtons = '';
    try {
        if (targetType === 'pattern') {
            const res = await fetch(`${API_BASE_URL}/patterns`);
            const patterns = await res.json();
            simButtons = patterns.map(p => `<button onclick="simulateScan('${p.PatternID}')" class="text-xs bg-slate-50 text-slate-600 font-bold px-3 py-2 rounded-xl hover:bg-blue-50 hover:text-blue-700 border border-slate-200 w-full text-left flex items-center gap-3 transition-all"><img src="${p.ImageUrl}" class="w-8 h-8 rounded object-cover" onerror="this.src='https://placehold.co/100x100?text=NA'"> <div class="flex-1"><span class="block">${p.PatternName}</span><span class="block text-[10px] text-slate-400 font-mono">${p.PatternID}</span></div></button>`).join('');
        } else {
            const res = await fetch(`${API_BASE_URL}/borrowers`);
            const emps = await res.json();
            simButtons = emps.map(e => `<button onclick="simulateScan('${e.BorrowerID}')" class="text-xs bg-slate-50 text-slate-600 font-bold px-3 py-2 rounded-xl hover:bg-blue-50 hover:text-blue-700 border border-slate-200 w-full text-left flex items-center gap-3 transition-all"><img src="${e.ImageUrl}" class="w-8 h-8 rounded-full object-cover" onerror="this.src='https://placehold.co/100x100?text=Face'"> <div class="flex-1"><span class="block">${e.FullName}</span><span class="block text-[10px] text-slate-400">${e.DesignatedShift}</span></div></button>`).join('');
        }
    } catch(e) { simButtons = '<p class="text-xs text-red-500">Simulation Load Failed</p>'; }

    document.getElementById('modal-dynamic-area').innerHTML = `
        <div class="text-center w-full flex flex-col h-full overflow-hidden">
            <p class="font-bold text-slate-800 mb-4 text-lg shrink-0">${message}</p>
            <div id="camera-stream" class="w-full bg-black rounded-xl overflow-hidden shadow-inner mb-4 border border-slate-300 min-h-[200px] shrink-0"></div>
            <div class="mt-2 pt-4 border-t border-slate-100 w-full flex-1 flex flex-col min-h-0">
                <p class="text-[10px] uppercase font-bold text-slate-400 mb-3 text-left tracking-widest shrink-0"><i class="ph-fill ph-code"></i> Developer Simulation</p>
                <div class="max-h-40 overflow-y-auto space-y-2 pr-1 pb-2">${simButtons}</div>
            </div>
        </div>
    `;
    scanner = new Html5Qrcode("camera-stream");
    scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => { stopCamera(); callback(text); }, () => {}
    ).catch(err => console.log("Camera off"));
    window.simulateScan = function(text) { stopCamera(); callback(text); }
}

function stopCamera() { if (scanner && scanner.isScanning) scanner.stop(); }
function closeVerifyModal() { stopCamera(); document.getElementById('verify-modal').classList.add('opacity-0'); setTimeout(() => document.getElementById('verify-modal').classList.add('hidden'), 300); }

async function handlePatternScan(scannedId) {
    if (!currentAsset) {
        try {
            const res = await fetch(`${API_BASE_URL}/patterns/exact/${scannedId}`);
            const data = await res.json();
            if (!data) { closeVerifyModal(); return showToast("Pattern Not Found", "error"); }
            currentAsset = data;
            vState.flow = currentAsset.Status === 'Available' ? 'borrow' : 'return';
            document.getElementById('modal-title').innerText = vState.flow === 'borrow' ? "Checkout Protocol" : "Return Protocol";
            document.getElementById('step-1-indicator').parentElement.classList.remove('hidden');
            renderAssetCard();
            document.getElementById('view-tracker').classList.add('hidden');
            document.getElementById('view-asset').classList.remove('hidden');
        } catch (err) { closeVerifyModal(); return showToast("Database error.", "error"); }
    } else {
        if (scannedId !== currentAsset.PatternID) return showToast("Wrong Pattern!", "error");
    }

    document.getElementById('step-1-indicator').innerHTML = `<i class="ph-fill ph-check-circle text-lg"></i> Pattern Scanned`;
    document.getElementById('step-1-indicator').className = "flex items-center gap-1 text-blue-600";
    
    if (vState.flow === 'borrow') triggerCameraForStep("Step 2: Scan Operator Badge", handleOperatorScan, 'operator');
    else {
        document.getElementById('modal-dynamic-area').innerHTML = `
            <p class="font-bold text-slate-800 mb-6 text-center text-lg">Are you the original borrower?</p>
            <div class="w-full space-y-3"><button onclick="vState.isDelegate=false; triggerCameraForStep('Prove Identity: Scan your badge', handleOperatorScan, 'operator')" class="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 shadow-lg">Yes, I am the original</button><button onclick="vState.isDelegate=true; triggerCameraForStep('Scan YOUR Badge to authorize transfer', handleOperatorScan, 'operator')" class="w-full bg-white border-2 border-slate-200 text-slate-600 font-bold py-4 rounded-xl hover:bg-slate-50">No, returning for someone else</button></div>
        `;
    }
}

async function handleOperatorScan(scannedId) {
    try {
        const res = await fetch(`${API_BASE_URL}/borrowers/${scannedId}`);
        if (!res.ok) return showToast("Invalid Badge", "error");
        const emp = await res.json();
        vState.empScanned = emp.BorrowerID;
        document.getElementById('step-2-indicator').innerHTML = `<i class="ph-fill ph-check-circle text-lg"></i> Authorized`;
        document.getElementById('step-2-indicator').className = "flex items-center gap-1 text-blue-600";
        
        if (vState.flow === 'borrow') {
            const exactDateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            document.getElementById('modal-dynamic-area').innerHTML = `
                <div class="bg-blue-50 p-4 rounded-xl w-full mb-6 border border-blue-100 flex items-center gap-4">
                    <img src="${emp.ImageUrl}" class="w-12 h-12 rounded-full object-cover shadow-sm" onerror="this.src='https://placehold.co/100x100?text=Face'">
                    <div><p class="text-[10px] font-bold uppercase text-blue-600 tracking-widest mb-1">Badge Scanned</p><p class="font-bold text-slate-800 leading-none">${emp.FullName}</p><p class="text-[10px] text-slate-500 mt-1">${emp.DesignatedShift}</p></div>
                </div>
                <div class="w-full text-left mb-6"><p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Target Date</p><p class="font-bold text-lg text-slate-800">${exactDateStr}</p></div>
                <p class="font-bold text-slate-800 mb-2 w-full text-left">Confirm Requested Shift Checkout</p>
                <select id="final-shift-select" class="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none mb-8">
                    <option value="Shift A (Morning)">Shift A (Morning)</option><option value="Shift B (Afternoon)">Shift B (Afternoon)</option><option value="Shift C (Evening)">Shift C (Evening)</option>
                </select>
                <button onclick="processFinalBorrow()" class="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-slate-800 flex justify-center items-center gap-2">Request Overwatch Approval <i class="ph ph-shield-check text-xl"></i></button>
            `;
        } else {
            processFinalReturn(); 
        }
    } catch (err) { showToast("Error verifying operator.", "error"); }
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
            // OVERWATCH BLOCK TRIGGERED
            document.getElementById('modal-dynamic-area').innerHTML = `
                <div class="flex flex-col items-center py-6 w-full fade-in text-center">
                    <i class="ph-fill ph-warning-circle text-6xl text-red-600 mb-4"></i>
                    <h2 class="text-2xl font-bold text-slate-800 mb-2">Access Denied</h2>
                    <p class="text-sm text-red-600 mb-8 font-bold border border-red-200 bg-red-50 p-4 rounded-xl">${data.error}</p>
                    <button onclick="closeVerifyModal()" class="w-full bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-slate-800 shadow-lg">Acknowledge</button>
                </div>
            `;
        } else {
            showSuccessScreen("Checkout Approved by Overwatch");
        }
    } catch (e) { showToast("Network error", "error"); }
}

async function processFinalReturn() {
    try {
        await fetch(`${API_BASE_URL}/patterns/return`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patternId: currentAsset.PatternID, returningBorrowerId: vState.empScanned }) });
        showSuccessScreen("Return Processed Successfully");
    } catch (e) { showToast("Database error", "error"); }
}

function showSuccessScreen(title) {
    document.getElementById('modal-dynamic-area').innerHTML = `
        <div class="flex flex-col items-center py-6 w-full fade-in text-center">
            <i class="ph-fill ph-check-circle text-6xl text-emerald-500 mb-4"></i><h2 class="text-2xl font-bold text-slate-800 mb-2 text-balance">${title}</h2><p class="text-sm text-slate-500 mb-8 font-medium">Redirecting in <span id="sec-text" class="font-bold text-blue-600">5</span>s...</p>
            <div class="flex gap-3 w-full"><button onclick="clearTimerAndStay()" class="flex-1 bg-slate-100 text-slate-600 font-bold py-4 rounded-xl hover:bg-slate-200">Stay Here</button><button onclick="executeRedirect()" class="flex-1 bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-slate-800 shadow-lg">Done</button></div>
        </div>
    `;
    let timeLeft = 5;
    window.redirectTimer = setInterval(() => { timeLeft--; const el = document.getElementById('sec-text'); if(el) el.innerText = timeLeft; if (timeLeft <= 0) executeRedirect(); }, 1000);
}

function clearTimerAndStay() { clearInterval(window.redirectTimer); closeVerifyModal(); selectPattern(currentAsset.PatternID); }
function executeRedirect() { clearInterval(window.redirectTimer); closeVerifyModal(); navTo('tracker'); }