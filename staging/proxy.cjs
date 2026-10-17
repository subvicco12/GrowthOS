'use strict';
const https = require('node:https');
const http = require('node:http');
const fs = require('node:fs');
const expected = process.env.GROWTHOS_STAGING_PROXY_HOST;
const backend = process.env.GROWTHOS_STAGING_BACKEND;
if (expected !== 'growthos.test:34443' || backend !== 'http://app:3000') throw Error('REFUSED: unexpected staging proxy configuration');
const server = https.createServer({ key: fs.readFileSync('/certs/key.pem'), cert: fs.readFileSync('/certs/cert.pem') }, (req, res) => {
  if (req.headers.host !== expected) { res.writeHead(421, { 'Cache-Control': 'no-store' }); res.end(); return; }
  const upstream = http.request(backend + req.url, {
    method: req.method,
    headers: { ...req.headers, host: expected, 'x-forwarded-proto': 'https' },
    timeout: 5000
  }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.pipe(upstream);
});
server.listen(34443, '0.0.0.0');
