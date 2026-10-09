'use strict';

const http = require('node:http');
const {
  Socket
} = require('node:net');
// Exercise the real Express middleware stack without requiring a listening port.
function request(app, {
  path = '/',
  method = 'GET',
  headers = {},
  body
} = {}) {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const req = new http.IncomingMessage(socket);
    req.method = method;
    req.url = path;
    req.headers = {
      host: 'localhost',
      ...headers
    };
    req.connection = socket;
    const raw = body === undefined ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    if (raw) {
      req.headers['content-type'] ||= 'application/json';
      req.headers['content-length'] = String(raw.length);
    }
    const res = new http.ServerResponse(req);
    const chunks = [];
    res.write = chunk => {
      if (chunk) chunks.push(Buffer.from(chunk));
      return true;
    };
    res.end = chunk => {
      if (chunk) chunks.push(Buffer.from(chunk));
      const content = Buffer.concat(chunks).toString();
      res.emit('finish');
      resolve({
        status: res.statusCode,
        headers: res.getHeaders(),
        body: content
      });
      return res;
    };
    app(req, res, error => reject(error || new Error('Request was not handled.')));
    if (raw) req.push(raw);
    req.push(null);
  });
}
module.exports = {
  request
};
