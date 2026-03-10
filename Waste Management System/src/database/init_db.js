const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, 'waste_management.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Users Table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT CHECK(role IN ('admin', 'staff'))
    )`);

    // Bins Table
    db.run(`CREATE TABLE IF NOT EXISTS bins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        location TEXT,
        capacity REAL,
        current_fill REAL DEFAULT 0,
        status TEXT DEFAULT 'Good'
    )`);

    // Waste Logs Table
    db.run(`CREATE TABLE IF NOT EXISTS waste_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bin_id INTEGER,
        user_id INTEGER,
        waste_type TEXT,
        quantity REAL,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(bin_id) REFERENCES bins(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Alerts Table
    db.run(`CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bin_id INTEGER,
        message TEXT,
        status TEXT DEFAULT 'Active',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(bin_id) REFERENCES bins(id)
    )`);

    // Targets Table
    db.run(`CREATE TABLE IF NOT EXISTS targets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        target_qty REAL,
        target_date DATE DEFAULT (date('now')),
        status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending', 'Achieved')),
        UNIQUE(user_id, target_date),
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);



    // Insert Default admin if not exists
    const adminPass = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES ('admin', ?, 'admin')`, [adminPass]);

    // Insert Default staff
    const staffPass = bcrypt.hashSync('staff123', 10);
    db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES ('staff1', ?, 'staff')`, [staffPass]);

    // Insert Initial Bins
    db.run(`INSERT OR IGNORE INTO bins (name, location, capacity) VALUES ('Bin-A1', 'Main Gate', 100)`);
    db.run(`INSERT OR IGNORE INTO bins (name, location, capacity) VALUES ('Bin-B2', 'Cafeteria', 150)`);
    db.run(`INSERT OR IGNORE INTO bins (name, location, capacity) VALUES ('Bin-C3', 'Library', 80)`);
});

console.log('Database initialized successfully.');
db.close();
