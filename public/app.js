'use strict';

// Scheme Finder front end. Plain DOM, no frameworks.
// All server data is written with textContent (never innerHTML) to avoid injection.

const TRACKER_KEY = 'schemeTracker';
const STATUS_LABELS = {
  likely: 'Likely eligible',
  unknown: 'May be eligible — some details missing',
};

const $ = (id) => document.getElementById(id);

// Create an element with text set via textContent.
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}

// Build a <ul> or <ol> from an array of strings.
function list(tag, items) {
  const ul = document.createElement(tag);
  (items || []).forEach((item) => ul.appendChild(el('li', item)));
  return ul;
}

// Local date as YYYY-MM-DD (avoids UTC shifts from toISOString).
function toDateInput(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayPlusDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateInput(d);
}

// POST JSON and return the parsed response; throws with a readable message on failure.
async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = {};
  try {
    data = await res.json();
  } catch (err) {
    // Non-JSON response; fall through with an empty object.
  }
  if (!res.ok) throw new Error(data.error || 'Request failed. Please try again.');
  return data;
}

// ---- Tracker (localStorage only) ----

function loadTracked() {
  try {
    const raw = localStorage.getItem(TRACKER_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function saveTracked(items) {
  localStorage.setItem(TRACKER_KEY, JSON.stringify(items));
}

function renderTracked() {
  const box = $('tracked');
  box.textContent = '';
  const items = loadTracked();
  if (items.length === 0) {
    box.appendChild(el('li', 'No schemes tracked yet.', 'muted'));
    return;
  }
  const today = toDateInput(new Date());

  items.forEach((item, index) => {
    const li = el('li', null, 'tracked-item');
    li.appendChild(el('strong', item.name));
    li.appendChild(el('div', `Applied on: ${item.appliedOn || 'not yet'}`));
    li.appendChild(el('div', `Next check: ${item.nextCheckDate || 'not set'}`));

    // Warn when the check date is today or already past (string compare works for YYYY-MM-DD).
    if (item.nextCheckDate && item.nextCheckDate <= today) {
      li.appendChild(el('p', 'Check due: please confirm the status on the official site.', 'warning'));
    }

    const markBtn = el('button', 'Mark applied');
    markBtn.type = 'button';
    markBtn.addEventListener('click', () => {
      const all = loadTracked();
      if (all[index]) {
        all[index].appliedOn = toDateInput(new Date());
        all[index].nextCheckDate = todayPlusDays(30);
        saveTracked(all);
        renderTracked();
      }
    });
    li.appendChild(markBtn);
    box.appendChild(li);
  });
}

// Save a scheme from a result card into the tracker.
function trackScheme(result, appliedInput, checkInput) {
  const items = loadTracked();
  if (items.some((t) => t.schemeId === result.scheme_id)) {
    alert(`${result.name} is already tracked.`);
    return;
  }
  items.push({
    schemeId: result.scheme_id,
    name: result.name,
    appliedOn: appliedInput.value || '',
    nextCheckDate: checkInput.value || todayPlusDays(30),
  });
  saveTracked(items);
  renderTracked();
}

// ---- Result cards ----

// Render the checklist returned by /api/checklist into the given container.
function renderChecklist(container, data) {
  container.textContent = '';
  container.appendChild(el('h4', 'Documents to keep ready'));
  container.appendChild(list('ul', data.documents));
  container.appendChild(el('h4', 'Steps'));
  const steps = (data.steps || []).map((s) =>
    typeof s === 'string' ? s : (s && s.text) || String(s));
  container.appendChild(list('ol', steps));
  if (data.application_url) {
    const a = el('a', 'Apply here (official site)');
    a.href = data.application_url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    container.appendChild(a);
  }
}

function renderCard(result, profile) {
  const card = el('article', null, 'card');
  card.appendChild(el('h3', result.name));
  card.appendChild(el('p', `Level: ${result.level || 'not listed'}`, 'meta'));
  card.appendChild(el('p', `Benefit: ${result.benefit || 'not listed'}`));
  card.appendChild(el('p', STATUS_LABELS[result.status] || result.status, `status status-${result.status}`));

  card.appendChild(el('h4', 'Why'));
  card.appendChild(list('ul', result.reasons_met));
  card.appendChild(el('h4', 'Still to check'));
  card.appendChild(list('ul', result.reasons_missing));

  if (result.official_url) {
    const a = el('a', 'Official website');
    a.href = result.official_url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    card.appendChild(a);
  }

  card.appendChild(el('p',
    result.last_verified ? `Last verified: ${result.last_verified}` : 'Not yet verified',
    'meta'));

  // Checklist button + container.
  const checklistBox = el('div', null, 'checklist');
  const checklistBtn = el('button', 'Show checklist');
  checklistBtn.type = 'button';
  checklistBtn.addEventListener('click', async () => {
    checklistBox.textContent = 'Loading…';
    try {
      const data = await postJson('/api/checklist', { schemeId: result.scheme_id, profile });
      renderChecklist(checklistBox, data);
    } catch (err) {
      checklistBox.textContent = err.message;
    }
  });
  card.appendChild(checklistBtn);
  card.appendChild(checklistBox);

  // Track form: applied date and next check date (default today + 30 days).
  const trackRow = el('div', null, 'track-row');
  const appliedLabel = el('label', 'Applied on ');
  const appliedInput = el('input');
  appliedInput.type = 'date';
  appliedLabel.appendChild(appliedInput);
  const checkLabel = el('label', 'Next check ');
  const checkInput = el('input');
  checkInput.type = 'date';
  checkInput.value = todayPlusDays(30);
  checkLabel.appendChild(checkInput);
  const trackBtn = el('button', 'Track');
  trackBtn.type = 'button';
  trackBtn.addEventListener('click', () => trackScheme(result, appliedInput, checkInput));
  trackRow.append(appliedLabel, checkLabel, trackBtn);
  card.appendChild(trackRow);

  return card;
}

// ---- Submit handler ----

async function onSubmit(event) {
  event.preventDefault();
  const text = $('situation').value.trim();
  const status = $('status');
  const results = $('results');

  if (!text) {
    status.textContent = 'Please describe your situation first.';
    return;
  }

  status.textContent = 'Searching…';
  results.textContent = '';
  $('find-btn').disabled = true;

  try {
    const data = await postJson('/api/match', { text });

    // "Understood" and "Not found" lists.
    $('understood-section').hidden = !(data.understood && data.understood.length);
    $('understood').textContent = '';
    (data.understood || []).forEach((item) => $('understood').appendChild(el('li', item)));
    $('unclear-section').hidden = !(data.unclear && data.unclear.length);
    $('unclear').textContent = '';
    (data.unclear || []).forEach((item) => $('unclear').appendChild(el('li', item)));

    results.appendChild(el('p', data.disclaimer, 'disclaimer-inline'));
    if (!data.results || data.results.length === 0) {
      status.textContent = 'No matching schemes found yet. Try adding more detail.';
      return;
    }
    status.textContent = `${data.results.length} scheme(s) found.`;
    data.results.forEach((r) => results.appendChild(renderCard(r, data.profile || {})));
  } catch (err) {
    status.textContent = err.message;
  } finally {
    $('find-btn').disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('finder-form').addEventListener('submit', onSubmit);
  renderTracked();
});
