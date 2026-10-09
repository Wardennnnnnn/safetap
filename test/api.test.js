'use strict';

const {
  test
} = require('node:test');
const assert = require('node:assert/strict');
const {
  createApplication
} = require('../server');
const D = require('../src/domain');
const {
  MemoryStore
} = require('../src/store');
const {
  request
} = require('./helpers/request');
test('HTTP authentication, CSRF, scope, deduplication, revocation, and export', async t => {
  const db = D.baseDb({
      demo: true,
      password: 'SafeTapDemo123!'
    }),
    store = new MemoryStore(db),
    instance = createApplication(store, {
      demo: true
    });
  t.after(() => instance.close());
  async function req(path, {
    session,
    body,
    csrf = true
  } = {}) {
    const res = await request(instance.app, {
      path: '/api' + path,
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        ...(session ? {
          cookie: session.cookie,
          ...(csrf ? {
            'x-csrf-token': session.csrf
          } : {})
        } : {})
      },
      body
    });
    return {
      status: res.status,
      res: {
        headers: {
          get: name => {
            const value = res.headers[name];
            return Array.isArray(value) ? value[0] : value;
          }
        }
      },
      data: res.headers['content-type']?.includes('json') ? JSON.parse(res.body) : res.body
    };
  }
  async function login(username) {
    const r = await req('/login', {
      body: {
        username,
        password: 'SafeTapDemo123!'
      }
    });
    assert.equal(r.status, 200);
    return {
      cookie: r.res.headers.get('set-cookie').split(';')[0],
      csrf: r.data.csrf
    };
  }
  assert.equal((await req('/state')).status, 401);
  const admin = await login('admin'),
    rep = await login('repit'),
    other = await login('repcs');
  assert.equal((await req('/blocks', {
    session: admin,
    csrf: false,
    body: {}
  })).status, 403);
  assert.equal((await req('/blocks', {
    session: rep,
    body: {
      program: 'IT',
      code: 'x',
      term: 'x'
    }
  })).status, 403);
  assert.equal((await req('/classes', {
    session: other,
    body: {
      blockId: db.blocks[0].id,
      roomId: 'F3-3'
    }
  })).status, 403);
  const c = await req('/classes', {
    session: rep,
    body: {
      blockId: db.blocks[0].id,
      roomId: 'F3-3'
    }
  });
  assert.equal(c.status, 200);
  await req(`/classes/${c.data.id}`, {
    session: rep,
    body: {
      studentId: db.students[0].id,
      present: true
    }
  });
  const e = await req('/events', {
    session: admin,
    body: {
      name: 'HTTP drill',
      type: 'drill',
      area: 'Assembly A'
    }
  });
  assert.equal(e.status, 200);
  const scan = {
    submissionId: require('crypto').randomUUID(),
    eventId: e.data.id,
    method: 'manual',
    studentId: db.students[0].id,
    confirmed: true,
    capturedAt: D.now()
  };
  const scans = await Promise.all([req('/checkins', {
    session: other,
    body: scan
  }), req('/checkins', {
    session: rep,
    body: {
      ...scan,
      submissionId: require('crypto').randomUUID()
    }
  })]);
  assert.equal(scans.filter(r => r.data.status === 'confirmed').length, 1);
  const state = await req('/state', {
    session: admin
  });
  assert.equal(state.data.active.safe, 1);
  assert(!JSON.stringify(state.data).includes('passwordHash'));
  assert(!JSON.stringify(state.data).includes('qrToken'));
  assert.equal((await req(`/events/${e.data.id}/export`, {
    session: rep
  })).status, 403);
  const report = await req(`/events/${e.data.id}/export`, {
    session: admin
  });
  assert.equal(report.status, 200);
  assert(report.data.includes('Jamie Santos'));
  await req(`/events/${e.data.id}/close`, {
    session: admin,
    body: {}
  });
  const sync = await req('/sync', {
    session: rep,
    body: {
      scans: [{
        ...scan,
        studentId: db.students[1].id,
        submissionId: require('crypto').randomUUID()
      }, {
        ...scan,
        submissionId: require('crypto').randomUUID(),
        studentId: 'missing'
      }]
    }
  });
  assert.deepEqual(sync.data.results.map(r => r.status), ['review', 'rejected']);
  await store.transact(db => {
    db.users.find(u => u.username === 'repit').active = false;
  });
  assert.equal((await req('/offline', {
    session: rep
  })).status, 401);
  assert.equal((await req('/logout', {
    session: admin,
    body: {}
  })).status, 200);
  assert.equal((await req('/state', {
    session: admin
  })).status, 401);
});
