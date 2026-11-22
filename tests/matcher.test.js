'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { loadSchemes, validateScheme } = require('../src/schemes');
const { matchAll } = require('../src/matcher');

const SCHEMES_DIR = path.join(__dirname, '..', 'data', 'schemes');

// Synthetic sample profiles only (no real people).
const SAMPLE_A = { is_student: true, category: 'SC', annual_income: 200000, age: 20, gender: 'male' };
const SAMPLE_B = { age: 68, bpl_card: true, gender: 'female' };
const SAMPLE_C = {};
const SAMPLE_D = { age: 45, occupation: 'daily_wage', monthly_income: 9000, in_social_security: false };

function findById(results, id) {
  const hit = results.find((r) => r.scheme_id === id);
  assert.ok(hit, `expected scheme "${id}" in results`);
  return hit;
}

test('sample A (SC student) is likely for post-matric-scholarship-sc with a reason', () => {
  const results = matchAll(loadSchemes(SCHEMES_DIR), SAMPLE_A);
  const hit = findById(results, 'post-matric-scholarship-sc');
  assert.equal(hit.status, 'likely');
  assert.ok(Array.isArray(hit.reasons_met));
  assert.ok(hit.reasons_met.length > 0, 'expected at least one reasons_met entry');
});

test('sample B (elderly BPL woman) is likely for NSAP old age pension and PM Ujjwala Yojana', () => {
  const results = matchAll(loadSchemes(SCHEMES_DIR), SAMPLE_B);
  assert.equal(findById(results, 'nsap-old-age-pension').status, 'likely');
  assert.equal(findById(results, 'pm-ujjwala-yojana').status, 'likely');
});

test('sample C (empty profile) never yields a likely status', () => {
  const results = matchAll(loadSchemes(SCHEMES_DIR), SAMPLE_C);
  for (const r of results) {
    assert.notEqual(r.status, 'likely', `${r.scheme_id} must not be likely with no data`);
  }
  const nsap = findById(results, 'nsap-old-age-pension');
  assert.ok(nsap.status === 'unknown' || nsap.status === 'unlikely');
});

test('sample D (over age) is not likely for PM Shram Yogi Maandhan', () => {
  const results = matchAll(loadSchemes(SCHEMES_DIR), SAMPLE_D);
  const hit = findById(results, 'pm-shram-yogi-maandhan');
  assert.notEqual(hit.status, 'likely');
  assert.equal(hit.status, 'unlikely');
});

test('every match result has an https official_url and no "guaranteed" wording', () => {
  const schemes = loadSchemes(SCHEMES_DIR);
  for (const profile of [SAMPLE_A, SAMPLE_B, SAMPLE_C, SAMPLE_D]) {
    for (const r of matchAll(schemes, profile)) {
      assert.ok(
        typeof r.official_url === 'string' && r.official_url.startsWith('https://'),
        `${r.scheme_id} official_url must start with https://`
      );
      const text = JSON.stringify(r).toLowerCase();
      assert.ok(!text.includes('guaranteed'), `${r.scheme_id} must not contain "guaranteed"`);
    }
  }
});

test('all scheme files pass validateScheme with no problems', () => {
  const schemes = loadSchemes(SCHEMES_DIR);
  assert.ok(schemes.length > 0, 'expected at least one scheme file');
  for (const s of schemes) {
    assert.deepEqual(validateScheme(s), [], `problems in scheme "${s.id}"`);
  }
});

test('each scheme has a non-empty documents array and steps array', () => {
  for (const s of loadSchemes(SCHEMES_DIR)) {
    assert.ok(Array.isArray(s.documents) && s.documents.length > 0, `${s.id} needs documents`);
    assert.ok(Array.isArray(s.steps) && s.steps.length > 0, `${s.id} needs steps`);
  }
});

