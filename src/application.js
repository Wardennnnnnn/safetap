'use strict';

const express = require('express');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const {
  Server
} = require('socket.io');
const domain = require('./domain');
const {createAuthentication} = require('./authentication');
const {offlinePack} = require('./offline-directory');
const root = path.join(__dirname, '..');
function createApplication(store, {
  demo = false
} = {}) {
  const app = express();
  const server = http.createServer(app);
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
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(self), microphone=()',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss: https://cloudflareinsights.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    });
    next();
  });
  const auth = createAuthentication(store);
  const {authenticate, originOK} = auth;
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
  app.get('/api/config', (req, res) => {
    res.set('Cache-Control', 'no-store').json({
      demo,
      qrAvailable: fs.existsSync(path.join(root, 'public/vendor/html5-qrcode.min.js'))
    });
  });
  app.get('/api/version', (req, res) => {
    res.set('Cache-Control', 'no-store').json(require('./release'));
  });
  auth.mountRoutes(app, io);
  app.use('/api', async (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) return next();
    try {
      let tables;
      const route = req.path.toLowerCase().replace(/\/+$/, '');
      if (route === '/state') tables = domain.TABLES.filter(table => table !== 'submissions' && (req.user.role === 'admin' || table !== 'audit'));
      else if (route === '/offline') tables = ['users', 'students', 'blocks', 'events'];
      else if (/^\/events\/[^/]+(?:\/export)?$/.test(route)) tables = ['users', 'events', 'participants', 'checkins'];
      else if (/^\/students\/[^/]+\/qr$/.test(route)) tables = ['users', 'students'];
      if (tables) {
        req.db = await store.read(tables);
        const user = req.db.users.find(user => user.id === req.user.id && user.active);
        domain.need(user, 'Account inactive.', 401);
        req.user = user;
      }
      next();
    } catch (error) { next(error); }
  });
  app.get('/api/state', (req, res) => {
    const snapshot = domain.snapshot(req.db, req.user);
    if (req.query.directoryVersion === snapshot.directoryVersion) {
      delete snapshot.students;
      delete snapshot.blocks;
    }
    res.json(snapshot);
  });
  const mutation = (route, fn, scanBatch) => app.post(route, async (req, res, next) => {
    try {
      const scans = scanBatch ? scanBatch(req) : null;
      const result = await store.transact(db => {
        const user = db.users.find(u => u.id === req.user.id && u.active);
        domain.need(user, 'Account inactive.', 401);
        return fn(db, user, req);
      }, scans ? {scans, userId: req.user.id} : {});
      io.emit('invalidate', {
        at: domain.now()
      });
      res.json(result ?? {
        ok: true
      });
    } catch (e) {
      next(e);
    }
  });
  require('./routes/directory')({mutation});
  require('./routes/attendance')({mutation});
  app.get('/api/offline', (req, res) => res.json(offlinePack(req.db, req.user, req.query.version)));
  require('./routes/reports')({app});
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
  app.use(express.static(path.join(root, 'public'), {
    setHeaders: (res, file) => {
      if (/\.(?:js|css|html)$/.test(file)) res.set('Cache-Control', 'no-cache');
      if (process.env.NODE_ENV !== 'production') return;
      if (/\.(?:js|css)$/.test(file) && res.req.query.v === require('./release').build.slice(1)) {
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (/\.(?:ttf|woff2)$/.test(file)) {
        res.set('Cache-Control', 'public, max-age=604800');
      }
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
      auth.close();
      await new Promise(resolve => io.close(resolve));
      await store.close();
    }
  };
}
module.exports = {createApplication};
