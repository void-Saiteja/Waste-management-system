const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./waste_management.db');
const fs = require('fs');
db.all("PRAGMA table_info(targets)", (err, rows) => {
    if (err) fs.writeFileSync('schema_info.txt', err.message);
    else fs.writeFileSync('schema_info.txt', JSON.stringify(rows, null, 2));
    db.close();
});

