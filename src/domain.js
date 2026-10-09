'use strict';

const {
  randomUUID,
  randomBytes
} = require('node:crypto');
const {
  hashPassword
} = require('./security');
const TABLES = ['users', 'blocks', 'rooms', 'students', 'classes', 'attendance', 'events', 'participants', 'checkins', 'submissions', 'audit'];
const now = () => new Date().toISOString();
const day = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(date);
const uid = value => String(value || '').replace(/[:\s-]/g, '').toUpperCase();
class Fault extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
function need(value, message, status = 400) {
  if (!value) throw new Fault(message, status);
}
function text(value, label, max = 120) {
  need(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max, `${label} is required (maximum ${max} characters).`);
  return value.trim();
}
function admin(user) {
  need(user.role === 'admin', 'Admin access required.', 403);
}
function blockAccess(user, id) {
  need(user.role === 'admin' || user.blockIds.includes(id), 'This block is not assigned to you.', 403);
}
function audit(db, user, action, detail) {
  db.audit.push({
    id: randomUUID(),
    userId: user.id,
    actor: user.name,
    action,
    detail,
    time: now()
  });
}
function byId(rows, id, label = 'Record') {
  const row = rows.find(r => r.id === id);
  need(row, `${label} not found.`, 404);
  return row;
}
function baseDb({
  demo = false,
  username = 'admin',
  password
} = {}) {
  const db = Object.fromEntries(TABLES.map(t => [t, []]));
  db.users.push({
    id: randomUUID(),
    name: 'Safety administrator',
    username,
    passwordHash: hashPassword(password || randomBytes(24).toString('hex')),
    role: 'admin',
    blockIds: [],
    active: true
  });
  const floorRooms = {
    1: ['101', '102', '103', '104', '105', '106'],
    2: ['201', '202', 'A · CPE Faculty', 'B · Student Services', 'C · Consultation', 'D · CICS Faculty', "E · Dean’s Office"],
    3: ['LAB 1', 'LAB 2', 'LAB 3', 'LAB 4', 'LAB 5', 'LAB 6'],
    4: ['401', 'PHYSICS LAB', 'SMART', 'EDL', 'F · TECH LAB', 'ITL'],
    5: ['501', '502', '503', '504', '505', '506']
  };
  for (const [floor, names] of Object.entries(floorRooms)) names.forEach((name, index) => db.rooms.push({
    id: `F${floor}-${index + 1}`,
    name,
    floor: Number(floor),
    monitored: floor !== '5',
    position: index
  }));
  if (demo) {
    for (const [index, program] of ['IT', 'CS'].entries()) {
      const block = {
        id: `${program}-3101-2026`,
        program,
        code: '3101',
        term: '2026–2027 / 1st semester'
      };
      db.blocks.push(block);
      db.users.push({
        id: `rep-${program}`,
        name: `${program} Class Representative`,
        username: `rep${program.toLowerCase()}`,
        passwordHash: hashPassword('SafeTapDemo123!'),
        role: 'rep',
        blockIds: [block.id],
        active: true
      });
      const names = index ? ['Alex Rivera', 'Mika Torres', 'Sam Castillo', 'Dani Flores', 'Chris Lim', 'Robin Garcia'] : ['Jamie Santos', 'Casey Reyes', 'Taylor Cruz', 'Morgan Ramos', 'Jordan Tan', 'Avery Mendoza'];
      names.forEach((name, i) => db.students.push({
        id: randomUUID(),
        studentNumber: `DEMO-${index + 1}0${i + 1}`,
        name,
        blockId: block.id,
        nfcUid: null,
        qrToken: randomBytes(24).toString('hex'),
        active: true
      }));
    }
  }
  return db;
}
function saveStudent(db, user, input) {
  admin(user);
  byId(db.blocks, input.blockId, 'Block');
  const studentNumber = text(input.studentNumber, 'Student number', 40),
    name = text(input.name, 'Name');
  const nfcUid = uid(input.nfcUid === undefined && input.id ? byId(db.students, input.id, 'Student').nfcUid : input.nfcUid);
  need(!nfcUid || /^[0-9A-F]{4,40}$/.test(nfcUid) && nfcUid.length % 2 === 0, 'NFC UID must contain hexadecimal bytes.');
  need(!db.students.some(s => s.id !== input.id && s.studentNumber === studentNumber), 'Student number already registered.');
  need(!nfcUid || !db.students.some(s => s.id !== input.id && s.nfcUid === nfcUid), 'NFC UID already registered.');
  const student = input.id ? byId(db.students, input.id, 'Student') : {
    id: randomUUID(),
    qrToken: randomBytes(24).toString('hex')
  };
  Object.assign(student, {
    studentNumber,
    name,
    blockId: input.blockId,
    nfcUid: nfcUid || null,
    active: input.active !== false
  });
  if (!input.id) db.students.push(student);
  audit(db, user, 'student.saved', student.studentNumber);
  return student;
}
function saveBlock(db, user, input) {
  admin(user);
  need(['IT', 'CS'].includes(input.program), 'Program must be IT or CS.');
  const code = text(input.code, 'Block code', 20),
    term = text(input.term, 'Academic term', 60);
  need(!db.blocks.some(b => b.program === input.program && b.code === code && b.term === term), 'This program/block/term already exists.');
  const block = {
    id: randomUUID(),
    program: input.program,
    code,
    term
  };
  db.blocks.push(block);
  audit(db, user, 'block.created', `${block.program} ${code}`);
  return block;
}
function saveRep(db, user, input) {
  admin(user);
  const name = text(input.name, 'Name'),
    username = text(input.username, 'Username', 50);
  need(Array.isArray(input.blockIds) && input.blockIds.length > 0, 'Assign at least one block.');
  input.blockIds.forEach(id => byId(db.blocks, id, 'Block'));
  need(!db.users.some(u => u.username === username && u.id !== input.id), 'Username already exists.');
  const existing = input.id ? byId(db.users, input.id, 'Representative') : null;
  need(!existing || existing.role === 'rep', 'Only representative accounts can be edited here.');
  if (!existing || input.password) need(typeof input.password === 'string' && input.password.length >= 12 && input.password.length <= 128, 'Use a password of 12–128 characters.');
  const row = existing || {
    id: randomUUID(),
    role: 'rep'
  };
  Object.assign(row, {
    name,
    username,
    blockIds: [...new Set(input.blockIds)],
    active: input.active !== false
  });
  if (input.password) row.passwordHash = hashPassword(input.password);
  if (!existing) db.users.push(row);
  audit(db, user, 'representative.saved', username);
  return publicUser(row);
}
function publicUser(user) {
  const {
    passwordHash,
    ...safe
  } = user;
  return safe;
}
function openClass(db, user, input) {
  blockAccess(user, input.blockId);
  byId(db.blocks, input.blockId, 'Block');
  const room = byId(db.rooms, input.roomId, 'Room');
  need(room.monitored, 'CAFAD is outside monitoring scope.');
  need(!db.events.some(e => e.status === 'active'), 'Class attendance is locked during an active evacuation.');
  need(!db.classes.some(c => c.blockId === input.blockId && c.date === day() && c.status === 'open'), 'This block already has an open session today.');
  const row = {
    id: randomUUID(),
    blockId: input.blockId,
    roomId: room.id,
    date: day(),
    status: 'open',
    openedAt: now(),
    updatedAt: now(),
    userId: user.id
  };
  db.classes.push(row);
  audit(db, user, 'class.opened', row.id);
  return row;
}
function updateClass(db, user, id, input) {
  const row = byId(db.classes, id, 'Class session');
  blockAccess(user, row.blockId);
  need(row.status === 'open' && row.date === day(), 'This class session is no longer current.');
  need(!db.events.some(e => e.status === 'active'), 'Class attendance is locked during evacuation.');
  if (input.roomId) {
    const room = byId(db.rooms, input.roomId, 'Room');
    need(room.monitored, 'Room outside scope.');
    row.roomId = room.id;
  }
  if (input.studentId) {
    const student = byId(db.students, input.studentId, 'Student');
    need(student.active && student.blockId === row.blockId, 'Student does not belong to this block.');
    need(typeof input.present === 'boolean', 'Present must be true or false.');
    if (input.present) need(!db.attendance.some(a => a.studentId === student.id && a.present && a.classId !== id && db.classes.some(c => c.id === a.classId && c.date === day() && c.status === 'open')), 'Student already present in another session.');
    let a = db.attendance.find(a => a.studentId === student.id && a.classId === id);
    if (!a) {
      a = {
        id: randomUUID(),
        classId: id,
        studentId: student.id
      };
      db.attendance.push(a);
    }
    Object.assign(a, {
      present: input.present,
      updatedAt: now()
    });
  }
  if (input.close === true) row.status = 'closed';
  row.updatedAt = now();
  audit(db, user, 'class.updated', row.id);
  return row;
}
function startEvent(db, user, input) {
  admin(user);
  need(!db.events.some(e => e.status === 'active'), 'An evacuation event is already active.', 409);
  need(['drill', 'emergency'].includes(input.type), 'Choose drill or emergency.');
  const current = db.classes.filter(c => c.status === 'open' && c.date === day());
  const event = {
    id: randomUUID(),
    name: text(input.name, 'Event name'),
    area: text(input.area, 'Evacuation area'),
    type: input.type,
    status: 'active',
    startedAt: now(),
    endedAt: null,
    createdBy: user.id,
    coverage: db.blocks.map(b => ({
      blockId: b.id,
      blockLabel: `${b.program} ${b.code}`,
      term: b.term,
      session: structuredClone(current.find(c => c.blockId === b.id) || null)
    }))
  };
  db.events.push(event);
  for (const a of db.attendance.filter(a => a.present && current.some(c => c.id === a.classId))) {
    const s = db.students.find(s => s.id === a.studentId && s.active);
    if (!s) continue;
    const c = current.find(c => c.id === a.classId);
    addParticipant(db, event, s, c.roomId, true);
  }
  audit(db, user, 'event.started', event.name);
  return event;
}
function addParticipant(db, event, s, roomId, expected) {
  let p = db.participants.find(p => p.eventId === event.id && p.studentId === s.id);
  if (p) return p;
  const block = byId(db.blocks, s.blockId),
    room = roomId ? byId(db.rooms, roomId) : null;
  p = {
    id: randomUUID(),
    eventId: event.id,
    studentId: s.id,
    studentNumber: s.studentNumber,
    name: s.name,
    blockId: s.blockId,
    blockLabel: `${block.program} ${block.code}`,
    program: block.program,
    term: block.term,
    roomId: room?.id || null,
    roomName: room?.name || null,
    floor: room?.floor || null,
    expected
  };
  db.participants.push(p);
  return p;
}
function resolveStudent(db, input) {
  let s;
  if (input.method === 'nfc') s = db.students.find(s => s.nfcUid && s.nfcUid === uid(input.credential));else if (input.method === 'qr') s = db.students.find(s => s.qrToken === String(input.credential || '').replace(/^safetap:/, ''));else {
    need(['manual', 'ocr'].includes(input.method), 'Unknown scan method.');
    need(input.confirmed === true, 'Confirm the student before recording.');
    s = db.students.find(s => s.id === input.studentId);
  }
  need(s && s.active, 'Student/credential is not registered or is inactive.', 404);
  return s;
}
function checkin(db, user, input) {
  need(typeof input.submissionId === 'string' && /^[\w-]{10,80}$/.test(input.submissionId), 'Valid submission ID required.');
  const prior = db.submissions.find(x => x.id === input.submissionId);
  if (prior) {
    need(prior.userId === user.id && prior.eventId === input.eventId, 'Submission ID conflict.', 409);
    return prior.result;
  }
  const event = byId(db.events, input.eventId, 'Event');
  const student = resolveStudent(db, input);
  const capturedAt = String(input.capturedAt || now());
  need(Number.isFinite(Date.parse(capturedAt)), 'Invalid capture time.');
  need(Date.parse(capturedAt) >= Date.parse(event.startedAt) - 60000 && Date.parse(capturedAt) <= Date.now() + 300000, 'Capture time is outside the event window.');
  let check = db.checkins.find(c => c.eventId === event.id && c.studentId === student.id);
  let status;
  if (check && check.status !== 'void') status = check.status === 'confirmed' ? 'duplicate' : 'review';else {
    const values = {
      eventId: event.id,
      studentId: student.id,
      userId: user.id,
      actor: user.name,
      method: input.method,
      capturedAt,
      receivedAt: now(),
      status: event.status === 'active' ? 'confirmed' : 'review',
      reason: null
    };
    if (check) Object.assign(check, values);else {
      check = {
        id: randomUUID(),
        ...values
      };
      db.checkins.push(check);
    }
    if (check.status === 'confirmed') addParticipant(db, event, student, null, false);
    status = check.status;
    audit(db, user, `checkin.${status}`, `${event.name}: ${student.studentNumber}`);
  }
  const result = {
    status,
    studentId: student.id,
    name: student.name,
    checkinId: check.id
  };
  db.submissions.push({
    id: input.submissionId,
    userId: user.id,
    eventId: event.id,
    result,
    receivedAt: now()
  });
  return result;
}
function reviewCheckin(db, user, id, input) {
  admin(user);
  const check = byId(db.checkins, id, 'Check-in');
  const reason = text(input.reason, 'Correction reason', 300);
  need(['approve', 'void'].includes(input.action), 'Choose approve or void.');
  if (input.action === 'approve') {
    need(check.status === 'review', 'Only pending reviews can be approved.');
    addParticipant(db, byId(db.events, check.eventId), byId(db.students, check.studentId), null, false);
    check.status = 'confirmed';
  } else check.status = 'void';
  check.reason = reason;
  audit(db, user, `checkin.${input.action}`, `${check.id}: ${reason}`);
  return check;
}
function correctBaseline(db, user, eventId, input) {
  admin(user);
  const event = byId(db.events, eventId);
  const reason = text(input.reason, 'Correction reason', 300);
  need(typeof input.expected === 'boolean', 'Expected must be true or false.');
  const s = byId(db.students, input.studentId);
  let p = db.participants.find(p => p.eventId === eventId && p.studentId === s.id);
  if (input.expected) {
    const room = byId(db.rooms, input.roomId, 'Room');
    need(room.monitored, 'Room outside scope.');
    p = p || addParticipant(db, event, s, room.id, true);
    Object.assign(p, {
      expected: true,
      roomId: room.id,
      roomName: room.name,
      floor: room.floor
    });
  } else {
    need(p, 'Student is not in this event.');
    p.expected = false;
  }
  audit(db, user, 'baseline.corrected', `${event.name}: ${s.studentNumber}: ${reason}`);
  return p;
}
function eventSummary(db, eventId) {
  const event = byId(db.events, eventId, 'Event');
  const checks = db.checkins.filter(c => c.eventId === eventId);
  const people = db.participants.filter(p => p.eventId === eventId).map(p => ({
    ...p,
    safe: checks.some(c => c.studentId === p.studentId && c.status === 'confirmed')
  }));
  const expected = people.filter(p => p.expected),
    safe = expected.filter(p => p.safe).length;
  return {
    event,
    people,
    checkins: checks,
    total: expected.length,
    safe,
    unaccounted: expected.length - safe,
    additional: people.filter(p => !p.expected && p.safe).length
  };
}
function snapshot(db, user) {
  const active = db.events.find(e => e.status === 'active');
  return {
    user: publicUser(user),
    blocks: db.blocks,
    rooms: db.rooms,
    students: db.students.map(({
      nfcUid,
      qrToken,
      ...s
    }) => s),
    classes: db.classes.filter(c => c.date === day() && (user.role === 'admin' || user.blockIds.includes(c.blockId))),
    attendance: db.attendance.filter(a => db.classes.some(c => c.id === a.classId && c.date === day() && (user.role === 'admin' || user.blockIds.includes(c.blockId)))),
    active: active ? eventSummary(db, active.id) : null,
    history: db.events.slice().sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map(e => {
      const {
        people,
        checkins,
        ...summary
      } = eventSummary(db, e.id);
      return summary;
    }),
    reps: user.role === 'admin' ? db.users.filter(u => u.role === 'rep').map(publicUser) : [],
    audit: user.role === 'admin' ? db.audit.slice().sort((a, b) => b.time.localeCompare(a.time)).slice(0, 80) : [],
    serverTime: now(),
    date: day()
  };
}
module.exports = {
  TABLES,
  Fault,
  need,
  text,
  admin,
  byId,
  now,
  day,
  uid,
  audit,
  baseDb,
  publicUser,
  saveStudent,
  saveBlock,
  saveRep,
  openClass,
  updateClass,
  startEvent,
  checkin,
  reviewCheckin,
  correctBaseline,
  eventSummary,
  snapshot
};
