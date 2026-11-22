'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_DIR = path.join(__dirname, '..', 'data', 'schemes');
const ALLOWED_OPS = ['eq', 'neq', 'in', 'gte', 'lte', 'bool'];

// Load every *.json scheme in dir, sorted by name. Throws with the file name on bad JSON.
function loadSchemes(dir = DEFAULT_DIR) {
  const schemes = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const file = path.join(dir, f);
      try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (err) {
        throw new Error(`Invalid JSON in ${file}: ${err.message}`);
      }
    });
  return schemes.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

// Return a list of problem strings; empty array means the scheme is valid.
function validateScheme(s) {
  const problems = [];
  if (!s || typeof s !== 'object') return ['scheme is not an object'];

  if (!s.id) problems.push('missing id');
  if (!s.name) problems.push('missing name');
  if (typeof s.official_url !== 'string' || !s.official_url.startsWith('https://')) {
    problems.push('official_url must start with https://');
  }
  if (!Array.isArray(s.rules)) problems.push('rules must be an array');
  if (!Array.isArray(s.documents)) problems.push('documents must be an array');
  if (!Array.isArray(s.steps)) problems.push('steps must be an array');

  (Array.isArray(s.rules) ? s.rules : []).forEach((r, i) => {
    const label = `rule[${i}]${r && r.id ? ` (${r.id})` : ''}`;
    if (!r || typeof r !== 'object') {
      problems.push(`${label} is not an object`);
      return;
    }
    if (!r.id) problems.push(`${label} missing id`);
    if (!r.field) problems.push(`${label} missing field`);
    if (!ALLOWED_OPS.includes(r.op)) problems.push(`${label} has invalid op "${r.op}"`);
    if (r.value === undefined) problems.push(`${label} missing value`);
  });

  return problems;
}

module.exports = { loadSchemes, validateScheme, ALLOWED_OPS };
