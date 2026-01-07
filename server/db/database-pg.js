const { Pool } = require('pg');

let pool;

function getDatabase() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }
  return pool;
}

async function initializeDatabase() {
  const database = getDatabase();

  // Create users table
  await database.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      google_id TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      codename TEXT UNIQUE NOT NULL,
      answer_in_app BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add answer_in_app column if it doesn't exist (for existing databases)
  await database.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS answer_in_app BOOLEAN DEFAULT true
  `);

  // Create call_logs table for tracking calls
  await database.query(`
    CREATE TABLE IF NOT EXISTS call_logs (
      id SERIAL PRIMARY KEY,
      caller_id INTEGER NOT NULL,
      callee_id INTEGER NOT NULL,
      twilio_conference_sid TEXT,
      status TEXT DEFAULT 'initiated',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ended_at TIMESTAMP,
      FOREIGN KEY (caller_id) REFERENCES users(id),
      FOREIGN KEY (callee_id) REFERENCES users(id)
    )
  `);

  console.log('Database initialized successfully');
}

// User operations
async function createUser({ googleId, email, firstName, lastName, phoneNumber, codename }) {
  const database = getDatabase();
  const result = await database.query(
    `INSERT INTO users (google_id, email, first_name, last_name, phone_number, codename)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [googleId, email, firstName, lastName, phoneNumber, codename]
  );
  return result.rows[0].id;
}

async function getUserByGoogleId(googleId) {
  const database = getDatabase();
  const result = await database.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
  return result.rows[0];
}

async function getUserById(id) {
  const database = getDatabase();
  const result = await database.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0];
}

async function getUserByEmail(email) {
  const database = getDatabase();
  const result = await database.query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0];
}

async function getUserByCodename(codename) {
  const database = getDatabase();
  const result = await database.query('SELECT * FROM users WHERE codename = $1', [codename]);
  return result.rows[0];
}

async function getAllUsersExcept(userId) {
  const database = getDatabase();
  const result = await database.query('SELECT id, codename FROM users WHERE id != $1', [userId]);
  return result.rows;
}

async function updateUser(id, { phoneNumber, codename }) {
  const database = getDatabase();
  const result = await database.query(
    `UPDATE users
     SET phone_number = $1, codename = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3
     RETURNING *`,
    [phoneNumber, codename, id]
  );
  return result.rows[0];
}

async function isCodenameAvailable(codename, excludeUserId = null) {
  const database = getDatabase();
  let result;
  if (excludeUserId) {
    result = await database.query(
      'SELECT id FROM users WHERE codename = $1 AND id != $2',
      [codename, excludeUserId]
    );
  } else {
    result = await database.query('SELECT id FROM users WHERE codename = $1', [codename]);
  }
  return result.rows.length === 0;
}

async function updateUserAnswerInApp(id, answerInApp) {
  const database = getDatabase();
  const result = await database.query(
    `UPDATE users
     SET answer_in_app = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING *`,
    [answerInApp, id]
  );
  return result.rows[0];
}

// Call log operations
async function createCallLog(callerId, calleeId) {
  const database = getDatabase();
  const result = await database.query(
    `INSERT INTO call_logs (caller_id, callee_id)
     VALUES ($1, $2)
     RETURNING id`,
    [callerId, calleeId]
  );
  return result.rows[0].id;
}

async function updateCallLog(id, { twilioConferenceSid, status, endedAt }) {
  const database = getDatabase();
  const updates = [];
  const values = [];
  let paramCount = 1;

  if (twilioConferenceSid !== undefined) {
    updates.push(`twilio_conference_sid = $${paramCount++}`);
    values.push(twilioConferenceSid);
  }
  if (status !== undefined) {
    updates.push(`status = $${paramCount++}`);
    values.push(status);
  }
  if (endedAt !== undefined) {
    updates.push(`ended_at = $${paramCount++}`);
    values.push(endedAt);
  }

  if (updates.length === 0) return null;

  values.push(id);
  const result = await database.query(
    `UPDATE call_logs SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );
  return result.rows[0];
}

async function getCallLogById(id) {
  const database = getDatabase();
  const result = await database.query('SELECT * FROM call_logs WHERE id = $1', [id]);
  return result.rows[0];
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
  updateUserAnswerInApp,
  isCodenameAvailable,
  createCallLog,
  updateCallLog,
  getCallLogById
};
