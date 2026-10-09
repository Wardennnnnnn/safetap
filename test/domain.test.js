'use strict';

const {
  test
} = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/domain');
const {
  MemoryStore
} = require('../src/store');
const {
  verifyPassword
} = require('../src/security');
function fixture() {
  const db = D.baseDb({
      demo: true,
      password: 'SafeTapDemo123!'
    }),
    admin = db.users[0],
    rep = db.users[1],
    other = db.users[2],
    student = db.students[0];
  return {
    db,
    admin,
    rep,
    other,
    student
  };
}
function eventFixture() {
  const f = fixture();
  const c = D.openClass(f.db, f.rep, {
    blockId: f.student.blockId,
    roomId: 'F3-3'
  });
  D.updateClass(f.db, f.rep, c.id, {
    studentId: f.student.id,
    present: true
  });
  const event = D.startEvent(f.db, f.admin, {
    name: 'Test drill',
    area: 'Assembly A',
    type: 'drill'
  });
  return {
    ...f,
    c,
    event
  };
}
function scan(f, overrides = {}) {
  return {
    submissionId: require('crypto').randomUUID(),
    eventId: f.event.id,
    studentId: f.student.id,
    method: 'manual',
    confirmed: true,
    capturedAt: D.now(),
    ...overrides
  };
}
test('password hashing and public user omit secrets', () => {
  const f = fixture();
  assert(verifyPassword('SafeTapDemo123!', f.admin.passwordHash));
  assert(!verifyPassword('bad', f.admin.passwordHash));
  assert(!('passwordHash' in D.publicUser(f.admin)));
});
test('program + code + term distinguish IT and CS; duplicate block rejected', () => {
  const f = fixture();
  assert.equal(f.db.blocks.length, 2);
  assert.throws(() => D.saveBlock(f.db, f.admin, f.db.blocks[0]), /already exists/);
  assert.throws(() => D.saveBlock(f.db, f.rep, {
    program: 'IT',
    code: '3102',
    term: 'T'
  }), /Admin/);
});
test('own-block classroom access and CAFAD exclusion', () => {
  const f = fixture();
  assert.throws(() => D.openClass(f.db, f.other, {
    blockId: f.student.blockId,
    roomId: 'F1-1'
  }), /not assigned/);
  assert.throws(() => D.openClass(f.db, f.rep, {
    blockId: f.student.blockId,
    roomId: 'F5-1'
  }), /CAFAD/);
});
test('departures and closed/stale sessions do not enter baseline', () => {
  const f = fixture();
  const c = D.openClass(f.db, f.rep, {
    blockId: f.student.blockId,
    roomId: 'F1-1'
  });
  D.updateClass(f.db, f.rep, c.id, {
    studentId: f.student.id,
    present: true
  });
  D.updateClass(f.db, f.rep, c.id, {
    studentId: f.student.id,
    present: false
  });
  const e = D.startEvent(f.db, f.admin, {
    name: 'Test',
    area: 'A',
    type: 'drill'
  });
  assert.equal(D.eventSummary(f.db, e.id).total, 0);
  e.status = 'closed';
  D.updateClass(f.db, f.rep, c.id, {
    studentId: f.student.id,
    present: true
  });
  c.date = '2000-01-01';
  const e2 = D.startEvent(f.db, f.admin, {
    name: 'Test2',
    area: 'A',
    type: 'drill'
  });
  assert.equal(D.eventSummary(f.db, e2.id).total, 0);
  assert.equal(e2.coverage[0].session, null);
});
test('room move, baseline snapshot, and immutable historical names', () => {
  const f = eventFixture();
  assert.equal(D.eventSummary(f.db, f.event.id).people[0].roomId, 'F3-3');
  assert.throws(() => D.updateClass(f.db, f.rep, f.c.id, {
    roomId: 'F1-1'
  }), /locked/);
  f.student.name = 'Changed';
  f.student.blockId = f.db.blocks[1].id;
  const p = D.eventSummary(f.db, f.event.id).people[0];
  assert.equal(p.name, 'Jamie Santos');
  assert.equal(p.program, 'IT');
});
test('cross-block scanning is allowed, repeat submissions/scans count once', () => {
  const f = eventFixture(),
    input = scan(f);
  assert.equal(D.checkin(f.db, f.other, input).status, 'confirmed');
  assert.equal(D.checkin(f.db, f.other, input).status, 'confirmed');
  assert.equal(D.checkin(f.db, f.rep, scan(f)).status, 'duplicate');
  assert.equal(D.eventSummary(f.db, f.event.id).safe, 1);
  assert.equal(f.db.checkins.length, 1);
  assert.throws(() => D.checkin(f.db, f.rep, input), /conflict/);
});
test('QR NFC OCR manual resolve the same student', () => {
  const f = eventFixture();
  f.student.nfcUid = '04A1B2C3D4E5F6';
  for (const input of [{
    method: 'qr',
    credential: 'safetap:' + f.student.qrToken
  }, {
    method: 'nfc',
    credential: f.student.nfcUid.match(/.{1,2}/g).join(':')
  }, {
    method: 'ocr',
    studentId: f.student.id,
    confirmed: true
  }, {
    method: 'manual',
    studentId: f.student.id,
    confirmed: true
  }]) D.checkin(f.db, f.rep, scan(f, input));
  assert.equal(D.eventSummary(f.db, f.event.id).safe, 1);
  assert.throws(() => D.checkin(f.db, f.rep, scan(f, {
    method: 'ocr',
    confirmed: false
  })), /Confirm/);
});
test('additional students do not reduce baseline unaccounted', () => {
  const f = eventFixture();
  D.checkin(f.db, f.rep, scan(f, {
    studentId: f.db.students[6].id
  }));
  const r = D.eventSummary(f.db, f.event.id);
  assert.equal(r.total, 1);
  assert.equal(r.unaccounted, 1);
  assert.equal(r.additional, 1);
});
test('closed-event offline upload awaits review then audits approval and void', () => {
  const f = eventFixture();
  f.event.status = 'closed';
  f.event.endedAt = D.now();
  const result = D.checkin(f.db, f.rep, scan(f));
  assert.equal(result.status, 'review');
  assert.equal(D.eventSummary(f.db, f.event.id).safe, 0);
  assert.throws(() => D.reviewCheckin(f.db, f.rep, result.checkinId, {
    action: 'approve',
    reason: 'Verified'
  }), /Admin/);
  D.reviewCheckin(f.db, f.admin, result.checkinId, {
    action: 'approve',
    reason: 'Rep verified arrival'
  });
  assert.equal(D.eventSummary(f.db, f.event.id).safe, 1);
  D.reviewCheckin(f.db, f.admin, result.checkinId, {
    action: 'void',
    reason: 'Wrong ID'
  });
  assert.equal(D.eventSummary(f.db, f.event.id).safe, 0);
  assert(f.db.audit.some(a => a.action === 'checkin.void'));
});
test('baseline correction requires reason and monitored room', () => {
  const f = eventFixture();
  assert.throws(() => D.correctBaseline(f.db, f.admin, f.event.id, {
    studentId: f.student.id,
    expected: false,
    reason: ''
  }), /required/);
  D.correctBaseline(f.db, f.admin, f.event.id, {
    studentId: f.student.id,
    expected: false,
    reason: 'Confirmed off campus'
  });
  assert.equal(D.eventSummary(f.db, f.event.id).total, 0);
  assert.throws(() => D.correctBaseline(f.db, f.admin, f.event.id, {
    studentId: f.student.id,
    expected: true,
    roomId: 'F5-1',
    reason: 'Test'
  }), /outside scope/);
});
test('store serializes concurrent scans and rolls back failed import', async () => {
  const f = eventFixture(),
    store = new MemoryStore(f.db);
  const results = await Promise.all(Array.from({
    length: 12
  }, () => store.transact(db => D.checkin(db, f.rep, scan(f)))));
  assert.equal(results.filter(r => r.status === 'confirmed').length, 1);
  assert.equal((await store.read()).checkins.length, 1);
  await assert.rejects(store.transact(db => {
    D.saveStudent(db, f.admin, {
      name: 'Valid',
      studentNumber: 'NEW',
      blockId: f.student.blockId
    });
    D.saveStudent(db, f.admin, {
      name: 'Duplicate',
      studentNumber: 'NEW',
      blockId: f.student.blockId
    });
  }), /already registered/);
  assert.equal((await store.read()).students.length, 12);
});
test('editing student preserves a verified UID unless explicitly cleared; UID uniqueness enforced', () => {
  const f = fixture();
  f.student.nfcUid = '04A1B2C3D4E5F6';
  const old = f.student.nfcUid;
  D.saveStudent(f.db, f.admin, {
    ...f.student,
    nfcUid: undefined
  });
  assert.equal(f.student.nfcUid, old);
  assert.throws(() => D.saveStudent(f.db, f.admin, {
    name: 'X',
    studentNumber: 'X',
    blockId: f.student.blockId,
    nfcUid: old
  }), /already registered/);
  D.saveStudent(f.db, f.admin, {
    ...f.student,
    nfcUid: ''
  });
  assert.equal(f.student.nfcUid, null);
});
