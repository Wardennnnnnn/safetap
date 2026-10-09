'use strict';

const {createHash} = require('node:crypto');
const hash = token => createHash('sha256').update(token).digest('hex');
const valid = token => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
const sessionMigration = `CREATE TABLE IF NOT EXISTS app_sessions (
  tokenHash CHAR(64) PRIMARY KEY,
  userId VARCHAR(191) NOT NULL,
  csrf CHAR(48) NOT NULL,
  expires BIGINT NOT NULL,
  KEY session_expiry (expires),
  FOREIGN KEY (userId) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`;

class MemorySessionStore {
  constructor() { this.rows = new Map(); }
  async get(token) { return valid(token) ? structuredClone(this.rows.get(hash(token))) : undefined; }
  async set(token, session) { this.rows.set(hash(token), structuredClone(session)); }
  async delete(token) { if (valid(token)) this.rows.delete(hash(token)); }
  async purgeExpired(now = Date.now()) {
    for (const [key, session] of this.rows) if (session.expires <= now) this.rows.delete(key);
  }
}

class MysqlSessionStore {
  constructor(pool) { this.pool = pool; }
  async get(token) {
    if (!valid(token)) return undefined;
    const [rows] = await this.pool.execute('SELECT userId, csrf, expires FROM app_sessions WHERE tokenHash = ?', [hash(token)]);
    if (!rows.length) return undefined;
    return {...rows[0], expires: Number(rows[0].expires)};
  }
  async set(token, session) {
    await this.pool.execute('INSERT INTO app_sessions (tokenHash, userId, csrf, expires) VALUES (?, ?, ?, ?)', [hash(token), session.userId, session.csrf, session.expires]);
  }
  async delete(token) {
    if (valid(token)) await this.pool.execute('DELETE FROM app_sessions WHERE tokenHash = ?', [hash(token)]);
  }
  async purgeExpired(now = Date.now()) { await this.pool.execute('DELETE FROM app_sessions WHERE expires <= ?', [now]); }
}

module.exports = {MemorySessionStore, MysqlSessionStore, sessionMigration};
