'use strict';

const domain = require('../domain');
const csv = value => '"' + String(value ?? '').replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""') + '"';

module.exports = function mountReportRoutes({app}) {
  app.get('/api/events/:id', (req, res) => res.json(domain.eventSummary(req.db, req.params.id, req.user)));
  app.get('/api/events/:id/export', (req, res) => {
    domain.admin(req.user);
    const report = domain.eventSummary(req.db, req.params.id);
    const rows = [['Event', 'Student number', 'Name', 'Program/block', 'Term', 'Last recorded room', 'Baseline', 'Status'], ...report.people.map(p => [report.event.name, p.studentNumber, p.name, p.blockLabel, p.term, p.roomName || 'Unknown', p.expected ? 'Expected' : 'Additional', p.safe ? 'Accounted' : 'Unaccounted'])];
    res.type('text/csv').attachment(`safetap-${report.event.id}.csv`).send('\uFEFF' + rows.map(row => row.map(csv).join(',')).join('\r\n'));
  });
  app.get('/api/students/:id/qr', async (req, res, next) => {
    try {
      domain.admin(req.user);
      const student = domain.byId(req.db.students, req.params.id);
      let QR;
      try {
        QR = require('qrcode');
      } catch {
        throw new domain.Fault('QR generation dependency is missing. Run npm install on the server.', 503);
      }
      res.json({
        student: domain.publicUser(student),
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
};
