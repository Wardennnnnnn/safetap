'use strict';

const {
  randomBytes,
  scryptSync,
  timingSafeEqual
} = require('node:crypto');
function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password, encoded) {
  try {
    const [salt, hex] = encoded.split(':');
    const actual = scryptSync(String(password), salt, 64);
    const expected = Buffer.from(hex, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
module.exports = {
  hashPassword,
  verifyPassword
};
