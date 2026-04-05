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
    multipleStatements: true
});

db.connect((err) => {
    if (err) return console.error('Database Connection Error:', err);
    console.log('SUCCESS: Connected to MySQL');
    
    const initSQL = `
        CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME};
        USE ${process.env.DB_NAME};
        CREATE TABLE IF NOT EXISTS Employees (EmployeeID VARCHAR(20) PRIMARY KEY, FullName VARCHAR(100), Role VARCHAR(50));
        CREATE TABLE IF NOT EXISTS Patterns (PatternID VARCHAR(50) PRIMARY KEY, PatternName VARCHAR(100), Location VARCHAR(50), Status VARCHAR(20) DEFAULT 'Available', BorrowedBy VARCHAR(20), DueDate VARCHAR(100));
        INSERT IGNORE INTO Employees (EmployeeID, FullName, Role) VALUES 
        ('EMP-090', 'P.G.S.S. Priyantha', 'Block Handler'), ('EMP-018', 'M.J.M. Ashfaq', 'Cutting Supervisor'), ('EMP-095', 'M.H. Rushan', 'Machine Operator'), ('EMP-117', 'J.R. Hetti', 'QC');
        INSERT IGNORE INTO Patterns (PatternID, PatternName, Location, Status) VALUES 
        ('VS7BXS', 'Victorias Secret 7B XS Mold', 'Rack A-12', 'Available'), ('LV-99X', 'Louis Vuitton Active Pattern', 'Rack C-01', 'Available'), ('NKE-M', 'Nike Pro Compression Top M', 'Rack B-05', 'Available'), ('LULU-L', 'Lululemon Align Legging L', 'Rack A-02', 'Available');
    `;
    db.query(initSQL, (err) => {
        if(err) console.log("Init error:", err.message);
        else console.log("Database & Test Data Ready!");
    });
});

// NEW ROUTE: Get ALL Patterns for Simulator
app.get('/api/patterns', (req, res) => {
    db.query("SELECT PatternID, PatternName FROM Patterns", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// NEW ROUTE: Get ALL Employees for Simulator
app.get('/api/employees', (req, res) => {
    db.query("SELECT EmployeeID, FullName, Role FROM Employees", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.get('/api/patterns/autocomplete/:query', (req, res) => {
    const term = `%${req.params.query}%`;
    db.query("SELECT PatternID, PatternName FROM Patterns WHERE PatternID LIKE ? OR PatternName LIKE ? LIMIT 5", [term, term], (err, results) => {
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

app.post('/api/patterns/borrow', (req, res) => {
    const { patternId, employeeId, shiftStr } = req.body;
    db.query("UPDATE Patterns SET Status = 'Borrowed', BorrowedBy = ?, DueDate = ? WHERE PatternID = ?", [employeeId, shiftStr, patternId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Pattern checked out" });
    });
});

app.post('/api/patterns/return', (req, res) => {
    const { patternId, returningEmployeeId, isDelegate } = req.body;
    db.query("UPDATE Patterns SET Status = 'Available', BorrowedBy = NULL, DueDate = NULL WHERE PatternID = ?", [patternId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Pattern returned" });
    });
});

app.post('/api/patterns/register', (req, res) => {
    db.query("INSERT INTO Patterns (PatternID, PatternName, Location, Status) VALUES (?, ?, ?, 'Available')", [req.body.id, req.body.name, req.body.location], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Registered" });
    });
});

app.post('/api/employees/register', (req, res) => {
    db.query("INSERT INTO Employees (EmployeeID, FullName, Role) VALUES (?, ?, ?)", [req.body.id, req.body.name, req.body.role], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Registered" });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SERVER LIVE ON PORT ${PORT}`));