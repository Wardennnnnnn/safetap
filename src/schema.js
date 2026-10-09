'use strict';

// Field names deliberately match domain objects; SQL values always use parameters.
const S = 'VARCHAR(191)',
  T = 'VARCHAR(40)',
  B = 'BOOLEAN',
  J = 'JSON';
const schema = {
  users: {
    id: S,
    name: S,
    username: S,
    passwordHash: 'VARCHAR(200)',
    role: T,
    blockIds: J,
    active: B
  },
  blocks: {
    id: S,
    program: T,
    code: T,
    term: S
  },
  rooms: {
    id: S,
    name: S,
    floor: 'INT',
    monitored: B,
    position: 'INT'
  },
  students: {
    id: S,
    studentNumber: S,
    name: S,
    blockId: S,
    nfcUid: S,
    qrToken: S,
    active: B
  },
  classes: {
    id: S,
    blockId: S,
    roomId: S,
    date: T,
    status: T,
    openedAt: T,
    updatedAt: T,
    userId: S
  },
  attendance: {
    id: S,
    classId: S,
    studentId: S,
    present: B,
    updatedAt: T
  },
  events: {
    id: S,
    name: S,
    area: S,
    type: T,
    status: T,
    startedAt: T,
    endedAt: T,
    createdBy: S,
    coverage: J
  },
  participants: {
    id: S,
    eventId: S,
    studentId: S,
    studentNumber: S,
    name: S,
    blockId: S,
    blockLabel: S,
    program: T,
    term: S,
    roomId: S,
    roomName: S,
    floor: 'INT',
    expected: B
  },
  checkins: {
    id: S,
    eventId: S,
    studentId: S,
    userId: S,
    actor: S,
    method: T,
    capturedAt: T,
    receivedAt: T,
    status: T,
    reason: 'TEXT'
  },
  submissions: {
    id: S,
    userId: S,
    eventId: S,
    result: J,
    receivedAt: T
  },
  audit: {
    id: S,
    userId: S,
    actor: S,
    action: S,
    detail: 'TEXT',
    time: T
  }
};
const extra = {
  users: ['UNIQUE KEY (`username`)'],
  blocks: ['UNIQUE KEY (`program`,`code`,`term`)'],
  students: ['UNIQUE KEY (`studentNumber`)', 'UNIQUE KEY (`nfcUid`)', 'UNIQUE KEY (`qrToken`)', 'FOREIGN KEY (`blockId`) REFERENCES `blocks` (`id`)'],
  classes: ['FOREIGN KEY (`blockId`) REFERENCES `blocks` (`id`)', 'FOREIGN KEY (`roomId`) REFERENCES `rooms` (`id`)'],
  attendance: ['UNIQUE KEY (`classId`,`studentId`)', 'FOREIGN KEY (`classId`) REFERENCES `classes` (`id`)', 'FOREIGN KEY (`studentId`) REFERENCES `students` (`id`)'],
  participants: ['UNIQUE KEY (`eventId`,`studentId`)', 'FOREIGN KEY (`eventId`) REFERENCES `events` (`id`)', 'FOREIGN KEY (`studentId`) REFERENCES `students` (`id`)'],
  checkins: ['UNIQUE KEY (`eventId`,`studentId`)', 'FOREIGN KEY (`eventId`) REFERENCES `events` (`id`)', 'FOREIGN KEY (`studentId`) REFERENCES `students` (`id`)'],
  submissions: ['FOREIGN KEY (`eventId`) REFERENCES `events` (`id`)']
};
const migrations = ['CREATE TABLE IF NOT EXISTS app_lock (id INT PRIMARY KEY) ENGINE=InnoDB', 'INSERT IGNORE INTO app_lock (id) VALUES (1)', ...Object.entries(schema).map(([table, fields]) => `CREATE TABLE IF NOT EXISTS \`${table}\` (${[...Object.entries(fields).map(([k, type]) => `\`${k}\` ${type}${k === 'id' ? ' PRIMARY KEY' : ''}`), ...(extra[table] || [])].join(', ')}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`)];
module.exports = {
  schema,
  migrations
};
