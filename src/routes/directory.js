'use strict';

const {randomBytes} = require('node:crypto');
const domain = require('../domain');

module.exports = function mountDirectoryRoutes({mutation}) {
  mutation('/api/students', (db, user, req) => domain.saveStudent(db, user, req.body));
  mutation('/api/students/import', (db, user, req) => {
    domain.admin(user);
    domain.need(Array.isArray(req.body.rows) && req.body.rows.length > 0 && req.body.rows.length <= 1000, 'Import 1–1000 records.');
    return {
      count: req.body.rows.map(row => domain.saveStudent(db, user, row)).length
    };
  });
  mutation('/api/students/:id/rotate-qr', (db, user, req) => {
    domain.admin(user);
    const s = domain.byId(db.students, req.params.id);
    s.qrToken = randomBytes(24).toString('hex');
    domain.audit(db, user, 'qr.rotated', s.studentNumber);
    return {
      ok: true
    };
  });
  mutation('/api/blocks', (db, user, req) => domain.saveBlock(db, user, req.body));
  mutation('/api/reps', (db, user, req) => domain.saveRep(db, user, req.body));
};
