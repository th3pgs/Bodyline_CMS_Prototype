const API_BASE_URL = 'https://bodyline-cms-api.onrender.com/api';
let scanner = null;
let currentAsset = null;
let vState = { flow: null, empScanned: null, isDelegate: false };

document.addEventListener('DOMContentLoaded', () => {
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('current-date-display').innerText = new Date().toLocaleDateString('en-US', opts);
});

function goHome() {
    document.getElementById('view-asset').classList.add('hidden');
    document.getElementById('view-admin').classList.add('hidden');
    document.getElementById('main-header').classList.remove('hidden');
    document.getElementById('view-home').classList.remove('hidden');
    document.getElementById('searchInput').value = '';
    document.getElementById('clearBtn').classList.add('hidden');
    document.getElementById('autocomplete-dropdown').classList.add('hidden');
}

// ==========================================
// ADMIN & PRINT LOGIC
// ==========================================
function showAdminAuth() {
    const modal = document.getElementById('admin-auth-modal');
    modal.classList.remove('hidden'); setTimeout(() => modal.classList.remove('opacity-0'), 10);
}
function closeAdminAuth() {
    document.getElementById('admin-auth-modal').classList.add('opacity-0');
    setTimeout(() => document.getElementById('admin-auth-modal').classList.add('hidden'), 300);
}
function executeAdminLogin() {
    closeAdminAuth();
    document.getElementById('view-home').classList.add('hidden');
    document.getElementById('main-header').classList.add('hidden');
    document.getElementById('view-admin').classList.remove('hidden');
}

// Custom Logout Modal Logic
function promptLogout() {
    const modal = document.getElementById('logout-modal');
    modal.classList.remove('hidden'); setTimeout(() => modal.classList.remove('opacity-0'), 10);
}
function closeLogoutModal() {
    document.getElementById('logout-modal').classList.add('opacity-0');
    setTimeout(() => document.getElementById('logout-modal').classList.add('hidden'), 300);
}
function executeLogout() {
    closeLogoutModal();
    goHome();
}

function printQR(targetId) {
    const content = document.getElementById(targetId).innerHTML;
    const printZone = document.getElementById('print-area');
    printZone.innerHTML = content;
    printZone.classList.remove('hidden');
    printZone.id = 'print-zone'; 
    window.print();
    printZone.id = 'print-area'; 
    printZone.classList.add('hidden');
    printZone.innerHTML = '';
}

async function registerAsset() {
    const name = document.getElementById('reg-name').value;
    const loc = document.getElementById('reg-loc').value;
    if(!name) return showToast("Enter name", "error");
    const newId = "PAT-" + Math.floor(1000 + Math.random() * 9000);
    
    await fetch(`${API_BASE_URL}/patterns/register`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id: newId, name: name, location: loc}) });
    
    // Unhide the container FIRST so QRCode.js can calculate dimensions
    document.getElementById('admin-qr-output-pattern').classList.remove('hidden');
    document.getElementById('qrcode-image-pattern').innerHTML = "";
    new QRCode(document.getElementById("qrcode-image-pattern"), { text: newId, width: 160, height: 160, colorDark: "#0f172a" });
    document.getElementById('qr-text-pattern').innerText = newId;
    
    document.getElementById('reg-name').value = "";
    document.getElementById('reg-loc').value = "";
    showToast("Pattern Registered!");
}

async function registerOperator() {
    const name = document.getElementById('reg-emp-name').value;
    const role = document.getElementById('reg-emp-role').value;
    if(!name) return showToast("Enter name", "error");
    const newId = "EMP-" + Math.floor(100 + Math.random() * 900);
    
    await fetch(`${API_BASE_URL}/employees/register`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id: newId, name: name, role: role}) });
    
    // Unhide FIRST
    document.getElementById('admin-qr-output-emp').classList.remove('hidden');
    document.getElementById('qrcode-image-emp').innerHTML = "";
    new QRCode(document.getElementById("qrcode-image-emp"), { text: newId, width: 160, height: 160, colorDark: "#2563eb" });
    document.getElementById('qr-text-emp').innerText = newId;

    document.getElementById('reg-emp-name').value = "";
    showToast("Operator Registered!");
}

// ==========================================
// SEARCH LOGIC
// ==========================================
const searchInput = document.getElementById('searchInput');
const dropdown = document.getElementById('autocomplete-dropdown');

searchInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        const val = e.target.value.trim();
        if(val) selectPattern(val); 
    }
});

searchInput.addEventListener('input', async (e) => {
    const val = e.target.value.trim();
    if (val.length > 0) document.getElementById('clearBtn').classList.remove('hidden');
    else { document.getElementById('clearBtn').classList.add('hidden'); dropdown.classList.add('hidden'); return; }

    try {
        const res = await fetch(`${API_BASE_URL}/patterns/autocomplete/${val}`);
        const matches = await res.json();
        if (matches.length > 0) {
            dropdown.innerHTML = matches.map(m => `
                <div onclick="selectPattern('${m.PatternID}')" class="px-5 py-3 hover:bg-slate-50 cursor-pointer flex justify-between items-center border-b border-slate-50 group">
                    <p class="font-bold text-slate-700 group-hover:text-blue-600">${m.PatternName}</p><span class="text-xs font-mono text-slate-400">${m.PatternID}</span>
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
        document.getElementById('view-home').classList.add('hidden');
        document.getElementById('view-asset').classList.remove('hidden');
    } catch (err) { showToast("Database error.", "error"); }
}

function renderAssetCard() {
    const isAvail = currentAsset.Status === 'Available';
    let html = `
        <div class="bg-white w-full rounded-3xl shadow-xl border border-slate-200 p-8">
            <div class="inline-block px-3 py-1 rounded-full text-[10px] uppercase font-bold tracking-widest mb-4 ${isAvail ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${currentAsset.Status}</div>
            <h2 class="text-3xl font-bold text-slate-800 mb-2">${currentAsset.PatternName}</h2>
            <p class="font-mono text-slate-500 mb-6">ID: ${currentAsset.PatternID}</p>
            <div class="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-8"><p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Location</p><p class="font-bold text-lg">${currentAsset.Location}</p></div>
    `;
    if (isAvail) {
        html += `<button onclick="startVerification('borrow')" class="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-[0_4px_14px_0_rgb(37,99,235,0.39)] hover:bg-blue-700 text-lg">Borrow</button>`;
    } else {
        html += `<div class="bg-amber-50 p-4 rounded-xl border border-amber-200 mb-6"><p class="text-[10px] font-bold text-amber-700 uppercase tracking-widest">Active Checkout</p><p class="font-bold text-slate-800 mt-1">Operator ID: ${currentAsset.BorrowedBy}</p><p class="text-xs mt-2 text-amber-600 font-bold">Due: ${currentAsset.DueDate}</p></div>
                 <button onclick="startVerification('return')" class="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-slate-800 text-lg">Return</button>`;
    }
    document.getElementById('asset-card-container').innerHTML = html + `</div>`;
}

// ==========================================
// STRICT VERIFICATION & DYNAMIC SIMULATOR
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

async function triggerCameraForStep(message, callback, targetType) {
    let simButtons = '';
    
    // Dynamically fetch ALL database items for the Developer Simulator
    try {
        if (targetType === 'pattern') {
            const res = await fetch(`${API_BASE_URL}/patterns`);
            const patterns = await res.json();
            simButtons = patterns.map(p => `<button onclick="simulateScan('${p.PatternID}')" class="text-xs bg-slate-50 text-slate-600 font-bold px-4 py-3 rounded-xl hover:bg-blue-50 hover:text-blue-700 border border-slate-200 w-full text-left flex justify-between items-center transition-all"><span>${p.PatternName}</span><span class="text-slate-400 font-mono">${p.PatternID}</span></button>`).join('');
        } else {
            const res = await fetch(`${API_BASE_URL}/employees`);
            const emps = await res.json();
            simButtons = emps.map(e => `<button onclick="simulateScan('${e.EmployeeID}')" class="text-xs bg-slate-50 text-slate-600 font-bold px-4 py-3 rounded-xl hover:bg-blue-50 hover:text-blue-700 border border-slate-200 w-full text-left flex justify-between items-center transition-all"><span>${e.FullName}</span><span class="text-slate-400">${e.Role}</span></button>`).join('');
        }
    } catch(e) { simButtons = '<p class="text-xs text-red-500">Failed to load simulations</p>'; }

    document.getElementById('modal-dynamic-area').innerHTML = `
        <div class="text-center w-full flex flex-col h-full overflow-hidden">
            <p class="font-bold text-slate-800 mb-4 text-lg shrink-0">${message}</p>
            <div id="camera-stream" class="w-full bg-black rounded-xl overflow-hidden shadow-inner mb-4 border border-slate-300 min-h-[200px] shrink-0"></div>
            
            <div class="mt-2 pt-4 border-t border-slate-100 w-full flex-1 flex flex-col min-h-0">
                <p class="text-[10px] uppercase font-bold text-slate-400 mb-3 text-left tracking-widest shrink-0"><i class="ph-fill ph-code"></i> Developer Simulation Mode</p>
                <div class="max-h-40 overflow-y-auto space-y-2 pr-1 pb-2">
                    ${simButtons}
                </div>
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

function handlePatternScan(scannedId) {
    if (!currentAsset) { selectPattern(scannedId); closeVerifyModal(); return; } 
    if (scannedId !== currentAsset.PatternID) return showToast("Wrong Pattern!", "error");
    
    document.getElementById('step-1-indicator').innerHTML = `<i class="ph-fill ph-check-circle text-lg"></i> Pattern Scanned`;
    document.getElementById('step-1-indicator').className = "flex items-center gap-1 text-blue-600";

    if (vState.flow === 'borrow') {
        triggerCameraForStep("Step 2: Scan Operator Badge", handleOperatorScan, 'operator');
    } else {
        askReturnDelegate();
    }
}

function askReturnDelegate() {
    document.getElementById('modal-dynamic-area').innerHTML = `
        <p class="font-bold text-slate-800 mb-6 text-center text-lg">Are you the original borrower?</p>
        <div class="w-full space-y-3">
            <button onclick="setupReturnScan(false)" class="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 shadow-lg">Yes, I am the original</button>
            <button onclick="setupReturnScan(true)" class="w-full bg-white border-2 border-slate-200 text-slate-600 font-bold py-4 rounded-xl hover:bg-slate-50">No, returning for someone else</button>
        </div>
    `;
}

function setupReturnScan(isDelegate) {
    vState.isDelegate = isDelegate;
    const msg = isDelegate ? "Scan YOUR Badge to authorize transfer" : "Prove Identity: Scan your badge";
    triggerCameraForStep(msg, handleOperatorScan, 'operator');
}

async function handleOperatorScan(scannedId) {
    try {
        const res = await fetch(`${API_BASE_URL}/employees/${scannedId}`);
        if (!res.ok) return showToast("Invalid Badge", "error");
        const emp = await res.json();
        vState.empScanned = emp.EmployeeID;

        document.getElementById('step-2-indicator').innerHTML = `<i class="ph-fill ph-check-circle text-lg"></i> Authorized`;
        document.getElementById('step-2-indicator').className = "flex items-center gap-1 text-blue-600";

        if (vState.flow === 'borrow') showShiftSelection(emp);
        else processFinalReturn(); 
    } catch (err) { showToast("Error verifying operator.", "error"); }
}

function showShiftSelection(emp) {
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const exactDateStr = new Date().toLocaleDateString('en-US', opts);

    document.getElementById('modal-dynamic-area').innerHTML = `
        <div class="bg-blue-50 p-4 rounded-xl w-full mb-6 border border-blue-100 flex items-center gap-4">
            <div class="h-10 w-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">${emp.FullName.charAt(0)}</div>
            <div><p class="text-[10px] font-bold uppercase text-blue-600 tracking-widest mb-1">Authorized</p><p class="font-bold text-slate-800 leading-none">${emp.FullName}</p></div>
        </div>
        <div class="w-full text-left mb-6">
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Target Date</p>
            <p class="font-bold text-lg text-slate-800">${exactDateStr}</p>
        </div>
        <p class="font-bold text-slate-800 mb-2 w-full text-left">Select Expected Return Shift</p>
        <select id="final-shift-select" class="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none mb-8">
            <option value="A">Shift A (Morning)</option><option value="B">Shift B (Afternoon)</option><option value="C">Shift C (Evening)</option>
        </select>
        <button onclick="processFinalBorrow()" class="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-slate-800 flex justify-center items-center gap-2">Finalize Checkout <i class="ph ph-check-circle text-xl"></i></button>
    `;
}

async function processFinalBorrow() {
    const shift = document.getElementById('final-shift-select').value;
    const exactDateStr = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const finalShiftString = `${shift} (${exactDateStr})`;

    try {
        await fetch(`${API_BASE_URL}/patterns/borrow`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patternId: currentAsset.PatternID, employeeId: vState.empScanned, shiftStr: finalShiftString }) });
        showSuccessScreen("Checkout Logged & Secured");
    } catch (e) { showToast("Database error", "error"); }
}

async function processFinalReturn() {
    try {
        await fetch(`${API_BASE_URL}/patterns/return`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patternId: currentAsset.PatternID, returningEmployeeId: vState.empScanned, isDelegate: vState.isDelegate }) });
        showSuccessScreen("Return Logged & Secured");
    } catch (e) { showToast("Database error", "error"); }
}

function showSuccessScreen(title) {
    document.getElementById('modal-dynamic-area').innerHTML = `
        <div class="flex flex-col items-center py-6 w-full fade-in text-center">
            <i class="ph-fill ph-check-circle text-6xl text-blue-600 mb-4"></i>
            <h2 class="text-2xl font-bold text-slate-800 mb-2">${title}</h2>
            <p class="text-sm text-slate-500 mb-8 font-medium">System redirecting in <span id="sec-text" class="font-bold text-blue-600">10</span>s...</p>
            <div class="flex gap-3 w-full">
                <button onclick="clearTimerAndStay()" class="flex-1 bg-slate-100 text-slate-600 font-bold py-4 rounded-xl hover:bg-slate-200">Stay Here</button>
                <button onclick="executeRedirect()" class="flex-1 bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-slate-800 shadow-lg">Go Home Now</button>
            </div>
        </div>
    `;
    let timeLeft = 10;
    window.redirectTimer = setInterval(() => {
        timeLeft--;
        const el = document.getElementById('sec-text');
        if(el) el.innerText = timeLeft;
        if (timeLeft <= 0) executeRedirect();
    }, 1000);
}

function clearTimerAndStay() { clearInterval(window.redirectTimer); closeVerifyModal(); selectPattern(currentAsset.PatternID); }
function executeRedirect() { clearInterval(window.redirectTimer); closeVerifyModal(); goHome(); }

function openQuickScan() {
    vState = { flow: null, empScanned: null, isDelegate: false };
    document.getElementById('modal-title').innerText = "Quick Locate Asset";
    document.getElementById('step-1-indicator').parentElement.classList.add('hidden');
    const modal = document.getElementById('verify-modal');
    modal.classList.remove('hidden'); setTimeout(() => modal.classList.remove('opacity-0'), 10);
    triggerCameraForStep("Scan physical Pattern QR", handlePatternScan, 'pattern');
}

function showToast(msg, type="success") {
    const toast = document.createElement('div');
    const color = type === "error" ? "bg-red-600" : "bg-slate-800";
    toast.className = `fixed bottom-8 left-1/2 transform -translate-x-1/2 ${color} text-white px-6 py-3 rounded-xl shadow-2xl z-[100] fade-in font-medium flex items-center gap-2`;
    toast.innerHTML = `<i class="ph ${type === 'error' ? 'ph-warning-circle' : 'ph-check-circle'} text-lg"></i> ${msg}`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.classList.replace('fade-in', 'opacity-0'); toast.style.transition = 'opacity 0.3s ease'; setTimeout(() => toast.remove(), 300); }, 3000);
}