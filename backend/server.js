const express = require('express');
const mysql = require('mysql2/promise'); // Upgraded to promise-based for cleaner transaction logic
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Upgraded Database Pool (Handles multiple simultaneous connections better)
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
    .then(() => console.log('SUCCESS: Connected to Aiven Overwatch Database'))
    .catch(err => console.error('Database Connection Error:', err));

// ==========================================
// 1. DYNAMIC CONFIGURATION (System Settings)
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
        res.json({ message: "Setting added" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 2. THE GRAVEYARD PROTOCOL (Audit Logs)
// ==========================================
app.get('/api/auditlog', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM AuditLog ORDER BY DeletedAt DESC LIMIT 100");
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 3. ASSET & BORROWER CRUD
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
    const { id, name, brand, style, size, rackL, rackP, loc, imgUrl } = req.body;
    try {
        await db.query("INSERT INTO Patterns (PatternID, PatternName, Brand, StyleNumber, SizeCategory, RackLetter, RackPosition, Location, ImageUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", 
        [id, name, brand, style, size, rackL, rackP, loc, imgUrl]);
        res.json({ message: "Pattern Registered" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/borrowers/register', async (req, res) => {
    const { id, name, dept, role, contact, imgUrl } = req.body;
    try {
        await db.query("INSERT INTO Borrowers (BorrowerID, FullName, Department, Role, ContactNumber, ImageUrl) VALUES (?, ?, ?, ?, ?, ?)", 
        [id, name, dept, role, contact, imgUrl]);
        res.json({ message: "Borrower Registered" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Supervisor assigning a shift
app.put('/api/borrowers/:id/shift', async (req, res) => {
    try {
        await db.query("UPDATE Borrowers SET DesignatedShift = ? WHERE BorrowerID = ?", [req.body.shift, req.params.id]);
        res.json({ message: "Shift Updated" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETION WITH AUDIT LOG INTERCEPT
app.delete('/api/patterns/:id', async (req, res) => {
    try {
        const [pattern] = await db.query("SELECT * FROM Patterns WHERE PatternID = ?", [req.params.id]);
        if (pattern.length > 0) {
            await db.query("INSERT INTO AuditLog (ActionType, DeletedData) VALUES ('DELETED_PATTERN', ?)", [JSON.stringify(pattern[0])]);
            await db.query("DELETE FROM Patterns WHERE PatternID = ?", [req.params.id]);
        }
        res.json({ message: "Pattern Deleted and Logged" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/borrowers/:id', async (req, res) => {
    try {
        const [borrower] = await db.query("SELECT * FROM Borrowers WHERE BorrowerID = ?", [req.params.id]);
        if (borrower.length > 0) {
            await db.query("INSERT INTO AuditLog (ActionType, DeletedData) VALUES ('DELETED_BORROWER', ?)", [JSON.stringify(borrower[0])]);
            await db.query("DELETE FROM Borrowers WHERE BorrowerID = ?", [req.params.id]);
        }
        res.json({ message: "Borrower Deleted and Logged" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 4. OVERWATCH RULE ENGINE (Borrow / Return)
// ==========================================
// Search Helpers
app.get('/api/patterns/autocomplete/:query', async (req, res) => {
    try {
        const term = `%${req.params.query}%`;
        const [rows] = await db.query("SELECT PatternID, PatternName, ImageUrl FROM Patterns WHERE PatternID LIKE ? OR PatternName LIKE ? LIMIT 5", [term, term]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

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

// THE STRICT BORROW PROTOCOL
app.post('/api/patterns/borrow', async (req, res) => {
    const { patternId, borrowerId, requestedShift } = req.body;
    
    try {
        // Step 1: Fetch Borrower Data
        const [borrowers] = await db.query("SELECT DesignatedShift, ActiveCheckoutCount FROM Borrowers WHERE BorrowerID = ?", [borrowerId]);
        if (borrowers.length === 0) return res.status(404).json({ error: "Borrower not found." });
        
        const b = borrowers[0];

        // OVERWATCH RULE 1: Purgatory Block
        if (b.DesignatedShift === 'UNASSIGNED') {
            return res.status(403).json({ error: "BLOCKED: You are unassigned. See a Supervisor." });
        }

        // OVERWATCH RULE 2: Shift Enforcement
        if (b.DesignatedShift !== requestedShift) {
            return res.status(403).json({ error: `BLOCKED: You are assigned to ${b.DesignatedShift}, not ${requestedShift}.` });
        }

        // OVERWATCH RULE 3: One-Asset Limit
        if (b.ActiveCheckoutCount >= 1) {
            return res.status(403).json({ error: "BLOCKED: You are already holding an active pattern. Return it first." });
        }

        // If all rules pass, execute the checkout
        await db.query("UPDATE Patterns SET Status = 'Borrowed', BorrowedBy = ?, DueDate = ? WHERE PatternID = ?", [borrowerId, requestedShift, patternId]);
        await db.query("UPDATE Borrowers SET ActiveCheckoutCount = ActiveCheckoutCount + 1 WHERE BorrowerID = ?", [borrowerId]);
        
        res.json({ message: "Checkout Approved by Overwatch." });

    } catch (err) { res.status(500).json({ error: err.message }); }
});

// THE RETURN PROTOCOL
app.post('/api/patterns/return', async (req, res) => {
    const { patternId, returningBorrowerId } = req.body;
    
    try {
        // Step 1: Find out who originally borrowed it
        const [patterns] = await db.query("SELECT BorrowedBy FROM Patterns WHERE PatternID = ?", [patternId]);
        if (patterns.length === 0) return res.status(404).json({ error: "Pattern not found." });
        
        const originalBorrower = patterns[0].BorrowedBy;

        // Step 2: Clear Pattern
        await db.query("UPDATE Patterns SET Status = 'Available', BorrowedBy = NULL, DueDate = NULL WHERE PatternID = ?", [patternId]);
        
        // Step 3: Decrement the ActiveCheckoutCount for the original borrower (Freeing them up to borrow again)
        if (originalBorrower) {
            await db.query("UPDATE Borrowers SET ActiveCheckoutCount = GREATEST(ActiveCheckoutCount - 1, 0) WHERE BorrowerID = ?", [originalBorrower]);
        }
        
        res.json({ message: "Return Accepted." });

    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`OVERWATCH SERVER LIVE ON PORT ${PORT}`));