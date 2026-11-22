'use strict';

// Plain node:http server for the Scheme Finder. Stores nothing on the server:
// reminders and tracking live in the browser's localStorage.

const http = require('http');
const fs = require('fs');
const path = require('path');

const { loadSchemes } = require('./schemes');
const { matchAll, matchScheme } = require('./matcher');
const { parseProfile } = require('./parser');
const { sanitizeText, containsSensitiveId } = require('./sanitize');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_BODY_BYTES = 10 * 1024; // 10 KB request limit
const HOST = '127.0.0.1';

const DISCLAIMER =
  'These are schemes you are LIKELY eligible for, based on public information. ' +
  'Nothing here is a guarantee; the official authority decides.';

// Whitelisted static routes -> file inside public/. Anything else is a 404.
const STATIC_FILES = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'application/javascript; charset=utf-8' },
  '/styles.css': { file: 'styles.css', type: 'text/css; charset=utf-8' },
};

// Send a JSON response with the given status code.
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

// Serve one whitelisted static file. Path traversal is impossible because
// only the fixed names above are ever joined to PUBLIC_DIR, but we still
// verify the resolved path stays inside public/.
function serveStatic(res, route) {
  const entry = STATIC_FILES[route];
  const full = path.resolve(PUBLIC_DIR, entry.file);
  if (!full.startsWith(PUBLIC_DIR + path.sep)) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }
  fs.readFile(full, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    res.writeHead(200, {
      'Content-Type': entry.type,
      'Content-Length': data.length,
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  });
}

// Read and parse a JSON body, enforcing the size limit.
// Resolves to the parsed object, or rejects with a `status` property set.
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooBig = false;

    req.on('data', (chunk) => {
      if (tooBig) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooBig = true;
        reject(Object.assign(new Error('too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', () => reject(Object.assign(new Error('read error'), { status: 400 })));
    req.on('end', () => {
      if (tooBig) return;
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        const parsed = JSON.parse(text);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('not an object');
        }
        resolve(parsed);
      } catch (err) {
        reject(Object.assign(new Error('invalid json'), { status: 400 }));
      }
    });
  });
}

// POST /api/match: parse free text, match all schemes, keep likely/unknown.
async function handleMatch(req, res) {
  const body = await readJsonBody(req);
  const text = body.text;
  if (typeof text !== 'string') {
    sendJson(res, 400, { error: 'Please describe your situation in words.' });
    return;
  }

  // Check the raw text so a sensitive number is refused, not silently cleaned.
  if (containsSensitiveId(text)) {
    sendJson(res, 400, {
      error: 'Please do not type Aadhaar, PAN, bank or other ID numbers. Describe your situation in words.',
    });
    return;
  }

  const clean = sanitizeText(text);
  const { profile, understood, unclear } = parseProfile(clean);
  const all = matchAll(loadSchemes(), profile);
  const results = all.filter((r) => r.status === 'likely' || r.status === 'unknown');

  // profile is echoed back so the client can request checklists for these results.
  // It holds only the parsed categories (no ID numbers; those were refused above).
  sendJson(res, 200, { understood, unclear, results, profile, disclaimer: DISCLAIMER });
}

// POST /api/checklist: documents, steps and links for one scheme.
async function handleChecklist(req, res) {
  const body = await readJsonBody(req);
  const schemeId = body.schemeId;
  const profile = body.profile && typeof body.profile === 'object' ? body.profile : {};

  const scheme = typeof schemeId === 'string'
    ? loadSchemes().find((s) => s.id === schemeId)
    : undefined;
  if (!scheme) {
    sendJson(res, 404, { error: 'Scheme not found' });
    return;
  }

  const m = matchScheme(scheme, profile);
  sendJson(res, 200, {
    scheme_id: m.scheme_id,
    name: m.name,
    documents: m.documents,
    steps: m.steps,
    official_url: m.official_url,
    application_url: m.application_url,
  });
}

// Route each request; any unexpected error becomes a generic 500 (no input echoed).
async function route(req, res) {
  const url = new URL(req.url, `http://${HOST}`);
  const pathname = url.pathname;

  if (req.method === 'GET' && Object.prototype.hasOwnProperty.call(STATIC_FILES, pathname)) {
    serveStatic(res, pathname);
    return;
  }
  if (req.method === 'POST' && pathname === '/api/match') {
    await handleMatch(req, res);
    return;
  }
  if (req.method === 'POST' && pathname === '/api/checklist') {
    await handleChecklist(req, res);
    return;
  }
  sendJson(res, 404, { error: 'Not found' });
}

function createServer() {
  return http.createServer((req, res) => {
    route(req, res).catch((err) => {
      // Map known client errors; everything else is a 500 with a fixed message.
      if (err && err.status === 400) {
        sendJson(res, 400, { error: 'Invalid request body.' });
      } else if (err && err.status === 413) {
        sendJson(res, 413, { error: 'Request is too large. Keep it under 10 KB.' });
      } else {
        sendJson(res, 500, { error: 'Something went wrong. Please try again.' });
      }
    });
  });
}

// Start only when run directly (node src/server.js), so tests can import createServer.
if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, HOST, () => {
    console.log(`Scheme Finder running at http://${HOST}:${port}`);
  });
}

module.exports = { createServer };
