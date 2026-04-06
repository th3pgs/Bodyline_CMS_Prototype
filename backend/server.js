const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Enterprise Database Pool
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 10
});

db.getConnection()
    .then(() => console.log('SUCCESS: CMS Plus Core Online'))
    .catch(err => console.error('Database Connection Error:', err));

// ==========================================
// 1. SYSTEM PARAMETERS & AUDIT LOG
// ==========================================
app.get('/api/settings', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM SystemSettings ORDER BY Category, SettingValue");
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/settings', async (req, res) => {
    try {
        await db.query("INSERT INTO SystemSettings (Category, SettingValue, PrefixData) VALUES (?, ?, ?)", [req.body.category, req.body.value, req.body.prefix || null]);
        await db.query("INSERT INTO AuditLog (LogCategory, ActionType, LogData) VALUES ('System', 'ADDED_PARAMETER', ?)", [`Added ${req.body.category}: ${req.body.value}`]);
        res.json({ message: "Setting added" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/settings/:id', async (req, res) => {
    try {
        await db.query("DELETE FROM SystemSettings WHERE SettingID = ?", [req.params.id]);
        res.json({ message: "Setting deleted" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/auditlog', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM AuditLog ORDER BY CreatedAt DESC LIMIT 200");
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 2. THE MASTER LEDGER (CRUD for Assets & Operators)
// ==========================================
app.get('/api/patterns', async (req, res) => {
    try {
        // Auto-clear expired Mutex Locks dynamically on read
        await db.query("UPDATE Patterns SET Status = 'Available', LockExpiresAt = NULL, BorrowedBy = NULL WHERE Status = 'Locked_Pending' AND LockExpiresAt < NOW()");
        const [rows] = await db.query("SELECT * FROM Patterns");
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/borrowers', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM Borrowers");
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/patterns/register', async (req, res) => {
    const { id, name, brand, style, size, loc, imgUrl } = req.body;
    try {
        await db.query("INSERT INTO Patterns (PatternID, PatternName, Brand, StyleNumber, SizeCategory, RackLocation, ImageUrl) VALUES (?, ?, ?, ?, ?, ?, ?)", [id, name, brand, style, size, loc, imgUrl]);
        await db.query("INSERT INTO AuditLog (LogCategory, ActionType, LogData) VALUES ('Register', 'NEW_ASSET', ?)", [id]);
        res.json({ message: "Pattern Registered" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/borrowers/register', async (req, res) => {
    const { id, name, role, imgUrl } = req.body;
    try {
        await db.query("INSERT INTO Borrowers (BorrowerID, FullName, Role, ImageUrl) VALUES (?, ?, ?, ?)", [id, name, role, imgUrl]);
        await db.query("INSERT INTO AuditLog (LogCategory, ActionType, LogData) VALUES ('Register', 'NEW_OPERATOR', ?)", [id]);
        res.json({ message: "Borrower Registered" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// MASTER LEDGER EDITS
app.put('/api/patterns/:id', async (req, res) => {
    const { name, brand, style, size, loc, imgUrl } = req.body;
    try {
        await db.query("UPDATE Patterns SET PatternName=?, Brand=?, StyleNumber=?, SizeCategory=?, RackLocation=?, ImageUrl=? WHERE PatternID=?", [name, brand, style, size, loc, imgUrl, req.params.id]);
        await db.query("INSERT INTO AuditLog (LogCategory, ActionType, LogData) VALUES ('System', 'EDIT_ASSET', ?)", [req.params.id]);
        res.json({ message: "Asset Updated" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/borrowers/:id', async (req, res) => {
    const { name, role, imgUrl } = req.body;
    try {
        await db.query("UPDATE Borrowers SET FullName=?, Role=?, ImageUrl=? WHERE BorrowerID=?", [name, role, imgUrl, req.params.id]);
        await db.query("INSERT INTO AuditLog (LogCategory, ActionType, LogData) VALUES ('System', 'EDIT_OPERATOR', ?)", [req.params.id]);
        res.json({ message: "Operator Updated" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETIONS & GRAVEYARD LOGGING
app.delete('/api/patterns/:id', async (req, res) => {
    try {
        const [pattern] = await db.query("SELECT * FROM Patterns WHERE PatternID = ?", [req.params.id]);
        if (pattern.length > 0) {
            await db.query("INSERT INTO AuditLog (LogCategory, ActionType, LogData) VALUES ('Delete', 'PURGED_ASSET', ?)", [JSON.stringify(pattern[0])]);
            await db.query("DELETE FROM Patterns WHERE PatternID = ?", [req.params.id]);
        }
        res.json({ message: "Asset Purged" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/borrowers/:id', async (req, res) => {
    try {
        const [borrower] = await db.query("SELECT * FROM Borrowers WHERE BorrowerID = ?", [req.params.id]);
        if (borrower.length > 0) {
            await db.query("INSERT INTO AuditLog (LogCategory, ActionType, LogData) VALUES ('Delete', 'PURGED_OPERATOR', ?)", [JSON.stringify(borrower[0])]);
            await db.query("DELETE FROM Borrowers WHERE BorrowerID = ?", [req.params.id]);
        }
        res.json({ message: "Operator Purged" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 3. CALENDAR & SUPERVISOR QUEUE
// ==========================================
app.get('/api/assignments', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM ShiftAssignments");
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/assignments', async (req, res) => {
    try {
        // Create an assignment (Supervisor drag and drop or ticket approval)
        await db.query("INSERT IGNORE INTO ShiftAssignments (BorrowerID, AssignedDate, ShiftType) VALUES (?, ?, ?)", [req.body.borrowerId, req.body.date, req.body.shift]);
        res.json({ message: "Shift Assigned" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/requests', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT p.RequestID, p.PatternID, p.RequestedShift, p.RequestTime, p.RequestStatus, b.BorrowerID, b.FullName, b.Role, b.ImageUrl 
            FROM PendingRequests p 
            JOIN Borrowers b ON p.BorrowerID = b.BorrowerID 
            WHERE p.RequestStatus IN ('Pending', 'Approved') ORDER BY p.RequestTime DESC
        `);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/requests/resolve', async (req, res) => {
    const { requestId, action, borrowerId, date, shift, patternId } = req.body; // action: 'Approve' or 'Decline'
    try {
        if (action === 'Approve') {
            await db.query("UPDATE PendingRequests SET RequestStatus = 'Approved' WHERE RequestID = ?", [requestId]);
            await db.query("INSERT IGNORE INTO ShiftAssignments (BorrowerID, AssignedDate, ShiftType) VALUES (?, ?, ?)", [borrowerId, date, shift]);
        } else {
            await db.query("UPDATE PendingRequests SET RequestStatus = 'Declined' WHERE RequestID = ?", [requestId]);
            // Kill the Mutex Lock instantly
            await db.query("UPDATE Patterns SET Status = 'Available', LockExpiresAt = NULL, BorrowedBy = NULL WHERE PatternID = ?", [patternId]);
        }
        res.json({ message: `Request ${action}d` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 4. CMS PLUS CHECKOUT ENGINE (With Mutex Lock)
// ==========================================
app.get('/api/patterns/exact/:id', async (req, res) => {
    try {
        await db.query("UPDATE Patterns SET Status = 'Available', LockExpiresAt = NULL, BorrowedBy = NULL WHERE Status = 'Locked_Pending' AND LockExpiresAt < NOW()");
        const [rows] = await db.query("SELECT * FROM Patterns WHERE PatternID = ?", [req.params.id]);
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/patterns/borrow', async (req, res) => {
    const { patternId, borrowerId, requestedShift, requestedDate } = req.body;
    
    try {
        // 1. Check if Pattern is already strictly borrowed or locked by someone else
        const [patCheck] = await db.query("SELECT Status, BorrowedBy, LockExpiresAt FROM Patterns WHERE PatternID = ?", [patternId]);
        if (patCheck.length === 0) return res.status(404).json({ error: "Asset not found." });
        const p = patCheck[0];
        
        if (p.Status === 'Borrowed') return res.status(403).json({ type: "DENIED", error: "Asset is currently checked out." });
        if (p.Status === 'Locked_Pending' && p.BorrowedBy !== borrowerId) {
            return res.status(403).json({ type: "DENIED", error: "Asset is temporarily locked by another operator's pending request." });
        }

        // 2. Fetch Borrower Data
        const [borrowers] = await db.query("SELECT ActiveCheckoutCount FROM Borrowers WHERE BorrowerID = ?", [borrowerId]);
        if (borrowers.length === 0) return res.status(404).json({ error: "Operator not found." });
        const b = borrowers[0];

        // 3. Concurrency Limit
        if (b.ActiveCheckoutCount >= 1) return res.status(403).json({ type: "DENIED", error: "Concurrency Limit: Return active asset before checking out another." });

        // 4. Verify Calendar Assignment for Today
        const [assignments] = await db.query("SELECT * FROM ShiftAssignments WHERE BorrowerID = ? AND AssignedDate = ? AND ShiftType = ?", [borrowerId, requestedDate, requestedShift]);

        if (assignments.length === 0) {
            // RULE: NOT ASSIGNED -> TRIGGER MUTEX LOCK & TICKET
            // Check if ticket already exists so we don't spam
            const [existing] = await db.query("SELECT RequestID FROM PendingRequests WHERE BorrowerID = ? AND PatternID = ? AND RequestStatus = 'Pending'", [borrowerId, patternId]);
            if (existing.length === 0) {
                await db.query("INSERT INTO PendingRequests (BorrowerID, PatternID, RequestedShift, RequestedDate) VALUES (?, ?, ?, ?)", [borrowerId, patternId, requestedShift, requestedDate]);
                await db.query("UPDATE Patterns SET Status = 'Locked_Pending', BorrowedBy = ?, LockExpiresAt = DATE_ADD(NOW(), INTERVAL 15 MINUTE) WHERE PatternID = ?", [borrowerId, patternId]);
            }
            return res.status(403).json({ type: "PENDING", error: "Shift Not Assigned. Asset locked for 15 minutes. Clearance ticket routed to Supervisor Dashboard." });
        }

        // 5. IF ASSIGNED -> FINAL CHECKOUT EXECUTION
        await db.query("UPDATE Patterns SET Status = 'Borrowed', BorrowedBy = ?, ShiftCheckout = ?, CheckoutTime = NOW(), LockExpiresAt = NULL WHERE PatternID = ?", [borrowerId, requestedShift, patternId]);
        await db.query("UPDATE Borrowers SET ActiveCheckoutCount = ActiveCheckoutCount + 1 WHERE BorrowerID = ?", [borrowerId]);
        
        res.json({ message: "Checkout Sequence Approved." });

    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/patterns/return', async (req, res) => {
    const { patternId } = req.body;
    try {
        const [patterns] = await db.query("SELECT BorrowedBy FROM Patterns WHERE PatternID = ?", [patternId]);
        if (patterns.length === 0) return res.status(404).json({ error: "Pattern not found." });
        const originalBorrower = patterns[0].BorrowedBy;

        await db.query("UPDATE Patterns SET Status = 'Available', BorrowedBy = NULL, ShiftCheckout = NULL, CheckoutTime = NULL, LockExpiresAt = NULL WHERE PatternID = ?", [patternId]);
        if (originalBorrower) {
            await db.query("UPDATE Borrowers SET ActiveCheckoutCount = GREATEST(ActiveCheckoutCount - 1, 0) WHERE BorrowerID = ?", [originalBorrower]);
        }
        res.json({ message: "Return Accepted." });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Check specific ticket status (Used by frontend bottom bar)
app.get('/api/requests/status', async (req, res) => {
    const { borrowerId, patternId } = req.query;
    try {
        const [rows] = await db.query("SELECT RequestStatus FROM PendingRequests WHERE BorrowerID = ? AND PatternID = ? ORDER BY RequestTime DESC LIMIT 1", [borrowerId, patternId]);
        res.json(rows[0] || { RequestStatus: 'None' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CMS PLUS CORE LIVE ON PORT ${PORT}`));