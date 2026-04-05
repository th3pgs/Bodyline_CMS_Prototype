const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: { rejectUnauthorized: false },
    multipleStatements: true
});

db.connect((err) => {
    if (err) return console.error('Database Connection Error:', err);
    console.log('SUCCESS: Connected to Aiven MySQL');
});

// GET ALL
app.get('/api/patterns', (req, res) => {
    db.query("SELECT * FROM Patterns", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});
app.get('/api/employees', (req, res) => {
    db.query("SELECT * FROM Employees", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// SEARCH & EXACT
app.get('/api/patterns/autocomplete/:query', (req, res) => {
    const term = `%${req.params.query}%`;
    db.query("SELECT PatternID, PatternName, ImageUrl FROM Patterns WHERE PatternID LIKE ? OR PatternName LIKE ? LIMIT 5", [term, term], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});
app.get('/api/patterns/exact/:id', (req, res) => {
    db.query("SELECT * FROM Patterns WHERE PatternID = ?", [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results[0]);
    });
});
app.get('/api/employees/:id', (req, res) => {
    db.query("SELECT * FROM Employees WHERE EmployeeID = ?", [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(404).json({ message: "Not found" });
        res.json(results[0]);
    });
});

// LOGIC TRANSACTIONS
app.post('/api/patterns/borrow', (req, res) => {
    const { patternId, employeeId, shiftStr } = req.body;
    db.query("UPDATE Patterns SET Status = 'Borrowed', BorrowedBy = ?, DueDate = ? WHERE PatternID = ?", [employeeId, shiftStr, patternId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Pattern checked out" });
    });
});
app.post('/api/patterns/return', (req, res) => {
    db.query("UPDATE Patterns SET Status = 'Available', BorrowedBy = NULL, DueDate = NULL WHERE PatternID = ?", [req.body.patternId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Pattern returned" });
    });
});

// NEW EXPANDED REGISTRATION
app.post('/api/patterns/register', (req, res) => {
    const { id, name, location, imgUrl, size, style } = req.body;
    const finalImg = imgUrl || 'https://placehold.co/400x400/e2e8f0/475569?text=No+Pattern+Image';
    const sql = "INSERT INTO Patterns (PatternID, PatternName, Location, Status, ImageUrl, SizeCategory, StyleNumber) VALUES (?, ?, ?, 'Available', ?, ?, ?)";
    db.query(sql, [id, name, location, finalImg, size, style], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Registered" });
    });
});

app.post('/api/employees/register', (req, res) => {
    const { id, name, role, imgUrl, dept, contact } = req.body;
    const finalImg = imgUrl || 'https://placehold.co/400x400/bfdbfe/1e3a8a?text=No+Face+Scan';
    const sql = "INSERT INTO Employees (EmployeeID, FullName, Role, ImageUrl, Department, ContactNumber) VALUES (?, ?, ?, ?, ?, ?)";
    db.query(sql, [id, name, role, finalImg, dept, contact], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Registered" });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SERVER LIVE ON PORT ${PORT}`));