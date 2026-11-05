'use strict';

const {createHash} = require('node:crypto');

// Only fields needed by on-device matching leave the server in the download.
function directoryData(db, includeInactive = false) {
  return {
    students: db.students.filter(student => includeInactive || student.active).map(student => ({
      id: student.id,
      studentNumber: student.studentNumber,
      name: student.name,
      blockId: student.blockId,
      active: student.active,
      nfcUid: student.nfcUid,
      qrToken: student.qrToken
    })),
    blocks: db.blocks
  };
}

function directoryVersion(db, includeInactive = false) {
  return createHash('sha256').update(JSON.stringify(directoryData(db, includeInactive))).digest('hex');
}

function offlinePack(db, user, knownVersion) {
  const version = directoryVersion(db);
  return {
    userId: user.id,
    version,
    event: require('./domain').eventForUser(db.events.find(event => event.status === 'active') || null, user),
    preparedAt: new Date().toISOString(),
    ...(knownVersion === version ? {unchanged: true} : directoryData(db))
  };
}

module.exports = {directoryVersion, offlinePack};
