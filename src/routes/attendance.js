'use strict';

const domain = require('../domain');

function scanBatch(req) {
  const scans = req.body?.scans;
  domain.need(Array.isArray(scans) && scans.length <= 100, 'Sync at most 100 records per batch.');
  domain.need(scans.every(scan => scan && typeof scan === 'object' && !Array.isArray(scan)), 'Invalid scan record.');
  return scans;
}

module.exports = function mountAttendanceRoutes({mutation}) {
  mutation('/api/classes', (db, user, req) => domain.openClass(db, user, req.body));
  mutation('/api/classes/:id', (db, user, req) => domain.updateClass(db, user, req.params.id, req.body));
  mutation('/api/events', (db, user, req) => domain.startEvent(db, user, req.body));
  mutation('/api/events/:id/close', (db, user, req) => {
    domain.admin(user);
    const e = domain.byId(db.events, req.params.id);
    domain.need(e.status === 'active', 'Event is already closed.');
    e.status = 'closed';
    e.endedAt = domain.now();
    domain.audit(db, user, 'event.closed', e.name);
    return e;
  });
  mutation('/api/events/:id/baseline', (db, user, req) => domain.correctBaseline(db, user, req.params.id, req.body));
  mutation('/api/checkins', (db, user, req) => domain.checkin(db, user, req.body), req => scanBatch({body: {scans: [req.body]}}));
  mutation('/api/checkins/:id/review', (db, user, req) => domain.reviewCheckin(db, user, req.params.id, req.body));
  mutation('/api/sync', (db, user, req) => {
    domain.need(Array.isArray(req.body.scans) && req.body.scans.length <= 100, 'Sync at most 100 records per batch.');
    return {
      results: req.body.scans.map(scan => {
        try {
          return {
            submissionId: scan.submissionId,
            ...domain.checkin(db, user, scan)
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
  }, scanBatch);
};
