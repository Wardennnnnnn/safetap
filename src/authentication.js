'use strict';

const {randomBytes} = require('node:crypto');
const domain = require('./domain');
const {verifyPassword} = require('./security');

function createAuthentication(store) {
  const sessions = store.sessions;
  const attempts = new Map();
  const secure = process.env.COOKIE_SECURE === '1';
  let timer;
  const cookie = req => String(req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith('safetap_session='))?.slice(16);
  async function authenticate(req) {
    const token = cookie(req),
      session = await sessions.get(token);
    if (!session || session.expires <= Date.now()) {
      await sessions.delete(token);
      throw new domain.Fault('Please sign in again.', 401);
    }
    const user = await store.findUser('id', session.userId);
    if (!user?.active) {
      await sessions.delete(token);
      throw new domain.Fault('Account is inactive.', 401);
    }
    return {
      user,
      session
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
  function mountRoutes(app, io) {
    // Guest discovery is a normal response. Protected APIs still return 401.
    app.get('/api/session', async (req, res, next) => {
      res.set('Cache-Control', 'no-store');
      if (!cookie(req)) return res.json({user: null, csrf: null});
      try {
        const {user, session} = await authenticate(req);
        res.json({user: domain.publicUser(user), csrf: session.csrf});
      } catch (error) {
        if (error.status === 401) return res.json({user: null, csrf: null});
        next(error);
      }
    });
    timer = setInterval(() => {
      sessions.purgeExpired().catch(() => console.error('Session cleanup failed; authentication still checks expiry.'));
      for (const [key, a] of attempts) if (a.until < Date.now()) attempts.delete(key);
      for (const socket of io.sockets.sockets.values()) if (socket.data.expires < Date.now()) socket.disconnect(true);
    }, 60000);
    timer.unref();
    app.post('/api/login', async (req, res, next) => {
      try {
        domain.need(originOK(req), 'Invalid request origin.', 403);
        const key = req.ip,
          attempt = attempts.get(key);
        domain.need(!attempt || attempt.until < Date.now() || attempt.count < 10, 'Too many attempts. Try again in 15 minutes.', 429);
        const {
          username,
          password
        } = req.body || {};
        domain.need(typeof username === 'string' && typeof password === 'string' && password.length <= 128, 'Enter your username and password.');
        const user = await store.findUser('username', username);
        if (!user?.active || !verifyPassword(password, user.passwordHash)) {
          attempts.set(key, {
            count: (attempt?.count || 0) + 1,
            until: Date.now() + 900000
          });
          throw new domain.Fault('Incorrect username or password.', 401);
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
          user: domain.publicUser(user),
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
          domain.need(originOK(req) && req.headers['x-csrf-token'] === req.session.csrf, 'Session verification failed. Refresh and sign in again.', 403);
        }
        next();
      } catch (e) {
        next(e);
      }
    });
    app.get('/api/me', (req, res) => res.json({
      user: domain.publicUser(req.user),
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
  }
  return {authenticate, originOK, mountRoutes, close: () => clearInterval(timer)};
}

module.exports = {createAuthentication};
