'use strict';

const express = require('express');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const {
  randomBytes
} = require('node:crypto');
const {
  Server
} = require('socket.io');
const D = require('./src/domain');
const {
  verifyPassword
} = require('./src/security');
const {
  createStore
} = require('./src/store');
const csv = value => '"' + String(value ?? '').replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""') + '"';
function createApplication(store, {
  demo = false
} = {}) {
  const app = express(),
    server = http.createServer(app),
    sessions = store.sessions,
    attempts = new Map();
  const secure = process.env.COOKIE_SECURE === '1';
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({
    limit: '1mb'
  }));
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(self), microphone=()',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    });
    next();
  });
  const cookie = req => String(req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith('safetap_session='))?.slice(16);
  async function authenticate(req) {
    const token = cookie(req),
      session = await sessions.get(token);
    if (!session || session.expires <= Date.now()) {
      await sessions.delete(token);
      throw new D.Fault('Please sign in again.', 401);
    }
    const db = await store.read(),
      user = db.users.find(u => u.id === session.userId && u.active);
    if (!user) {
      await sessions.delete(token);
      throw new D.Fault('Account is inactive.', 401);
    }
    return {
      user,
      session,
      db
    };
  }
  const originOK = req => {
    if (!req.headers.origin) return true;
    const trustedProxy = process.env.TRUST_PROXY === '1';
    const protocol = trustedProxy && req.headers['x-forwarded-proto']
      ? req.headers['x-forwarded-proto']
      : req.protocol || 'http';
    const host = trustedProxy && (req.headers['x-forwarded-host'] || req.headers.host)
      ? (req.headers['x-forwarded-host'] || req.headers.host)
      : req.headers.host;
    return req.headers.origin === `${protocol}://${host}`;
  };
  const io = new Server(server, {
    allowRequest: (req, done) => done(null, originOK(req))
  });
  io.use(async (socket, next) => {
    try {
      const auth = await authenticate(socket.request);
      socket.data.userId = auth.user.id;
      socket.data.expires = auth.session.expires;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });
  const timer = setInterval(() => {
    sessions.purgeExpired().catch(() => console.error('Session cleanup failed; authentication still checks expiry.'));
    for (const [key, a] of attempts) if (a.until < Date.now()) attempts.delete(key);
    for (const socket of io.sockets.sockets.values()) if (socket.data.expires < Date.now()) socket.disconnect(true);
  }, 60000);
  timer.unref();
  app.get('/api/config', (req, res) => {
    res.set('Cache-Control', 'no-store').json({
      demo,
      qrAvailable: fs.existsSync(path.join(__dirname, 'public/vendor/html5-qrcode.min.js')),
      ocrAvailable: fs.existsSync(path.join(__dirname, 'public/vendor/eng.traineddata.gz'))
    });
  });
  app.post('/api/login', async (req, res, next) => {
    try {
      D.need(originOK(req), 'Invalid request origin.', 403);
      const key = req.ip,
        attempt = attempts.get(key);
      D.need(!attempt || attempt.until < Date.now() || attempt.count < 10, 'Too many attempts. Try again in 15 minutes.', 429);
      const {
        username,
        password
      } = req.body || {};
      D.need(typeof username === 'string' && typeof password === 'string' && password.length <= 128, 'Enter your username and password.');
      const db = await store.read(),
        user = db.users.find(u => u.username === username && u.active);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        attempts.set(key, {
          count: (attempt?.count || 0) + 1,
          until: Date.now() + 900000
        });
        throw new D.Fault('Incorrect username or password.', 401);
      }
      attempts.delete(key);
      await sessions.delete(cookie(req));
      const token = randomBytes(32).toString('hex'),
        session = {
          userId: user.id,
          csrf: randomBytes(24).toString('hex'),
          expires: Date.now() + 12 * 3600000
        };
      await sessions.set(token, session);
      res.set('Cache-Control', 'no-store');
      res.cookie('safetap_session', token, {
        httpOnly: true,
        sameSite: 'strict',
        secure,
        maxAge: 12 * 3600000,
        path: '/'
      }).json({
        user: D.publicUser(user),
        csrf: session.csrf
      });
    } catch (e) {
      next(e);
    }
  });
  app.use('/api', async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
      Object.assign(req, await authenticate(req));
      if (!['GET', 'HEAD'].includes(req.method)) {
        D.need(originOK(req) && req.headers['x-csrf-token'] === req.session.csrf, 'Session verification failed. Refresh and sign in again.', 403);
      }
      next();
    } catch (e) {
      next(e);
    }
  });
  app.get('/api/me', (req, res) => res.json({
    user: D.publicUser(req.user),
    csrf: req.session.csrf
  }));
  app.post('/api/logout', async (req, res) => {
    await sessions.delete(cookie(req));
    for (const s of io.sockets.sockets.values()) if (s.data.userId === req.user.id) s.disconnect(true);
    res.clearCookie('safetap_session', {
      path: '/'
    }).json({
      ok: true
    });
  });
  app.get('/api/state', (req, res) => res.json(D.snapshot(req.db, req.user)));
  const mutation = (route, fn) => app.post(route, async (req, res, next) => {
    try {
      const result = await store.transact(db => {
        const user = db.users.find(u => u.id === req.user.id && u.active);
        D.need(user, 'Account inactive.', 401);
        return fn(db, user, req);
      });
      io.emit('invalidate', {
        at: D.now()
      });
      res.json(result ?? {
        ok: true
      });
    } catch (e) {
      next(e);
    }
  });
  mutation('/api/students', (db, user, req) => D.saveStudent(db, user, req.body));
  mutation('/api/students/import', (db, user, req) => {
    D.admin(user);
    D.need(Array.isArray(req.body.rows) && req.body.rows.length > 0 && req.body.rows.length <= 1000, 'Import 1–1000 records.');
    return {
      count: req.body.rows.map(row => D.saveStudent(db, user, row)).length
    };
  });
  mutation('/api/students/:id/rotate-qr', (db, user, req) => {
    D.admin(user);
    const s = D.byId(db.students, req.params.id);
    s.qrToken = randomBytes(24).toString('hex');
    D.audit(db, user, 'qr.rotated', s.studentNumber);
    return {
      ok: true
    };
  });
  mutation('/api/blocks', (db, user, req) => D.saveBlock(db, user, req.body));
  mutation('/api/reps', (db, user, req) => D.saveRep(db, user, req.body));
  mutation('/api/classes', (db, user, req) => D.openClass(db, user, req.body));
  mutation('/api/classes/:id', (db, user, req) => D.updateClass(db, user, req.params.id, req.body));
  mutation('/api/events', (db, user, req) => D.startEvent(db, user, req.body));
  mutation('/api/events/:id/close', (db, user, req) => {
    D.admin(user);
    const e = D.byId(db.events, req.params.id);
    D.need(e.status === 'active', 'Event is already closed.');
    e.status = 'closed';
    e.endedAt = D.now();
    D.audit(db, user, 'event.closed', e.name);
    return e;
  });
  mutation('/api/events/:id/baseline', (db, user, req) => D.correctBaseline(db, user, req.params.id, req.body));
  mutation('/api/checkins', (db, user, req) => D.checkin(db, user, req.body));
  mutation('/api/checkins/:id/review', (db, user, req) => D.reviewCheckin(db, user, req.params.id, req.body));
  mutation('/api/sync', (db, user, req) => {
    D.need(Array.isArray(req.body.scans) && req.body.scans.length <= 100, 'Sync at most 100 records per batch.');
    return {
      results: req.body.scans.map(scan => {
        try {
          return {
            submissionId: scan.submissionId,
            ...D.checkin(db, user, scan)
          };
        } catch (e) {
          if (!e.status) throw e;
          return {
            submissionId: scan.submissionId,
            status: 'rejected',
            error: e.message
          };
        }
      })
    };
  });
  app.get('/api/offline', (req, res) => {
    const e = req.db.events.find(e => e.status === 'active');
    D.need(e, 'Start an evacuation event before preparing offline scanning.');
    res.json({
      userId: req.user.id,
      event: e,
      students: req.db.students.filter(s => s.active),
      blocks: req.db.blocks,
      preparedAt: D.now()
    });
  });
  app.get('/api/events/:id', (req, res) => res.json(D.eventSummary(req.db, req.params.id)));
  app.get('/api/events/:id/export', (req, res) => {
    D.admin(req.user);
    const report = D.eventSummary(req.db, req.params.id);
    const rows = [['Event', 'Student number', 'Name', 'Program/block', 'Term', 'Last recorded room', 'Baseline', 'Status'], ...report.people.map(p => [report.event.name, p.studentNumber, p.name, p.blockLabel, p.term, p.roomName || 'Unknown', p.expected ? 'Expected' : 'Additional', p.safe ? 'Accounted' : 'Unaccounted'])];
    res.type('text/csv').attachment(`safetap-${report.event.id}.csv`).send('\uFEFF' + rows.map(row => row.map(csv).join(',')).join('\r\n'));
  });
  app.get('/api/students/:id/qr', async (req, res, next) => {
    try {
      D.admin(req.user);
      const student = D.byId(req.db.students, req.params.id);
      let QR;
      try {
        QR = require('qrcode');
      } catch {
        throw new D.Fault('QR generation dependency is missing. Run npm install on the server.', 503);
      }
      res.json({
        student: D.publicUser(student),
        image: await QR.toDataURL('safetap:' + student.qrToken, {
          width: 360,
          margin: 2,
          errorCorrectionLevel: 'M'
        })
      });
    } catch (e) {
      next(e);
    }
  });
  app.get('/health', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      await store.ping();
      res.json({status: 'ok', storage: demo ? 'demo-file' : 'mysql'});
    } catch {
      res.status(503).json({status: 'unavailable', storage: demo ? 'demo-file' : 'mysql'});
    }
  });
  app.use('/api', (req, res) => res.status(404).json({
    error: 'API route not found.'
  }));
  app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, file) => {
      if (/\.(?:js|css|html)$/.test(file)) res.set('Cache-Control', 'no-cache');
    }
  }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (!error.status) console.error(error);
    res.status(error.status || 500).json({
      error: error.status ? error.message : 'Server operation failed. No success has been confirmed; retry after reconnecting.'
    });
  });
  return {
    app,
    server,
    io,
    close: async () => {
      clearInterval(timer);
      await new Promise(resolve => io.close(resolve));
      await store.close();
    }
  };
}
if (require.main === module) {
  const demo = process.argv.includes('--demo');
  createStore({
    demo
  }).then(store => {
    const instance = createApplication(store, {
      demo
    });
    const port = Number(process.env.PORT || 3000);
    instance.server.on('error', error => {
      console.error(`Unable to listen on port ${port}: ${error.code || error.message}. Check local network permissions and port availability.`);
      instance.close().finally(() => {
        process.exitCode = 1;
      });
    });
    instance.server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`SafeTap: http://${process.env.HOST || '127.0.0.1'}:${port} (${demo ? 'DEMO — fictional data / file storage' : 'MySQL'})`));
    process.on('SIGTERM', () => instance.close().then(() => process.exit()));
    process.on('SIGINT', () => instance.close().then(() => process.exit()));
  }).catch(e => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
module.exports = {
  createApplication
};
