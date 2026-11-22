'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseProfile } = require('../src/parser');
const { containsSensitiveId } = require('../src/sanitize');

test('parses age, gender and BPL card from a widow description', () => {
  const { profile } = parseProfile('I am a 68 year old widow, BPL card holder');
  assert.equal(profile.age, 68);
  assert.equal(profile.gender, 'female');
  assert.equal(profile.bpl_card, true);
});

test('parses student, SC category and annual income from 2 lakh', () => {
  const { profile } = parseProfile('I am a student from an SC family, income 2 lakh a year');
  assert.equal(profile.is_student, true);
  assert.equal(profile.category, 'SC');
  assert.equal(profile.annual_income, 200000);
});

test('containsSensitiveId flags a 12-digit Aadhaar-shaped number', () => {
  assert.equal(containsSensitiveId('my aadhaar is 1234 5678 9012'), true);
});

test('containsSensitiveId does not flag a plain age', () => {
  assert.equal(containsSensitiveId('I am 45'), false);
});

test('parseProfile output never contains a 12-digit value', () => {
  const inputs = [
    'I am 68, widow, BPL, aadhaar 1234 5678 9012',
    'I am 68, widow, BPL, aadhaar 123456789012',
    'I am a student from an SC family, income 2 lakh a year',
  ];
  for (const text of inputs) {
    const out = JSON.stringify(parseProfile(text));
    assert.ok(!/\d{12}/.test(out), `output leaked a 12-digit value for: ${text}`);
    assert.ok(!/\d{4}[\s-]?\d{4}[\s-]?\d{4}/.test(out), `output leaked an Aadhaar-shaped value for: ${text}`);
  }
});

test('parses a Devanagari widow with age and BPL card', () => {
  const { profile } = parseProfile('मैं 68 साल की विधवा हूँ, बीपीएल कार्ड है');
  assert.equal(profile.age, 68);
  assert.equal(profile.gender, 'female');
  assert.equal(profile.bpl_card, true);
});

test('parses a Kannada widow with age and BPL card', () => {
  const { profile } = parseProfile('ನನಗೆ 68 ವರ್ಷ, ವಿಧವೆ, ಬಿಪಿಎಲ್ ಕಾರ್ಡ್ ಇದೆ');
  assert.equal(profile.age, 68);
  assert.equal(profile.gender, 'female');
  assert.equal(profile.bpl_card, true);
});

test('parses romanized daily wage and kutcha house', () => {
  const { profile } = parseProfile('mazdoor, kachcha ghar');
  assert.equal(profile.occupation, 'daily_wage');
  assert.equal(profile.house, 'kutcha');
});

test('treats "apl card" as no BPL card', () => {
  const { profile } = parseProfile('apl card');
  assert.equal(profile.bpl_card, false);
});

test('converts Devanagari digits to ASCII before extracting age', () => {
  const { profile } = parseProfile('६८ साल');
  assert.equal(profile.age, 68);
});


