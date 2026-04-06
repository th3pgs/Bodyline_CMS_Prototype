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
// 1. SYSTEM PARAMETERS (Admin Configuration)
// ==========================================
app.get('/api/settings', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM SystemSettings ORDER BY Category, SettingValue");
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/settings', async (req, res) => {
    try {
        await db.query("INSERT INTO SystemSettings (Category, SettingValue, PrefixData) VALUES (?, ?, ?)", 
        [req.body.category, req.body.value, req.body.prefix || null]);
        
        // Audit Log for System Change
        await db.query("INSERT INTO AuditLog (LogCategory, ActionType, LogData) VALUES ('System', 'ADDED_PARAMETER', ?)", 
        [`Added ${req.body.category}: ${req.body.value}`]);
        
        res.json({ message: "Setting added" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/settings/:id', async (req, res) => {
    try {
        await db.query("DELETE FROM SystemSettings WHERE SettingID = ?", [req.params.id]);
        res.json({ message: "Setting deleted" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 2. INFO CENTER (Audit Logs)
// ==========================================
app.get('/api/auditlog', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM AuditLog ORDER BY CreatedAt DESC LIMIT 200");
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 3. ASSET & BORROWER REGISTRATION
// ==========================================
app.get('/api/patterns', async (req, res) => {
    try {
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
        await db.query("INSERT INTO Patterns (PatternID, PatternName, Brand, StyleNumber, SizeCategory, RackLocation, ImageUrl) VALUES (?, ?, ?, ?, ?, ?, ?)", 
        [id, name, brand, style, size, loc, imgUrl]);
        
        await db.query("INSERT INTO AuditLog (LogCategory, ActionType, LogData) VALUES ('Register', 'NEW_ASSET', ?)", [id]);
        res.json({ message: "Pattern Registered" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/borrowers/register', async (req, res) => {
    const { id, name, role, imgUrl } = req.body;
    try {
        await db.query("INSERT INTO Borrowers (BorrowerID, FullName, Role, ImageUrl) VALUES (?, ?, ?, ?)", 
        [id, name, role, imgUrl]);
        
        await db.query("INSERT INTO AuditLog (LogCategory, ActionType, LogData) VALUES ('Register', 'NEW_BORROWER', ?)", [id]);
        res.json({ message: "Borrower Registered" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETIONS (Intercepted by Graveyard)
app.delete('/api/patterns/:id', async (req, res) => {
    try {
        const [pattern] = await db.query("SELECT * FROM Patterns WHERE PatternID = ?", [req.params.id]);
        if (pattern.length > 0) {
            await db.query("INSERT INTO AuditLog (LogCategory, ActionType, LogData) VALUES ('Delete', 'DELETED_ASSET', ?)", [JSON.stringify(pattern[0])]);
            await db.query("DELETE FROM Patterns WHERE PatternID = ?", [req.params.id]);
        }
        res.json({ message: "Asset Deleted" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/borrowers/:id', async (req, res) => {
    try {
        const [borrower] = await db.query("SELECT * FROM Borrowers WHERE BorrowerID = ?", [req.params.id]);
        if (borrower.length > 0) {
            await db.query("INSERT INTO AuditLog (LogCategory, ActionType, LogData) VALUES ('Delete', 'DELETED_BORROWER', ?)", [JSON.stringify(borrower[0])]);
            await db.query("DELETE FROM Borrowers WHERE BorrowerID = ?", [req.params.id]);
        }
        res.json({ message: "Borrower Deleted" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 4. SUPERVISOR COMMANDS (Shifts & Queues)
// ==========================================
app.get('/api/requests', async (req, res) => {
    try {
        // Fetch pending requests and join with borrower info for the UI
        const [rows] = await db.query(`
            SELECT p.RequestID, p.PatternID, p.RequestedShift, p.RequestTime, b.BorrowerID, b.FullName, b.Role, b.ImageUrl 
            FROM PendingRequests p 
            JOIN Borrowers b ON p.BorrowerID = b.BorrowerID 
            WHERE p.RequestStatus = 'Pending' ORDER BY p.RequestTime ASC
        `);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/borrowers/:id/shift', async (req, res) => {
    try {
        await db.query("UPDATE Borrowers SET DesignatedShift = ? WHERE BorrowerID = ?", [req.body.shift, req.params.id]);
        // Also auto-approve any pending requests for this user if the shift matches
        await db.query("UPDATE PendingRequests SET RequestStatus = 'Approved' WHERE BorrowerID = ? AND RequestedShift = ? AND RequestStatus = 'Pending'", [req.params.id, req.body.shift]);
        res.json({ message: "Shift Updated" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/requests/decline', async (req, res) => {
    try {
        await db.query("UPDATE PendingRequests SET RequestStatus = 'Declined' WHERE RequestID = ?", [req.body.requestId]);
        res.json({ message: "Request Declined" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 5. CMS PLUS: DIGITAL PATTERN ROOM ENGINE
// ==========================================
// Search specific pattern
app.get('/api/patterns/exact/:id', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM Patterns WHERE PatternID = ?", [req.params.id]);
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/borrowers/:id', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM Borrowers WHERE BorrowerID = ?", [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ message: "Not found" });
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// THE CMS PLUS CHECKOUT PROTOCOL
app.post('/api/patterns/borrow', async (req, res) => {
    const { patternId, borrowerId, requestedShift } = req.body;
    
    try {
        const [borrowers] = await db.query("SELECT DesignatedShift, ActiveCheckoutCount FROM Borrowers WHERE BorrowerID = ?", [borrowerId]);
        if (borrowers.length === 0) return res.status(404).json({ error: "Borrower not found." });
        const b = borrowers[0];

        // RULE 1: The Purgatory Ticket
        if (b.DesignatedShift === 'UNASSIGNED') {
            // Check if they already have a pending ticket to prevent spam
            const [existing] = await db.query("SELECT RequestID FROM PendingRequests WHERE BorrowerID = ? AND PatternID = ? AND RequestStatus = 'Pending'", [borrowerId, patternId]);
            if (existing.length === 0) {
                await db.query("INSERT INTO PendingRequests (BorrowerID, PatternID, RequestedShift) VALUES (?, ?, ?)", [borrowerId, patternId, requestedShift]);
            }
            return res.status(403).json({ 
                type: "PENDING", 
                error: "Access Restricted. You are UNASSIGNED. A clearance request has been sent to the Supervisor Command Dashboard." 
            });
        }

        // RULE 2: Shift Enforcement
        if (b.DesignatedShift !== requestedShift) {
            return res.status(403).json({ type: "DENIED", error: `Shift Violation: You are authorized for ${b.DesignatedShift}, not ${requestedShift}.` });
        }

        // RULE 3: Concurrency Limit
        if (b.ActiveCheckoutCount >= 1) {
            return res.status(403).json({ type: "DENIED", error: "Concurrency Limit Reached: You must return your active asset before checking out another." });
        }

        // APPROVAL: Execute Checkout & Stamp Time
        await db.query("UPDATE Patterns SET Status = 'Borrowed', BorrowedBy = ?, ShiftCheckout = ?, CheckoutTime = NOW() WHERE PatternID = ?", [borrowerId, requestedShift, patternId]);
        await db.query("UPDATE Borrowers SET ActiveCheckoutCount = ActiveCheckoutCount + 1 WHERE BorrowerID = ?", [borrowerId]);
        
        res.json({ message: "Checkout Approved." });

    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// THE MASTER LEDGER: EDIT PROTOCOLS
// ==========================================
app.put('/api/patterns/:id', async (req, res) => {
    const { name, brand, style, size, loc, imgUrl } = req.body;
    try {
        await db.query("UPDATE Patterns SET PatternName=?, Brand=?, StyleNumber=?, SizeCategory=?, RackLocation=?, ImageUrl=? WHERE PatternID=?", 
        [name, brand, style, size, loc, imgUrl, req.params.id]);
        
        await db.query("INSERT INTO AuditLog (LogCategory, ActionType, LogData) VALUES ('System', 'EDIT_ASSET', ?)", [req.params.id]);
        res.json({ message: "Asset Updated" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/borrowers/:id', async (req, res) => {
    const { name, role, imgUrl } = req.body;
    try {
        await db.query("UPDATE Borrowers SET FullName=?, Role=?, ImageUrl=? WHERE BorrowerID=?", 
        [name, role, imgUrl, req.params.id]);
        
        await db.query("INSERT INTO AuditLog (LogCategory, ActionType, LogData) VALUES ('System', 'EDIT_BORROWER', ?)", [req.params.id]);
        res.json({ message: "Borrower Updated" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// THE CMS PLUS RETURN PROTOCOL
app.post('/api/patterns/return', async (req, res) => {
    const { patternId } = req.body;
    try {
        const [patterns] = await db.query("SELECT BorrowedBy FROM Patterns WHERE PatternID = ?", [patternId]);
        if (patterns.length === 0) return res.status(404).json({ error: "Pattern not found." });
        
        const originalBorrower = patterns[0].BorrowedBy;

        await db.query("UPDATE Patterns SET Status = 'Available', BorrowedBy = NULL, ShiftCheckout = NULL, CheckoutTime = NULL WHERE PatternID = ?", [patternId]);
        
        if (originalBorrower) {
            await db.query("UPDATE Borrowers SET ActiveCheckoutCount = GREATEST(ActiveCheckoutCount - 1, 0) WHERE BorrowerID = ?", [originalBorrower]);
        }
        res.json({ message: "Return Accepted." });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CMS PLUS CORE LIVE ON PORT ${PORT}`));