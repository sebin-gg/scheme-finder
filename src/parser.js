'use strict';

// Rule-based parser: turns plain-language text into a profile object.
// Sensitive-ID-shaped numbers are blanked out before any extraction, and the
// raw input is never returned.

const { sanitizeText } = require('./sanitize');

// Same shapes as containsSensitiveId in sanitize.js, as global spans to blank out.
const SENSITIVE_SPANS = [
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  /\b[A-Z]{5}\d{4}[A-Z]\b/gi,
  /\b\d{9,18}\b/g,
];

// Devanagari (U+0966-U+096F) and Kannada (U+0CE6-U+0CEF) digits -> ASCII 0-9.
const DIGIT_MAP = {};
for (let i = 0; i <= 9; i++) {
  DIGIT_MAP[String.fromCharCode(0x0966 + i)] = String(i);
  DIGIT_MAP[String.fromCharCode(0x0ce6 + i)] = String(i);
}

// Amount: optional Rs/rupees/रुपये/₹ prefix, digits (with commas or decimals), optional lakh/lac/लाख.
const AMOUNT_RE = /(?:(?:\b(?:rs\.?|rupees)|(?<![\p{L}\p{M}])(?:रुपये|रुपए|रु\.?|ರೂಪಾಯಿ|ರೂ\.?))\s*|₹\s*)?\b(\d{1,3}(?:,\d{2,3})+|\d+)(\.\d+)?(?:\s*(lakhs?|lacs?|लाख|ಲಕ್ಷ))?/gu;

// Monthly / annual cues that follow an amount (e.g. "15000 महीना", "2 लाख सालाना").
const MONTHLY_AFTER_RE = new RegExp(
  '^\\s*(?:(?:a|per|each|every)\\s+)?(?:महीना|माह|ತಿಂಗಳು)(?![\\p{L}\\p{M}\\d])',
  'u'
);
const ANNUAL_AFTER_RE = new RegExp(
  '^\\s*(?:(?:a|per|each|every)\\s+)?(?:सालाना|वार्षिक|ವಾರ್ಷಿಕ|ವರ್ಷಕ್ಕೆ)(?![\\p{L}\\p{M}\\d])',
  'u'
);

// Age phrases, tried in order (input is lowercased).
const AGE_RES = [
  /\bi am\s+(\d{1,3})\b/,
  /\bage\s*(?:is|:)?\s*(\d{1,3})\b/,
  /\b(\d{1,3})\s*(?:years?|yrs?)\s*old\b/,
  /\b(\d{1,3})\s*saal\b/,
  /\b(\d{1,3})\s*(?:वर्ष|साल)(?![\p{L}\p{M}])/u,
  /\b(\d{1,3})\s*(?:ವರ್ಷ|ವಯಸ್ಸು)(?![\p{L}\p{M}])/u,
  /(?<![\p{L}\p{M}])(?:उम्र|आयु|ವಯಸ್ಸು)\s*(?:है|:)?\s*(\d{1,3})\b/u,
];

// Whole-word match for non-ASCII keywords. \b is ASCII-only and Devanagari/Kannada
// vowel signs are combining marks (\p{M}), so lookarounds are used instead.
const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const termSrc = (terms) =>
  `(?<![\\p{L}\\p{M}\\d])(?:${terms.map(escapeRe).join('|')})(?![\\p{L}\\p{M}\\d])`;
const termRe = (terms) => new RegExp(termSrc(terms), 'u');

const FEMALE_RE = termRe([
  'औरत', 'महिला', 'पत्नी', 'विधवा', 'माँ', 'लड़की',
  'ಹೆಣ್ಣು', 'ಮಹಿಳೆ', 'ವಿಧವೆ', 'ಹೆಂಡತಿ', 'ಅಮ್ಮ', 'ಹುಡುಗಿ',
  'patni', 'vidhva', 'vidhwa', 'hennu', 'ladki', 'hendati',
]);
const MALE_RE = termRe([
  'पुरुष', 'आदमी', 'पति', 'पिता', 'लड़का',
  'ಗಂಡಸು', 'ಪುರುಷ', 'ಗಂಡ', 'ತಂದೆ', 'ಹುಡುಗ',
  'purush', 'aadmi', 'pati', 'pita', 'ladka', 'gandasu', 'ganda', 'tande',
]);
const DAILY_WAGE_RE = termRe([
  'मजदूर', 'दिहाड़ी', 'राजमिस्त्री',
  'ಕೂಲಿ', 'ಕೂಲಿ ಕಾರ್ಮಿಕ',
  'majdoor', 'mazdoor', 'dihadi', 'rajmistri',
]);
const FARMER_RE = termRe(['किसान', 'ರೈತ', 'kisan', 'raita']);
const UNEMPLOYED_RE = termRe(['बेरोजगार', 'ನಿರುದ್ಯೋಗಿ', 'berozgar', 'berojgar', 'nirudyogi']);
const STUDENT_RE = termRe([
  'छात्र', 'विद्यार्थी', 'कॉलेज', 'स्कूल',
  'ವಿದ್ಯಾರ್ಥಿ', 'ವಿದ್ಯಾರ್ಥಿನಿ', 'ಕಾಲೇಜು', 'ಶಾಲೆ',
  'chhatra',
]);
const SC_RE = termRe(['अनुसूचित जाति', 'ಪರಿಶಿಷ್ಟ ಜಾತಿ']);
const ST_RE = termRe(['अनुसूचित जनजाति', 'ಪರಿಶಿಷ್ಟ ಪಂಗಡ']);
const OBC_RE = termRe(['पिछड़ा वर्ग', 'ಹಿಂದುಳಿದ ವರ್ಗ']);
const MONTHLY_CUE_RE = termRe(['महीना', 'माह', 'ತಿಂಗಳು']);
const HOUSELESS_RE = termRe(['बेघर', 'ಮನೆ ಇಲ್ಲ']);
const KUTCHA_RE = termRe(['कच्चा', 'झोपड़ी', 'मिट्टी', 'ಗುಡಿಸಲು', 'ಕಚ್ಚಾ', 'kachcha', 'jhopdi', 'mitti']);
const PUCCA_RE = termRe(['पक्का', 'ಪಕ್ಕಾ', 'pakka']);
// Note: "apl" is already in the English APL list in parseProfile.
const BPL_NEG_RE = new RegExp(
  `\\b(apl|no bpl|not bpl)\\b|above poverty line|${termSrc(['गरीबी रेखा से ऊपर', 'ಬಡತನ ರೇಖೆಗಿಂತ ಮೇಲೆ', 'garibi rekha se upar'])}`,
  'u'
);
const BPL_POS_RE = new RegExp(
  `\\bbpl\\b|below poverty line|${termSrc(['बीपीएल', 'गरीबी रेखा से नीचे', 'ಬಿಪಿಎಲ್', 'ಬಡತನ ರೇಖೆಗಿಂತ ಕೆಳಗೆ', 'garibi rekha se neeche'])}`,
  'u'
);

function normalizeDigits(text) {
  return text.replace(/[\u0966-\u096F\u0CE6-\u0CEF]/g, (ch) => DIGIT_MAP[ch]);
}

function redact(text) {
  return SENSITIVE_SPANS.reduce((acc, re) => acc.replace(re, ' '), text);
}

// false if the negative pattern matches, true if the positive one does, else undefined.
function triState(s, negRe, posRe) {
  if (negRe.test(s)) return false;
  if (posRe.test(s)) return true;
  return undefined;
}

function parseAge(s) {
  for (const re of AGE_RES) {
    const m = s.match(re);
    if (m) {
      const age = Number(m[1]);
      if (age >= 1 && age <= 120) return age;
    }
  }
  return undefined;
}

function parseGender(s) {
  const female = /\b(female|woman|widow|mother|girl|wife|mahila|mahile|aurat)\b/.test(s) || FEMALE_RE.test(s);
  const male = /\b(male|man|father|boy|husband)\b/.test(s) || MALE_RE.test(s);
  if (female === male) return undefined; // neither, or conflicting
  return female ? 'female' : 'male';
}

function parseOccupation(s) {
  // Order matters: farm labour must be checked before the generic labourer match.
  if (/\b(farm|agricultural|agri)\s+labou?r(er)?s?\b/.test(s)) return 'farm_labour';
  if (/\bdaily wage\b|\blabou?rer\b|\bkooli\b|\bcoolie\b|\bmason\b|\bconstruction\b/.test(s) || DAILY_WAGE_RE.test(s)) {
    return 'daily_wage';
  }
  if (/\bfarmer\b/.test(s) || FARMER_RE.test(s)) return 'farmer';
  if (/\bunemployed\b|\bno job\b/.test(s) || UNEMPLOYED_RE.test(s)) return 'unemployed';
  return undefined;
}

function parseCategory(s) {
  // OBC before SC/ST so "other backward" is not mistaken for anything else.
  if (/\bobc\b|other backward/.test(s) || OBC_RE.test(s)) return 'OBC';
  if (/\bsc\b|scheduled caste/.test(s) || SC_RE.test(s)) return 'SC';
  if (/\bst\b|scheduled tribe/.test(s) || ST_RE.test(s)) return 'ST';
  if (/\bgeneral\b/.test(s)) return 'General';
  return undefined;
}

function parseHouse(s) {
  if (/\bhomeless\b|no house of my own/.test(s) || HOUSELESS_RE.test(s)) return 'houseless';
  if (/\b(kutcha|mud|thatched|hut)\b/.test(s) || KUTCHA_RE.test(s)) return 'kutcha';
  if (/\b(pucca|concrete)\b/.test(s) || PUCCA_RE.test(s)) return 'pucca';
  return undefined;
}

// Returns { annual, monthly } from amounts in the text, each the first match found.
function parseIncome(s) {
  const found = { annual: undefined, monthly: undefined };
  for (const m of s.matchAll(AMOUNT_RE)) {
    const hasPrefix = /rs|rupee|₹|रु|ರೂ/.test(m[0]);
    const hasLakh = Boolean(m[3]);
    const hasComma = m[1].includes(',');
    const base = Number(m[1].replace(/,/g, '') + (m[2] || ''));
    const value = Math.round(base * (hasLakh ? 100000 : 1));
    if (!Number.isFinite(value) || value <= 0) continue;

    const start = m.index;
    const end = m.index + m[0].length;
    const before = s.slice(Math.max(0, start - 20), start);
    const after = s.slice(end, end + 20);

    const explicitAnnual =
      /^\s*(a|per|each|every)\s+(year|annum)\b|^\s*(yearly|annually)\b/.test(after) || ANNUAL_AFTER_RE.test(after);
    const monthlyCtx =
      /^\s*(a|per|each|every)\s+month|^\s*monthly/.test(after) ||
      MONTHLY_AFTER_RE.test(after) ||
      /salary|monthly/.test(before) ||
      MONTHLY_CUE_RE.test(before);

    // Ignore bare small numbers (ages, counts) that carry no money signal.
    const isAmount = hasPrefix || hasLakh || hasComma || value >= 1000 || monthlyCtx || explicitAnnual;
    if (!isAmount) continue;

    const kind = explicitAnnual ? 'annual' : monthlyCtx ? 'monthly' : 'annual';
    if (found[kind] === undefined) found[kind] = value;
  }
  return found;
}

function parseProfile(text) {
  const clean = sanitizeText(text);
  const s = redact(normalizeDigits(clean)).toLowerCase();

  const profile = {
    age: undefined,
    gender: undefined,
    is_family_head: undefined,
    occupation: undefined,
    is_student: undefined,
    category: undefined,
    annual_income: undefined,
    monthly_income: undefined,
    bpl_card: undefined,
    house: undefined,
    in_social_security: undefined,
    income_tax_payer: undefined,
  };
  const understood = [];
  const unclear = [];

  // Each field: set when found, otherwise report its name as unclear.
  const put = (key, value, sentence, label) => {
    if (value === undefined) {
      unclear.push(label);
      return;
    }
    profile[key] = value;
    understood.push(sentence);
  };

  const age = parseAge(s);
  put('age', age, `Age ${age}`, 'age');

  const gender = parseGender(s);
  put('gender', gender, `Gender ${gender}`, 'gender');

  const head = triState(
    s,
    /\bnot\s+(the\s+)?head\b/,
    /\bhead of (the )?(family|household)\b|\bi am the head\b/
  );
  put('is_family_head', head, head ? 'Head of family' : 'Not head of family', 'family head');

  const occupation = parseOccupation(s);
  put('occupation', occupation, `Occupation ${occupation}`, 'occupation');

  // Only a positive signal is recorded for student status.
  const student =
    /\b(students?|studying|college|school|vidyarthi)\b/.test(s) || STUDENT_RE.test(s) ? true : undefined;
  put('is_student', student, 'Is a student', 'student status');

  const category = parseCategory(s);
  put('category', category, `Category ${category}`, 'category');

  const income = parseIncome(s);
  if (income.annual === undefined && income.monthly === undefined) unclear.push('income');
  if (income.annual !== undefined) {
    profile.annual_income = income.annual;
    understood.push(`Annual income ${income.annual}`);
  }
  if (income.monthly !== undefined) {
    profile.monthly_income = income.monthly;
    understood.push(`Monthly income ${income.monthly}`);
  }

  const bpl = triState(s, BPL_NEG_RE, BPL_POS_RE);
  put('bpl_card', bpl, bpl ? 'Has BPL card' : 'No BPL card', 'BPL card');

  const house = parseHouse(s);
  put('house', house, `House ${house}`, 'house type');

  const socialSecurity = triState(
    s,
    /\bno (pf|epfo|esic|nps|provident fund)\b|\bnot covered\b/,
    /\b(epfo|esic|pf|nps)\b|provident fund/
  );
  put(
    'in_social_security',
    socialSecurity,
    socialSecurity ? 'In social security' : 'Not in social security',
    'social security'
  );

  const tax = triState(
    s,
    /\bno income tax\b|\bnot (paying|pay)\s+(income\s+)?tax\b/,
    /\bpay(s|ing)?\s+(income\s+)?tax\b|\bitr\b|income tax payer/
  );
  put('income_tax_payer', tax, tax ? 'Pays income tax' : 'Does not pay income tax', 'income tax');

  return { profile, understood, unclear };
}

module.exports = { parseProfile };
