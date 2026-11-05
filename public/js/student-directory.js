'use strict';

globalThis.SafeTapDirectory = (() => {
  const normalizeUid = value => String(value || '').replace(/[:\s-]/g, '').toUpperCase();
  let savedStudents, index;

  function lookup(students) {
    if (savedStudents === students) return index;
    savedStudents = students;
    index = {id: new Map(), nfc: new Map(), qr: new Map()};
    for (const student of students) {
      if (!student.active) continue;
      index.id.set(student.id, student);
      if (student.nfcUid) index.nfc.set(normalizeUid(student.nfcUid), student);
      if (student.qrToken) index.qr.set(student.qrToken, student);
    }
    return index;
  }

  function resolve(students, scan) {
    const directory = lookup(students);
    if (scan.method === 'nfc') return directory.nfc.get(normalizeUid(scan.credential));
    if (scan.method === 'qr') return directory.qr.get(String(scan.credential || '').replace(/^safetap:/, ''));
    return directory.id.get(scan.studentId);
  }

  function search(students, query) {
    const text = query.trim().toLowerCase();
    return students.filter(student => student.active &&
      `${student.studentNumber} ${student.name}`.toLowerCase().includes(text)).slice(0, 12);
  }

  return {normalizeUid, resolve, search};
})();
