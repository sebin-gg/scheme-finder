'use strict';

const MAX_LENGTH = 1000;

// C0 and C1 control characters (includes tab, newline, carriage return).
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;

// Shapes of identifiers we must never store: 12-digit IDs, PAN, account-like digit runs.
const SENSITIVE_PATTERNS = [
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,
  /\b[A-Z]{5}\d{4}[A-Z]\b/i,
  /\b\d{9,18}\b/,
];

function toStr(value) {
  return value === undefined || value === null ? '' : String(value);
}

// Coerce to string, strip control characters, trim, then cap length.
function sanitizeText(input) {
  return toStr(input).replace(CONTROL_CHARS, '').trim().slice(0, MAX_LENGTH);
}

// True if text contains an ID-like number (used to reject input).
function containsSensitiveId(text) {
  const str = toStr(text);
  return SENSITIVE_PATTERNS.some((re) => re.test(str));
}

module.exports = { sanitizeText, containsSensitiveId };
