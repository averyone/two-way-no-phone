const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../data/app.db');
let db;

function getDatabase() {
  if (!db) {
    // Ensure data directory exists
    const fs = require('fs');
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

function initializeDatabase() {
  const database = getDatabase();

  // Create users table
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      google_id TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      codename TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create call_logs table for tracking calls
  database.exec(`
    CREATE TABLE IF NOT EXISTS call_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      caller_id INTEGER NOT NULL,
      callee_id INTEGER NOT NULL,
      twilio_conference_sid TEXT,
      status TEXT DEFAULT 'initiated',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      FOREIGN KEY (caller_id) REFERENCES users(id),
      FOREIGN KEY (callee_id) REFERENCES users(id)
    )
  `);

  console.log('Database initialized successfully');
}

// User operations
function createUser({ googleId, email, firstName, lastName, phoneNumber, codename }) {
  const database = getDatabase();
  const stmt = database.prepare(`
    INSERT INTO users (google_id, email, first_name, last_name, phone_number, codename)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(googleId, email, firstName, lastName, phoneNumber, codename);
  return result.lastInsertRowid;
}

function getUserByGoogleId(googleId) {
  const database = getDatabase();
  const stmt = database.prepare('SELECT * FROM users WHERE google_id = ?');
  return stmt.get(googleId);
}

function getUserById(id) {
  const database = getDatabase();
  const stmt = database.prepare('SELECT * FROM users WHERE id = ?');
  return stmt.get(id);
}

function getUserByEmail(email) {
  const database = getDatabase();
  const stmt = database.prepare('SELECT * FROM users WHERE email = ?');
  return stmt.get(email);
}

function getUserByCodename(codename) {
  const database = getDatabase();
  const stmt = database.prepare('SELECT * FROM users WHERE codename = ?');
  return stmt.get(codename);
}

function getAllUsersExcept(userId) {
  const database = getDatabase();
  const stmt = database.prepare('SELECT id, codename FROM users WHERE id != ?');
  return stmt.all(userId);
}

function updateUser(id, { phoneNumber, codename }) {
  const database = getDatabase();
  const stmt = database.prepare(`
    UPDATE users
    SET phone_number = ?, codename = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  return stmt.run(phoneNumber, codename, id);
}

function isCodenameAvailable(codename, excludeUserId = null) {
  const database = getDatabase();
  let stmt;
  if (excludeUserId) {
    stmt = database.prepare('SELECT id FROM users WHERE codename = ? AND id != ?');
    return !stmt.get(codename, excludeUserId);
  } else {
    stmt = database.prepare('SELECT id FROM users WHERE codename = ?');
    return !stmt.get(codename);
  }
}

// Call log operations
function createCallLog(callerId, calleeId) {
  const database = getDatabase();
  const stmt = database.prepare(`
    INSERT INTO call_logs (caller_id, callee_id)
    VALUES (?, ?)
  `);
  const result = stmt.run(callerId, calleeId);
  return result.lastInsertRowid;
}

function updateCallLog(id, { twilioConferenceSid, status, endedAt }) {
  const database = getDatabase();
  const updates = [];
  const values = [];

  if (twilioConferenceSid !== undefined) {
    updates.push('twilio_conference_sid = ?');
    values.push(twilioConferenceSid);
  }
  if (status !== undefined) {
    updates.push('status = ?');
    values.push(status);
  }
  if (endedAt !== undefined) {
    updates.push('ended_at = ?');
    values.push(endedAt);
  }

  if (updates.length === 0) return null;

  values.push(id);
  const stmt = database.prepare(`UPDATE call_logs SET ${updates.join(', ')} WHERE id = ?`);
  return stmt.run(...values);
}

function getCallLogById(id) {
  const database = getDatabase();
  const stmt = database.prepare('SELECT * FROM call_logs WHERE id = ?');
  return stmt.get(id);
}

module.exports = {
  getDatabase,
  initializeDatabase,
  createUser,
  getUserByGoogleId,
  getUserById,
  getUserByEmail,
  getUserByCodename,
  getAllUsersExcept,
  updateUser,
  isCodenameAvailable,
  createCallLog,
  updateCallLog,
  getCallLogById
};
