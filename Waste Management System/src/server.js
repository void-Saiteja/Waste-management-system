const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = 3005;

// ── Database ────────────────────────────────────────────────
const db = new sqlite3.Database(path.join(__dirname, '..', 'waste_management.db'));

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'staff'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS bins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        location TEXT NOT NULL,
        capacity REAL NOT NULL DEFAULT 100,
        current_fill REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Good',
        last_cleaned DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS waste_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bin_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        waste_type TEXT NOT NULL,
        quantity REAL NOT NULL,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(bin_id) REFERENCES bins(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bin_id INTEGER NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Active',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(bin_id) REFERENCES bins(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS targets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        target_qty REAL NOT NULL,
        target_date DATE DEFAULT CURRENT_DATE,
        status TEXT DEFAULT 'Pending',
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Seed admin
    db.get("SELECT id FROM users WHERE username = 'admin'", (err, row) => {
        if (!row) {
            const h = bcrypt.hashSync('admin123', 10);
            db.run("INSERT INTO users (username, password, role) VALUES ('admin', ?, 'admin')", [h]);
            console.log('✅ Admin created  →  admin / admin123');
        }
    });

    // Seed bins
    db.get("SELECT COUNT(*) as c FROM bins", (err, row) => {
        if (row && row.c === 0) {
            const bins = [
                ['Bin-A1', 'Main Gate', 100],
                ['Bin-B2', 'Cafeteria', 200],
                ['Bin-C3', 'Library Block', 150],
                ['Bin-D4', 'Sports Complex', 120],
                ['Bin-E5', 'Admin Block', 80]
            ];
            bins.forEach(b => db.run("INSERT INTO bins (name,location,capacity) VALUES (?,?,?)", b));
            console.log('✅ Default bins created');
        }
    });
});

// ── Middleware ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(session({
    secret: 'ecotrack-secret-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3 * 3600 * 1000 } // 3 hours
}));

// ── Auth Guards ──────────────────────────────────────────────
const isAuth = (req, res, next) => req.session.userId ? next() : res.status(401).json({ error: 'Unauthorized' });
const isAdmin = (req, res, next) => req.session.role === 'admin' ? next() : res.status(403).json({ error: 'Forbidden' });

// ── Auth ─────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });

    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Invalid credentials' });
        if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.role = user.role;
        res.json({ success: true, role: user.role, username: user.username });
    });
});

app.post('/api/register', (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
    const safeRole = role === 'admin' ? 'admin' : 'staff';
    const hash = bcrypt.hashSync(password, 10);
    db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, hash, safeRole], function (err) {
        if (err) return res.status(400).json({ error: 'Username already taken' });
        res.json({ success: true });
    });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/session', (req, res) => {
    if (req.session.userId) {
        res.json({ loggedIn: true, user: { username: req.session.username, role: req.session.role, id: req.session.userId } });
    } else {
        res.json({ loggedIn: false });
    }
});

// ── Bins ─────────────────────────────────────────────────────
app.get('/api/bins', isAuth, (req, res) => {
    db.all('SELECT * FROM bins ORDER BY name', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/bins', isAdmin, (req, res) => {
    const { name, location, capacity } = req.body;
    if (!name || !location || !capacity) return res.status(400).json({ error: 'Missing fields' });
    db.run('INSERT INTO bins (name, location, capacity) VALUES (?, ?, ?)', [name, location, parseFloat(capacity)], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

app.delete('/api/bins/:id', isAdmin, (req, res) => {
    db.run('DELETE FROM bins WHERE id = ?', [req.params.id], err => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/bins/:id/clean', isAuth, (req, res) => {
    db.run('UPDATE bins SET current_fill = 0, status = "Good", last_cleaned = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id], err => {
        if (err) return res.status(500).json({ error: err.message });
        db.run('UPDATE alerts SET status = "Resolved" WHERE bin_id = ? AND status = "Active"', [req.params.id]);
        res.json({ success: true });
    });
});

// ── Waste Logs ───────────────────────────────────────────────
app.post('/api/logs', isAuth, (req, res) => {
    const { bin_id, waste_type, quantity } = req.body;
    const userId = req.session.userId;
    if (!bin_id || !waste_type || !quantity) return res.status(400).json({ error: 'Missing fields' });
    const qty = parseFloat(quantity);

    db.serialize(() => {
        db.run('INSERT INTO waste_logs (bin_id, user_id, waste_type, quantity) VALUES (?, ?, ?, ?)',
            [bin_id, userId, waste_type, qty]);

        db.get('SELECT * FROM bins WHERE id = ?', [bin_id], (err, bin) => {
            if (!bin) return;
            const newFill = Math.min(bin.current_fill + qty, bin.capacity);
            const pct = (newFill / bin.capacity) * 100;
            let status = pct >= 95 ? 'Critical' : pct >= 80 ? 'Full' : pct >= 50 ? 'Medium' : 'Good';
            db.run('UPDATE bins SET current_fill = ?, status = ? WHERE id = ?', [newFill, status, bin_id]);

            if (pct >= 80) {
                const msg = `${bin.name} is ${pct.toFixed(0)}% full — needs attention!`;
                db.get('SELECT id FROM alerts WHERE bin_id = ? AND status = "Active"', [bin_id], (err, existing) => {
                    if (!existing) db.run('INSERT INTO alerts (bin_id, message) VALUES (?, ?)', [bin_id, msg]);
                });
            }

            // Check & update target
            db.get('SELECT * FROM targets WHERE user_id = ? AND target_date = date("now")', [userId], (err, target) => {
                if (target) {
                    db.get('SELECT COALESCE(SUM(quantity),0) as total FROM waste_logs WHERE user_id = ? AND date(date) = date("now")',
                        [userId], (err, row) => {
                            if (row && row.total >= target.target_qty) {
                                db.run('UPDATE targets SET status = "Achieved" WHERE user_id = ? AND target_date = date("now")', [userId]);
                            }
                        });
                }
            });
        });
    });
    res.json({ success: true });
});

app.get('/api/logs', isAuth, (req, res) => {
    const query = `
        SELECT wl.*, b.name as bin_name, u.username as staff_name 
        FROM waste_logs wl
        JOIN bins b ON wl.bin_id = b.id
        JOIN users u ON wl.user_id = u.id
        ORDER BY wl.date DESC LIMIT 20
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ── Alerts ───────────────────────────────────────────────────
app.get('/api/alerts', isAuth, (req, res) => {
    db.all(`SELECT a.*, b.name as bin_name FROM alerts a
            JOIN bins b ON a.bin_id = b.id
            WHERE a.status = 'Active' ORDER BY a.timestamp DESC`, [], (err, rows) => {
        res.json(rows || []);
    });
});

app.post('/api/alerts/:id/resolve', isAdmin, (req, res) => {
    db.run('UPDATE alerts SET status = "Resolved" WHERE id = ?', [req.params.id], err => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ── Dashboard Stats ──────────────────────────────────────────
app.get('/api/dashboard/stats', isAuth, (req, res) => {
    const stats = {};
    db.get('SELECT COUNT(*) as total FROM bins', (err, r) => {
        stats.totalBins = r ? r.total : 0;
        db.get('SELECT COUNT(*) as full FROM bins WHERE status IN ("Full","Critical")', (err, r) => {
            stats.fullBins = r ? r.full : 0;
            db.get('SELECT COALESCE(ROUND(SUM(quantity),1),0) as today FROM waste_logs WHERE date(date) = date("now")', (err, r) => {
                stats.wasteToday = r ? r.today : 0;
                db.get('SELECT COUNT(*) as active FROM alerts WHERE status = "Active"', (err, r) => {
                    stats.activeAlerts = r ? r.active : 0;
                    db.get(`SELECT COUNT(*) as achieved FROM targets WHERE target_date = date("now") AND status = "Achieved"`, (err, r) => {
                        stats.targetsAchieved = r ? r.achieved : 0;
                        res.json(stats);
                    });
                });
            });
        });
    });
});

// ── Analytics ────────────────────────────────────────────────
app.get('/api/analytics/categories', isAuth, (req, res) => {
    db.all('SELECT waste_type, ROUND(SUM(quantity),1) as total FROM waste_logs GROUP BY waste_type', [], (err, rows) => {
        res.json(rows || []);
    });
});

app.get('/api/analytics/trends', isAuth, (req, res) => {
    db.all(`SELECT date(date) as day, ROUND(SUM(quantity),1) as total 
            FROM waste_logs GROUP BY day ORDER BY day DESC LIMIT 7`, [], (err, rows) => {
        res.json((rows || []).reverse());
    });
});

// ── Admin ────────────────────────────────────────────────────
app.get('/api/admin/users', isAdmin, (req, res) => {
    db.all('SELECT id, username, role FROM users ORDER BY role, username', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.delete('/api/admin/users/:id', isAdmin, (req, res) => {
    db.run('DELETE FROM users WHERE id = ? AND role != "admin"', [req.params.id], err => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/admin/create-staff', isAdmin, (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
    const hash = bcrypt.hashSync(password, 10);
    db.run('INSERT INTO users (username, password, role) VALUES (?, ?, "staff")', [username, hash], function (err) {
        if (err) return res.status(400).json({ error: 'Username already taken' });
        res.json({ success: true, id: this.lastID });
    });
});

app.get('/api/admin/staff-stats', isAdmin, (req, res) => {
    const query = `
        SELECT u.id, u.username,
            ROUND(COALESCE(SUM(l.quantity), 0), 1) as total_qty,
            COUNT(l.id) as log_count,
            t.target_qty,
            t.status as target_status
        FROM users u
        LEFT JOIN waste_logs l ON u.id = l.user_id AND date(l.date) = date('now')
        LEFT JOIN targets t ON u.id = t.user_id AND t.target_date = date('now')
        WHERE u.role = 'staff'
        GROUP BY u.id
        ORDER BY total_qty DESC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/targets', isAdmin, (req, res) => {
    let { user_id, target_qty } = req.body;
    if (!user_id || target_qty === undefined) return res.status(400).json({ error: 'Missing fields' });
    user_id = parseInt(user_id);
    target_qty = parseFloat(target_qty);

    db.run('DELETE FROM targets WHERE user_id = ? AND target_date = date("now")', [user_id], err => {
        if (err) return res.status(500).json({ error: err.message });
        db.run('INSERT INTO targets (user_id, target_qty, target_date) VALUES (?, ?, date("now"))',
            [user_id, target_qty], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            });
    });
});

app.post('/api/admin/reset-bins', isAdmin, (req, res) => {
    db.run('UPDATE bins SET current_fill = 0, status = "Good"', err => {
        if (err) return res.status(500).json({ error: err.message });
        db.run('UPDATE alerts SET status = "Resolved"');
        res.json({ success: true });
    });
});

// ── Staff ────────────────────────────────────────────────────
app.get('/api/staff/my-target', isAuth, (req, res) => {
    const userId = req.session.userId;
    db.get(`SELECT t.target_qty, ROUND(COALESCE(SUM(l.quantity),0),1) as current_qty
            FROM targets t
            LEFT JOIN waste_logs l ON t.user_id = l.user_id AND date(l.date) = t.target_date
            WHERE t.user_id = ? AND t.target_date = date('now')`, [userId], (err, row) => {
        res.json(row || { target_qty: 0, current_qty: 0 });
    });
});

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`🌿 EcoTrack running → http://localhost:${PORT}`));
process.on('uncaughtException', err => console.error('Uncaught:', err));
