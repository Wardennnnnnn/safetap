'use strict';
const {mysqlPool, migrate} = require('../src/store');
(async () => {
  const pool = await mysqlPool();
  try { await migrate(pool); console.log('Schema ready; existing users and records preserved. No users seeded.'); }
  finally { await pool.end(); }
})().catch(() => { console.error('Schema migration failed. Check database settings, TLS certificate, and CREATE permissions.'); process.exitCode = 1; });
