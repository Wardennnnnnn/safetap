'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const syncFs = require('node:fs');
const {MemorySessionStore, MysqlSessionStore, sessionMigration} = require('./sessions');
const {
  schema,
  migrations
} = require('./schema');
const {
  TABLES,
  baseDb
} = require('./domain');
class MemoryStore {
  constructor(db, file = null) {
    this.db = structuredClone(db);
    this.file = file;
    this.tail = Promise.resolve();
    this.sessions = new MemorySessionStore();
  }
  read() {
    return this.tail.then(() => structuredClone(this.db));
  }
  transact(fn) {
    const job = this.tail.then(async () => {
      const next = structuredClone(this.db);
      const result = await fn(next);
      if (this.file) {
        await fs.mkdir(path.dirname(this.file), {
          recursive: true
        });
        await fs.writeFile(`${this.file}.tmp`, JSON.stringify(next));
        await fs.rename(`${this.file}.tmp`, this.file);
      }
      this.db = next;
      return result;
    });
    this.tail = job.catch(() => {});
    return job;
  }
  async ping() {}
  async close() {}
}
class MysqlStore {
  constructor(pool) {
    this.pool = pool;
    this.sessions = new MysqlSessionStore(pool);
  }
  async load(conn) {
    const db = {};
    for (const table of TABLES) {
      const [rows] = await conn.query(`SELECT * FROM \`${table}\``);
      db[table] = rows.map(row => Object.fromEntries(Object.entries(schema[table]).map(([field, type]) => {
        let value = row[field];
        if (type === 'JSON' && typeof value === 'string') value = JSON.parse(value);
        if (type === 'BOOLEAN') value = Boolean(value);
        return [field, value];
      })));
    }
    return db;
  }
  async read() {
    const conn = await this.pool.getConnection();
    try {
      await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await conn.beginTransaction();
      const db = await this.load(conn);
      await conn.commit();
      return db;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
  async transact(fn) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('SELECT id FROM app_lock WHERE id=1 FOR UPDATE');
      const before = await this.load(conn),
        next = structuredClone(before);
      const result = await fn(next);
      for (const table of TABLES) {
        const fields = Object.keys(schema[table]);
        const previous = new Map(before[table].map(r => [r.id, JSON.stringify(r)]));
        for (const row of next[table]) {
          if (previous.get(row.id) === JSON.stringify(row)) continue;
          const values = fields.map(k => schema[table][k] === 'JSON' ? JSON.stringify(row[k]) : row[k] ?? null);
          await conn.execute(`INSERT INTO \`${table}\` (${fields.map(k => '`' + k + '`').join(',')}) VALUES (${fields.map(() => '?').join(',')}) ON DUPLICATE KEY UPDATE ${fields.filter(k => k !== 'id').map(k => '`' + k + '`=VALUES(`' + k + '`)').join(',')}`, values);
        }
      }
      await conn.commit();
      return result;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
  async ping() { await this.pool.query('SELECT 1'); }
  async close() {
    await this.pool.end();
  }
}
function poolConfig(env = process.env) {
  if (env.DB_SSL && !['0', '1'].includes(env.DB_SSL)) throw new Error('DB_SSL must be 0 or 1.');
  let ssl;
  if (env.DB_SSL === '1') {
    if (!env.DB_SSL_CA_FILE) throw new Error('DB_SSL_CA_FILE is required when DB_SSL=1.');
    try {
      const ca = syncFs.readFileSync(env.DB_SSL_CA_FILE, 'utf8');
      const certificates = ca.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
      if (!certificates?.length) throw new Error('Invalid certificate');
      for (const certificate of certificates) new (require('node:crypto').X509Certificate)(certificate);
      require('node:tls').createSecureContext({ca});
      ssl = {ca, rejectUnauthorized: true, verifyIdentity: true};
    } catch { throw new Error('Unable to load a valid database CA certificate. Check DB_SSL_CA_FILE.'); }
  }
  return {
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || 'safetap',
    password: env.DB_PASSWORD,
    database: env.DB_NAME || 'safetap',
    connectionLimit: 5,
    charset: 'utf8mb4',
    connectTimeout: 10000,
    ...(ssl ? {ssl} : {})
  };
}
async function mysqlPool() {
  let mysql;
  try {
    mysql = require('mysql2/promise');
  } catch {
    throw new Error('mysql2 is not installed. Run npm install. For an explicitly labeled local demo, run npm run demo.');
  }
  return mysql.createPool(poolConfig());
}
async function migrate(pool) {
  for (const sql of [...migrations, sessionMigration]) await pool.query(sql);
}
async function initialize() {
  const pool = await mysqlPool();
  try {
    await migrate(pool);
    const store = new MysqlStore(pool);
    await store.transact(db => {
      if (db.users.length) return;
      if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12) throw new Error('Set ADMIN_PASSWORD to at least 12 characters before initialization.');
      const seed = baseDb({
        username: process.env.ADMIN_USERNAME || 'admin',
        password: process.env.ADMIN_PASSWORD
      });
      for (const t of TABLES) db[t] = seed[t];
    });
  } finally {
    await pool.end();
  }
}
async function createStore({
  demo = false
} = {}) {
  if (demo) {
    const file = path.join(__dirname, '../.runtime/demo.json');
    let db;
    try {
      db = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      db = baseDb({
        demo: true,
        password: 'SafeTapDemo123!'
      });
    }
    return new MemoryStore(db, file);
  }
  const pool = await mysqlPool();
  try {
    await pool.query('SELECT id FROM app_lock LIMIT 1');
    try {
      await pool.query('SELECT tokenHash FROM app_sessions LIMIT 0');
    } catch (error) {
      if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
      // Additive upgrade for existing Fedora installs; no domain records seeded.
      await pool.query(sessionMigration);
    }
  } catch (error) {
    await pool.end();
    if (error.code === 'ER_NO_SUCH_TABLE') throw new Error('Database schema is not ready. Run npm run db:migrate before starting SafeTap.');
    throw error;
  }
  return new MysqlStore(pool);
}
module.exports = {
  MemoryStore,
  MysqlStore,
  createStore,
  initialize,
  migrate,
  mysqlPool,
  poolConfig
};
