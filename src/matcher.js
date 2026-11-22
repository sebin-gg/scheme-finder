'use strict';

// Pure matching logic: no I/O. A profile is a plain object of field -> value.

const STATUS_RANK = { likely: 0, unknown: 1, unlikely: 2 };

function isMissing(value) {
  return value === undefined || value === null;
}

// Evaluate one rule against the profile.
function evaluateRule(rule, profile) {
  const value = profile[rule.field];
  const base = { id: rule.id, text: rule.text, field: rule.field };

  if (isMissing(value)) {
    return { ...base, passed: false, detail: 'not provided' };
  }

  let passed;
  switch (rule.op) {
    case 'eq':
      passed = value === rule.value;
      break;
    case 'neq':
      passed = value !== rule.value;
      break;
    case 'in':
      if (!Array.isArray(rule.value)) {
        return { ...base, passed: false, detail: 'rule value must be an array' };
      }
      passed = rule.value.includes(value);
      break;
    case 'gte':
      passed = Number(value) >= rule.value;
      break;
    case 'lte':
      passed = Number(value) <= rule.value;
      break;
    case 'bool':
      passed = value === rule.value;
      break;
    default:
      return { ...base, passed: false, detail: `unknown op "${rule.op}"` };
  }

  return { ...base, passed, detail: passed ? 'matches' : `profile has ${value}` };
}

// Match one scheme against the profile and derive a likelihood status.
function matchScheme(scheme, profile) {
  const rules = scheme.rules || [];
  const evals = rules.map((r) => ({ rule: r, ev: evaluateRule(r, profile) }));

  // Non-group rules must all pass; group rules need one passing member per group.
  const groups = {};
  let decisiveFail = false;
  let needsField = false;

  for (const { rule, ev } of evals) {
    const missing = isMissing(profile[rule.field]);
    if (!rule.group) {
      if (!ev.passed) {
        if (missing) needsField = true;
        else decisiveFail = true;
      }
    } else {
      (groups[rule.group] = groups[rule.group] || []).push({ rule, ev });
    }
  }

  for (const members of Object.values(groups)) {
    if (members.some((m) => m.ev.passed)) continue;
    // No member passed: decisive only if every member had a value to judge.
    if (members.some((m) => isMissing(profile[m.rule.field]))) needsField = true;
    else decisiveFail = true;
  }

  let status = 'likely';
  if (decisiveFail) status = 'unlikely';
  else if (needsField) status = 'unknown';

  const documents = (scheme.documents || [])
    .filter((d) => !d.only_if || Boolean(profile[d.only_if]))
    .map((d) => d.name);

  const deadline = scheme.deadline || null;

  return {
    scheme_id: scheme.id,
    name: scheme.name,
    official_url: scheme.official_url,
    application_url: scheme.application_url,
    benefit: scheme.benefit,
    level: scheme.level,
    status,
    rules: evals.map((e) => e.ev),
    reasons_met: evals.filter((e) => e.ev.passed).map((e) => e.ev.text),
    reasons_missing: evals.filter((e) => !e.ev.passed).map((e) => e.ev.text),
    documents,
    steps: scheme.steps || [],
    last_verified: scheme.last_verified ?? null,
    verification_note: scheme.verification_note || '',
    deadline,
    deadline_note: deadline
      ? `Deadline: ${deadline}`
      : 'No deadline listed; check the official source.',
  };
}

// Match all schemes; sorted likely -> unknown -> unlikely, then by name.
function matchAll(schemes, profile) {
  return schemes
    .map((s) => matchScheme(s, profile))
    .sort((a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      String(a.name).localeCompare(String(b.name)));
}

module.exports = { evaluateRule, matchScheme, matchAll };
