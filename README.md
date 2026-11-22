# Scheme Finder (Karnataka)

Describe your situation in plain words. The app shows government schemes you are
LIKELY eligible for, with the reasons, a documents checklist, application steps,
and a tracker for follow-ups.

## What it does

- Reads a short plain-language description (e.g. "I am a 68 year old widow, BPL card holder").
- Pulls out simple facts: age, gender, occupation, category, income, BPL card, house type.
- Matches them against scheme rules in `data/schemes/`.
- Shows each scheme as **likely**, **unknown** (more info needed) or **unlikely**, with reasons met and missing.
- For each scheme: documents checklist, steps, official and application links, and deadline if listed.

## Run

```
npm start
```

Then open http://127.0.0.1:3000 in your browser.

## Tests

```
npm test
```

## Add or edit a scheme

Each scheme is one JSON file in `data/schemes/`. Fields:

- `id` - unique slug, used as the file name.
- `name`, `level` (central / state), `ministry`, `benefit` - display text.
- `official_url` - must start with `https://`; link to the official source.
- `application_url` - where to apply.
- `last_verified` - date you checked the official source (`YYYY-MM-DD`), or `null`.
- `verification_note` - short note on what was checked.
- `deadline` - date string or `null`.
- `rules` - list of eligibility rules (below).
- `documents` - list of `{ "name": ..., "only_if": optional profile field }`.
- `steps` - ordered list of application steps.

Rule fields: `id`, `text` (shown to the user), `field` (profile field), `op`, `value`, and optional `group`.

Rule ops:

- `eq`, `neq` - equal / not equal.
- `in` - value is one of an array.
- `gte`, `lte` - number at least / at most.
- `bool` - true or false.

Rules with the same `group` are **any-of**: one passing member satisfies the group.
Rules without a group must all pass.

Set `last_verified` to the date you checked the official source. Do not mark a scheme
verified unless you have checked it.

Run `npm test` after a change; it validates every scheme file.

## Privacy

- No server storage: the server does not save profiles or inputs.
- No Aadhaar or bank input: text containing ID-like numbers (12-digit Aadhaar shapes,
  PAN shapes, long account-like digit runs) is refused with an error.
- Reminders stay in the browser's `localStorage` only.

## Limitations

- Seed data is from public knowledge and is not yet verified against official sources
  (`last_verified` is `null`).
- Kannada and Hindi keyword support is basic; English phrasing works best.
- Parsing is rule-based, so it can miss or misread details. Check the reasons shown.

## Disclaimer

This tool shows schemes you are LIKELY eligible for, based on public information. It does not guarantee any benefit. Final eligibility is decided by the official authority. We do not ask for or store Aadhaar or bank details.

