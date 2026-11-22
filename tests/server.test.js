'use strict';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SERVER_PATH = path.join(__dirname, '..', 'src', 'server.js');

// Pick a free port by listening on port 0, then closing the probe server.
function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

describe('server', () => {
  let port;
  let child;

  // Raw request. Uses node:http so paths such as /../package.json are sent unmodified.
  function request(method, reqPath, body) {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? null : JSON.stringify(body);
      const headers = payload
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        : {};
      const req = http.request(
        { host: '127.0.0.1', port, method, path: reqPath, headers },
        (res) => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => resolve({ status: res.statusCode, text: data }));
        }
      );
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  // Retry GET / until the server answers or the timeout passes.
  async function waitForServer(timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    let lastErr;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`server exited early with code ${child.exitCode}`);
      try {
        await request('GET', '/');
        return;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 150));
      }
    }
    throw new Error(`server did not start on port ${port}: ${lastErr && lastErr.message}`);
  }

  before(async () => {
    port = await getFreePort();
    child = spawn(process.execPath, [SERVER_PATH], {
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await waitForServer();
  });

  after(() => {
    if (child && child.exitCode === null) child.kill();
  });

  test('POST /api/match rejects input containing a 12-digit ID with 400', async () => {
    const res = await request('POST', '/api/match', { text: 'my number is 123456789012' });
    assert.equal(res.status, 400);
  });

  test('POST /api/match returns results including nsap-old-age-pension', async () => {
    const res = await request('POST', '/api/match', { text: 'I am 68, widow, BPL' });
    assert.equal(res.status, 200);
    const body = JSON.parse(res.text);
    assert.ok(Array.isArray(body.results), 'expected a results array');
    assert.ok(
      body.results.some((r) => r.scheme_id === 'nsap-old-age-pension'),
      'expected nsap-old-age-pension in results'
    );
  });

  test('GET /../package.json path traversal returns 404', async () => {
    const res = await request('GET', '/../package.json');
    assert.equal(res.status, 404);
    assert.ok(!res.text.includes('"name"'), 'must not serve package.json content');
  });
});

