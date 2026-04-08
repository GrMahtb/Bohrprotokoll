'use strict';

const VERSION = '20260408-v2';
const ROWS = 25;
const HISTORY_MAX = 30;

const STORAGE_DRAFT = `htb-bohrzaun-draft-${VERSION}`;
const STORAGE_HISTORY = `htb-bohrzaun-history-${VERSION}`;

const $ = (id) => document.getElementById(id);

const BEZEICHNUNGEN = [
  '–',
  'TI 30/11',
  'TI30/11',
  'TI40/20',
  'TITAN 30/11',
  'TITAN 40/20',
  'Seilanker 14,5 mm',
  'Sonstiges'
];

const PATTERNS = {
  '4-7':   { lv: '0,00', lb: '4,00', fv: '4,00', fb: '7,00' },
  '4.5-7': { lv: '0,00', lb: '4,50', fv: '4,50', fb: '7,00' },
  '5-7':   { lv: '0,00', lb: '5,00', fv: '5,00', fb: '7,00' },
  '1-1.5': { lv: '0,00', lb: '1,00', fv: '1,00', fb: '1,50' }
};

const LOGO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="80" fill="#111111"/>
  <g transform="translate(256,256) scale(0.72) translate(-318.9,-248)">
    <path fill="#000000" d="M531.5,177.12H148.73l43.08-28.73c6.57-4.38,14.29-6.72,22.18-6.72h285.8s-140.7-93.84-140.7-93.84c-.7-.48-1.44-.95-2.15-1.42-21.73-14.64-54.36-14.64-76.09,0-.72.48-1.44.94-2.15,1.42L66.6,189.29h0c-4.68,3.2-8.98,6.93-12.8,11.12-41.01,45.63-8.95,118.29,52.5,118.53h382.77l-43.08,28.73c-6.57,4.38-14.29,6.72-22.19,6.72H138.01s140.71,93.84,140.71,93.84c.7.49,1.44.95,2.15,1.43,21.73,14.64,54.36,14.64,76.09,0,.72-.48,1.44-.94,2.14-1.42l212.1-141.45h0c4.69-3.21,9.01-6.96,12.84-11.16,11.73-12.89,18.35-30.15,18.33-47.58,0-39.16-31.73-70.9-70.87-70.9Z"/>
    <path fill="#ffed00" d="M438.32,263.5c.08-5.32-1.27-9.39-4.05-12.22-2.79-2.82-7.04-4.81-12.77-5.96,4.83-.9,8.43-2.8,10.81-5.71,2.37-2.91,3.56-6.61,3.56-11.11v-3.44c0-4.83-.94-8.72-2.82-11.67-1.88-2.95-4.75-5.08-8.6-6.39-3.85-1.31-8.72-1.96-14.61-1.96h-157.8v33.77h-30.21v-33.77h-22.59v85.96h22.59v-35.73h30.21v35.73h22.72v-69.26h33.52v69.26h22.84v-69.26h33.4v69.26h45.31c6.38,0,11.69-.78,15.9-2.33,4.21-1.55,7.41-3.99,9.58-7.31,2.17-3.32,3.25-7.55,3.25-12.71l-.25-5.16Z"/>
  </g>
</svg>
`;

const refs = {
  cards: [],
  sigPads: { an: null, ag: null }
};

const state = {
  meta: {
    datum: '',
    protoNr: '',
    baustelle: '',
    an: 'HTB Baugesellschaft m.b.H.',
    ag: '',
    bohrsystem: '',
    bohrzeitraum: '',
    verpresszeitraum: '',
    hinweis: '',
    sigAnName: '',
    sigAgName: ''
  },
  rows: Array.from({ length: ROWS }, () => emptyRow()),
  sign: {
    an: '',
    ag: ''
  },
  ui: {
    view: 'cards'
  }
};

let installPrompt = null;

function emptyRow() {
  return {
    nr: '',
    neigung: '',
    bez: '–',
    gewebe: 'nein',
    bohrloch: '',
    zement: '',
    wz: '0,45',
    lv: '',
    lb: '',
    fv: '',
    fb: '',
    note: ''
  };
}

function fmtDE(n, digits = 2) {
  return Number(n || 0).toFixed(digits).replace('.', ',');
}

function num(v) {
  const s = String(v ?? '').trim().replace(/\s+/g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function dateDE(value) {
  const s = String(value || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return s;
}

function uid() {
  return crypto?.randomUUID?.() || `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function mm(v) {
  return v * 72 / 25.4;
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function populateBezeichnungSelect(select, includeUnchanged = false) {
  select.innerHTML = '';
  if (includeUnchanged) {
    select.appendChild(new Option('(unverändert)', ''));
  }
  BEZEICHNUNGEN.forEach((v) => select.appendChild(new Option(v, v)));
}

function buildJumpRow() {
  const sel = $('jumpRow');
  if (!sel) return;
  sel.innerHTML = '';
  for (let i = 0; i < ROWS; i++) {
    sel.appendChild(new Option(`Zeile ${i + 1}`, String(i)));
  }
}

function buildSeriesSelects() {
  populateBezeichnungSelect($('series-bez'), true);
}

function initTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('is-active', b === btn));
      document.querySelectorAll('.pane').forEach((pane) => {
        const active = pane.id === `tab-${btn.dataset.tab}`;
        pane.classList.toggle('is-active', active);
        pane.hidden = !active;
      });
      if (btn.dataset.tab === 'verlauf') renderHistory();
    });
  });
}

function setView(view) {
  state.ui.view = view;
  const cardsBtn = $('btnViewCards');
  const tableBtn = $('btnViewTable');
  const cardsPane = $('viewCards');
  const tablePane = $('viewTable');

  cardsBtn?.classList.toggle('is-active', view === 'cards');
  tableBtn?.classList.toggle('is-active', view === 'table');

  if (cardsPane) {
    cardsPane.classList.toggle('is-active', view === 'cards');
    cardsPane.hidden = view !== 'cards';
  }
  if (tablePane) {
    tablePane.classList.toggle('is-active', view === 'table');
    tablePane.hidden = view !== 'table';
  }
}

function computeRow(row) {
  const lv = num(row.lv);
  const lb = num(row.lb);
  const fv = num(row.fv);
  const fb = num(row.fb);

  const ld = Math.max(0, lb - lv);
  const fd = Math.max(0, fb - fv);
  const len = Math.max(lb, fb);

  const any =
    String(row.nr || '').trim() !== '' ||
    String(row.neigung || '').trim() !== '' ||
    (row.bez && row.bez !== '–') ||
    String(row.zement || '').trim() !== '' ||
    String(row.lb || '').trim() !== '' ||
    String(row.fb || '').trim() !== '' ||
    String(row.note || '').trim() !== '';

  const ok =
    String(row.nr || '').trim() !== '' &&
    (row.bez && row.bez !== '–') &&
    String(row.neigung || '').trim() !== '' &&
    (String(row.lb || '').trim() !== '' || String(row.fb || '').trim() !== '') &&
    String(row.zement || '').trim() !== '';

  return {
    lv, lb, fv, fb, ld, fd, len,
    any,
    status: !any ? 'empty' : ok ? 'ok' : 'partial'
  };
}

function summaryTitle(i, row, d) {
  const left = row.nr ? row.nr : `Zeile ${i + 1}`;
  const bez = row.bez && row.bez !== '–' ? row.bez : '—';
  const nei = row.neigung ? `${row.neigung}°` : '—°';
  const len = d.len > 0 ? `${fmtDE(d.len)} m` : '— m';
  return { left, text: `${bez} · ${nei} · ${len}` };
}

function makeInput(type = 'text', className = 'field__input') {
  const el = document.createElement('input');
  el.type = type;
  el.className = className;
  return el;
}

function makeSelect(options = [], className = 'field__select') {
  const el = document.createElement('select');
  el.className = className;
  options.forEach((opt) => el.appendChild(new Option(opt.label, opt.value)));
  return el;
}

function fieldWrap(label, input, full = false) {
  const wrap = document.createElement('label');
  wrap.className = `field${full ? ' field--full' : ''}`;

  const span = document.createElement('span');
  span.className = 'field__label';
  span.textContent = label;

  wrap.appendChild(span);
  wrap.appendChild(input);
  return wrap;
}

function chipsRow(list) {
  const div = document.createElement('div');
  div.className = 'chips';
  list.forEach((item) => div.appendChild(item));
  return div;
}

function chip(text, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chip';
  btn.textContent = text;
  btn.addEventListener('click', onClick);
  return btn;
}

function buildCards() {
  const host = $('cardList');
  if (!host) return;
  host.innerHTML = '';
  refs.cards = [];

  for (let i = 0; i < ROWS; i++) {
    const details = document.createElement('details');
    details.className = 'row-card';
    if (i === 0) details.open = true;

    const summary = document.createElement('summary');

    const status = document.createElement('span');
    status.className = 'row-card__status row-card__status--empty';

    const head = document.createElement('div');
    head.className = 'row-card__head';

    const title = document.createElement('div');
    title.className = 'row-card__title';

    const meta = document.createElement('div');
    meta.className = 'row-card__meta';

    head.appendChild(title);
    head.appendChild(meta);
    summary.appendChild(status);
    summary.appendChild(head);
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'row-card__body';

    const actions = document.createElement('div');
    actions.className = 'row-actions';

    const btnCopyPrev = document.createElement('button');
    btnCopyPrev.type = 'button';
    btnCopyPrev.className = 'btn btn--ghost btn--small';
    btnCopyPrev.textContent = 'Vorherigen kopieren';
    btnCopyPrev.addEventListener('click', () => copyFromPrev(i));

    const btnClear = document.createElement('button');
    btnClear.type = 'button';
    btnClear.className = 'btn btn--ghost btn--small';
    btnClear.textContent = 'Zeile leeren';
    btnClear.addEventListener('click', () => clearRow(i));

    const btnNext = document.createElement('button');
    btnNext.type = 'button';
    btnNext.className = 'btn btn--accent btn--small';
    btnNext.textContent = 'Nächste Zeile';
    btnNext.addEventListener('click', () => openRow(Math.min(ROWS - 1, i + 1)));

    actions.appendChild(btnCopyPrev);
    actions.appendChild(btnClear);
    actions.appendChild(btnNext);
    body.appendChild(actions);

    const secBase = document.createElement('div');
    secBase.className = 'row-section';
    secBase.innerHTML = `<div class="row-section__title">Basisdaten</div>`;
    const baseGrid = document.createElement('div');
    baseGrid.className = 'row-grid';

    const inpNr = makeInput('text');
    const inpNeigung = makeInput('number');
    inpNeigung.step = '1';

    const selBez = document.createElement('select');
    selBez.className = 'field__select';
    populateBezeichnungSelect(selBez, false);

    const selGewebe = makeSelect([
      { label: 'nein', value: 'nein' },
      { label: 'ja', value: 'ja' }
    ]);

    const inpBohrloch = makeInput('number');
    inpBohrloch.step = '1';

    const inpZement = makeInput('number');
    inpZement.step = '0.01';

    const inpWz = makeInput('text');

    baseGrid.appendChild(fieldWrap('Nr.', inpNr));
    baseGrid.appendChild(fieldWrap('Neigung [°]', inpNeigung));
    baseGrid.appendChild(fieldWrap('Bezeichnung', selBez));
    baseGrid.appendChild(fieldWrap('Gewebe-strumpf', selGewebe));
    baseGrid.appendChild(fieldWrap('Bohrloch ø [mm]', inpBohrloch));
    baseGrid.appendChild(fieldWrap('Zement [kg]', inpZement));
    baseGrid.appendChild(fieldWrap('W/Z-Wert', inpWz));
    secBase.appendChild(baseGrid);

    secBase.appendChild(chipsRow([
      chip('15°', () => setRowField(i, 'neigung', '15')),
      chip('55°', () => setRowField(i, 'neigung', '55')),
      chip('65°', () => setRowField(i, 'neigung', '65')),
      chip('70°', () => setRowField(i, 'neigung', '70')),
      chip('80°', () => setRowField(i, 'neigung', '80')),
      chip('Bohrloch 115', () => setRowField(i, 'bohrloch', '115')),
      chip('Bohrloch 76', () => setRowField(i, 'bohrloch', '76')),
      chip('W/Z 0,45', () => setRowField(i, 'wz', '0,45'))
    ]));

    body.appendChild(secBase);

    const secDepth = document.createElement('div');
    secDepth.className = 'row-section';
    secDepth.innerHTML = `<div class="row-section__title">Lockergestein / Fels</div>`;

    const depthGrid = document.createElement('div');
    depthGrid.className = 'row-grid--3 row-grid';

    const inpLv = makeInput('number');
    inpLv.step = '0.01';
    const inpLb = makeInput('number');
    inpLb.step = '0.01';
    const inpFv = makeInput('number');
    inpFv.step = '0.01';
    const inpFb = makeInput('number');
    inpFb.step = '0.01';

    depthGrid.appendChild(fieldWrap('Lockergestein von [m]', inpLv));
    depthGrid.appendChild(fieldWrap('Lockergestein bis [m]', inpLb));
    depthGrid.appendChild(fieldWrap('Fels von [m]', inpFv));
    depthGrid.appendChild(fieldWrap('Fels bis [m]', inpFb));
    secDepth.appendChild(depthGrid);

    secDepth.appendChild(chipsRow([
      chip('0–4 / 4–7', () => applyPattern(i, '4-7')),
      chip('0–4,5 / 4,5–7', () => applyPattern(i, '4.5-7')),
      chip('0–5 / 5–7', () => applyPattern(i, '5-7')),
      chip('0–1 / 1–1,5', () => applyPattern(i, '1-1.5'))
    ]));

    const result = document.createElement('div');
    result.className = 'inline-result';

    const ldBox = document.createElement('div');
    ldBox.className = 'inline-result__item';
    ldBox.innerHTML = `<span class="inline-result__label">Lockergestein Diff.</span><span class="inline-result__val">–</span>`;

    const fdBox = document.createElement('div');
    fdBox.className = 'inline-result__item';
    fdBox.innerHTML = `<span class="inline-result__label">Fels Diff.</span><span class="inline-result__val">–</span>`;

    const lenBox = document.createElement('div');
    lenBox.className = 'inline-result__item';
    lenBox.innerHTML = `<span class="inline-result__label">Nagel [m]</span><span class="inline-result__val">–</span>`;

    result.appendChild(ldBox);
    result.appendChild(fdBox);
    result.appendChild(lenBox);
    secDepth.appendChild(result);

    body.appendChild(secDepth);

    const secNote = document.createElement('div');
    secNote.className = 'row-section';
    secNote.innerHTML = `<div class="row-section__title">Anmerkung</div>`;
    const note = document.createElement('textarea');
    note.className = 'field__textarea';
    secNote.appendChild(fieldWrap('Anmerkungen', note, true));
    body.appendChild(secNote);

    details.appendChild(body);
    host.appendChild(details);

    refs.cards.push({
      details,
      title,
      meta,
      status,
      inputs: {
        nr: inpNr,
        neigung: inpNeigung,
        bez: selBez,
        gewebe: selGewebe,
        bohrloch: inpBohrloch,
        zement: inpZement,
        wz: inpWz,
        lv: inpLv,
        lb: inpLb,
        fv: inpFv,
        fb: inpFb,
        note
      },
      derived: {
        ld: ldBox.querySelector('.inline-result__val'),
        fd: fdBox.querySelector('.inline-result__val'),
        len: lenBox.querySelector('.inline-result__val')
      }
    });

    bindRowInputs(i);
  }
}

function bindRowInputs(i) {
  const card = refs.cards[i];
  const keys = Object.keys(card.inputs);
  keys.forEach((key) => {
    const el = card.inputs[key];
    const evt = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(evt, () => {
      state.rows[i][key] = el.value;
      renderRow(i);
      renderTotals();
      renderReviewTable();
      saveDraftDebounced();
    });
  });
}

function setRowField(i, key, value) {
  state.rows[i][key] = value;
  renderRow(i);
  renderTotals();
  renderReviewTable();
  saveDraftDebounced();
}

function applyPattern(i, patternKey) {
  const p = PATTERNS[patternKey];
  if (!p) return;
  state.rows[i].lv = p.lv;
  state.rows[i].lb = p.lb;
  state.rows[i].fv = p.fv;
  state.rows[i].fb = p.fb;
  renderRow(i);
  renderTotals();
  renderReviewTable();
  saveDraftDebounced();
}

function copyFromPrev(i) {
  if (i <= 0) return;
  const prev = clone(state.rows[i - 1]);
  const currentNr = state.rows[i].nr;
  state.rows[i] = {
    ...prev,
    nr: currentNr || '',
    note: ''
  };
  renderRow(i);
  renderTotals();
  renderReviewTable();
  saveDraftDebounced();
}

function clearRow(i) {
  state.rows[i] = emptyRow();
  renderRow(i);
  renderTotals();
  renderReviewTable();
  saveDraftDebounced();
}

function openRow(i) {
  refs.cards.forEach((r, idx) => {
    r.details.open = idx === i;
  });
  refs.cards[i]?.details.scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('jumpRow') && ($('jumpRow').value = String(i));
  setView('cards');
}

function renderRow(i) {
  const row = state.rows[i];
  const ref = refs.cards[i];
  if (!ref) return;

  Object.entries(ref.inputs).forEach(([key, el]) => {
    if (el.value !== String(row[key] ?? '')) {
      el.value = String(row[key] ?? '');
    }
  });

  const d = computeRow(row);
  const s = summaryTitle(i, row, d);

  ref.title.textContent = s.left;
  ref.meta.textContent = s.text;

  ref.status.className = `row-card__status row-card__status--${d.status}`;

  ref.derived.ld.textContent = (row.lv !== '' || row.lb !== '') ? fmtDE(d.ld) : '–';
  ref.derived.fd.textContent = (row.fv !== '' || row.fb !== '') ? fmtDE(d.fd) : '–';
  ref.derived.len.textContent = d.len > 0 ? fmtDE(d.len) : '–';
}

function renderAllRows() {
  for (let i = 0; i < ROWS; i++) renderRow(i);
}

function getSums() {
  let count = 0;
  let cement = 0;
  let len = 0;

  state.rows.forEach((row) => {
    const d = computeRow(row);
    if (d.any) {
      count += 1;
      cement += num(row.zement);
      len += d.len;
    }
  });

  return { count, cement, len };
}

function renderTotals() {
  const sums = getSums();
  document.querySelectorAll('[data-sum="count"]').forEach((el) => el.textContent = String(sums.count));
  document.querySelectorAll('[data-sum="cement"]').forEach((el) => el.textContent = fmtDE(sums.cement));
  document.querySelectorAll('[data-sum="len"]').forEach((el) => el.textContent = fmtDE(sums.len));
}

function renderReviewTable() {
  const body = $('reviewBody');
  if (!body) return;

  body.innerHTML = '';

  state.rows.forEach((row, i) => {
    const d = computeRow(row);
    const tr = document.createElement('tr');

    const statusText = d.status === 'ok' ? 'OK' : d.status === 'partial' ? 'Teilweise' : 'Leer';

    tr.innerHTML = `
      <td class="sticky-1 txt-left">${row.nr || `Zeile ${i + 1}`}</td>
      <td class="sticky-2">${row.neigung || ''}</td>
      <td class="txt-left">${row.bez && row.bez !== '–' ? row.bez : ''}</td>
      <td>${row.gewebe || ''}</td>
      <td>${row.bohrloch || ''}</td>
      <td class="txt-right">${row.zement !== '' ? fmtDE(num(row.zement)) : ''}</td>
      <td>${row.wz || ''}</td>
      <td class="txt-right">${row.lv !== '' ? fmtDE(num(row.lv)) : ''}</td>
      <td class="txt-right">${row.lb !== '' ? fmtDE(num(row.lb)) : ''}</td>
      <td class="txt-right muted">${(row.lv !== '' || row.lb !== '') ? fmtDE(d.ld) : ''}</td>
      <td class="txt-right">${row.fv !== '' ? fmtDE(num(row.fv)) : ''}</td>
      <td class="txt-right">${row.fb !== '' ? fmtDE(num(row.fb)) : ''}</td>
      <td class="txt-right muted">${(row.fv !== '' || row.fb !== '') ? fmtDE(d.fd) : ''}</td>
      <td class="txt-right accent">${d.len > 0 ? fmtDE(d.len) : ''}</td>
      <td class="txt-left">${row.note || ''}</td>
      <td>
        <button class="btn btn--ghost btn--small" type="button" data-open-row="${i}">Öffnen</button>
      </td>
    `;

    body.appendChild(tr);
  });

  body.querySelectorAll('[data-open-row]').forEach((btn) => {
    btn.addEventListener('click', () => openRow(Number(btn.dataset.openRow)));
  });
}

function bindMetaInputs() {
  const map = {
    'inp-datum': 'datum',
    'inp-proto-nr': 'protoNr',
    'inp-baustelle': 'baustelle',
    'inp-an': 'an',
    'inp-ag': 'ag',
    'inp-bohrsystem': 'bohrsystem',
    'inp-bohrzeitraum': 'bohrzeitraum',
    'inp-verpresszeitraum': 'verpresszeitraum',
    'inp-hinweis': 'hinweis',
    'sigAnName': 'sigAnName',
    'sigAgName': 'sigAgName'
  };

  Object.entries(map).forEach(([id, key]) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', () => {
      state.meta[key] = el.value;
      saveDraftDebounced();
    });
    el.addEventListener('change', () => {
      state.meta[key] = el.value;
      saveDraftDebounced();
    });
  });
}

function applyMetaToInputs() {
  $('inp-datum').value = state.meta.datum || '';
  $('inp-proto-nr').value = state.meta.protoNr || '';
  $('inp-baustelle').value = state.meta.baustelle || '';
  $('inp-an').value = state.meta.an || 'HTB Baugesellschaft m.b.H.';
  $('inp-ag').value = state.meta.ag || '';
  $('inp-bohrsystem').value = state.meta.bohrsystem || '';
  $('inp-bohrzeitraum').value = state.meta.bohrzeitraum || '';
  $('inp-verpresszeitraum').value = state.meta.verpresszeitraum || '';
  $('inp-hinweis').value = state.meta.hinweis || '';
  $('sigAnName').value = state.meta.sigAnName || '';
  $('sigAgName').value = state.meta.sigAgName || '';
}

function applyState(snap) {
  if (!snap) return;

  state.meta = {
    ...state.meta,
    ...(snap.meta || {})
  };

  state.rows = Array.from({ length: ROWS }, (_, i) => ({
    ...emptyRow(),
    ...((snap.rows || [])[i] || {})
  }));

  state.sign = {
    an: snap.sign?.an || '',
    ag: snap.sign?.ag || ''
  };

  applyMetaToInputs();
  renderAllRows();
  renderTotals();
  renderReviewTable();

  refs.sigPads.an?.setFromDataURL?.(state.sign.an || '');
  refs.sigPads.ag?.setFromDataURL?.(state.sign.ag || '');
}

function snapshot() {
  return {
    v: VERSION,
    meta: clone(state.meta),
    rows: clone(state.rows),
    sign: {
      an: refs.sigPads.an?.getDataURL?.() || '',
      ag: refs.sigPads.ag?.getDataURL?.() || ''
    }
  };
}

const saveDraftDebounced = debounce(() => {
  try {
    localStorage.setItem(STORAGE_DRAFT, JSON.stringify(snapshot()));
  } catch {}
}, 250);

function loadDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_DRAFT);
    if (!raw) return;
    applyState(JSON.parse(raw));
  } catch {}
}

function readHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_HISTORY) || '[]');
  } catch {
    return [];
  }
}

function writeHistory(list) {
  try {
    localStorage.setItem(STORAGE_HISTORY, JSON.stringify(list.slice(0, HISTORY_MAX)));
  } catch {}
}

function saveToHistory() {
  const snap = snapshot();
  const sums = getSums();
  const entry = {
    id: uid(),
    savedAt: Date.now(),
    title: `${state.meta.baustelle || '—'} · Prot ${state.meta.protoNr || '—'} · ${dateDE(state.meta.datum)}`,
    snap,
    sums
  };

  const list = readHistory();
  list.unshift(entry);
  writeHistory(list);
  renderHistory();
}

function renderHistory() {
  const host = $('historyList');
  if (!host) return;

  const list = readHistory();
  if (!list.length) {
    host.innerHTML = `<div class="historyItem"><div class="historySub">Noch keine Protokolle gespeichert.</div></div>`;
    return;
  }

  host.innerHTML = '';

  list.forEach((entry) => {
    const div = document.createElement('div');
    div.className = 'historyItem';
    div.innerHTML = `
      <div class="historyTop">
        <span>${entry.title}</span>
        <span style="color:var(--muted);font-size:.82em">${new Date(entry.savedAt).toLocaleString('de-DE')}</span>
      </div>
      <div class="historySub">
        Nägel: <b>${entry.sums.count}</b> ·
        Zement: <b>${fmtDE(entry.sums.cement)} kg</b> ·
        Nagellänge: <b>${fmtDE(entry.sums.len)} m</b>
      </div>
      <div class="historyBtns">
        <button class="btn btn--ghost" type="button" data-act="load" data-id="${entry.id}">Laden</button>
        <button class="btn btn--ghost" type="button" data-act="pdf" data-id="${entry.id}">PDF</button>
        <button class="btn btn--ghost" type="button" data-act="del" data-id="${entry.id}">Löschen</button>
      </div>
    `;
    host.appendChild(div);
  });

  host.querySelectorAll('button[data-act]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      const list = readHistory();
      const entry = list.find((e) => e.id === id);

      if (act === 'load' && entry) {
        applyState(entry.snap);
        saveDraftDebounced();
        document.querySelector('.tab[data-tab="protokoll"]')?.click();
      }

      if (act === 'pdf' && entry) {
        await exportPdf(entry.snap);
      }

      if (act === 'del') {
        writeHistory(list.filter((e) => e.id !== id));
        renderHistory();
      }
    });
  });
}

function applySeries() {
  const from = Math.max(1, Math.min(ROWS, Number($('series-from').value || 1)));
  const to = Math.max(1, Math.min(ROWS, Number($('series-to').value || ROWS)));
  const a = Math.min(from, to) - 1;
  const b = Math.max(from, to) - 1;

  const values = {
    bez: $('series-bez').value,
    neigung: $('series-neigung').value.trim(),
    gewebe: $('series-gewebe').value,
    bohrloch: $('series-bohrloch').value.trim(),
    zement: $('series-zement').value.trim(),
    wz: $('series-wz').value.trim()
  };

  const pattern = $('series-pattern').value;

  for (let i = a; i <= b; i++) {
    if (values.bez) state.rows[i].bez = values.bez;
    if (values.neigung !== '') state.rows[i].neigung = values.neigung;
    if (values.gewebe !== '') state.rows[i].gewebe = values.gewebe;
    if (values.bohrloch !== '') state.rows[i].bohrloch = values.bohrloch;
    if (values.zement !== '') state.rows[i].zement = values.zement;
    if (values.wz !== '') state.rows[i].wz = values.wz;

    if (pattern && PATTERNS[pattern]) {
      state.rows[i].lv = PATTERNS[pattern].lv;
      state.rows[i].lb = PATTERNS[pattern].lb;
      state.rows[i].fv = PATTERNS[pattern].fv;
      state.rows[i].fb = PATTERNS[pattern].fb;
    }
  }

  renderAllRows();
  renderTotals();
  renderReviewTable();
  saveDraftDebounced();
}

function hookViewButtons() {
  $('btnViewCards')?.addEventListener('click', () => setView('cards'));
  $('btnViewTable')?.addEventListener('click', () => {
    renderReviewTable();
    setView('table');
  });
}

function hookJump() {
  $('btnJumpRow')?.addEventListener('click', () => {
    const idx = Number($('jumpRow').value || 0);
    openRow(idx);
  });
}

function hookSeries() {
  $('btnApplySeries')?.addEventListener('click', applySeries);
}

function resetAll() {
  state.meta = {
    datum: $('inp-datum')?.value || new Date().toISOString().slice(0, 10),
    protoNr: '',
    baustelle: '',
    an: 'HTB Baugesellschaft m.b.H.',
    ag: '',
    bohrsystem: '',
    bohrzeitraum: '',
    verpresszeitraum: '',
    hinweis: '',
    sigAnName: '',
    sigAgName: ''
  };

  state.rows = Array.from({ length: ROWS }, () => emptyRow());
  state.sign = { an: '', ag: '' };

  applyMetaToInputs();
  renderAllRows();
  renderTotals();
  renderReviewTable();

  refs.sigPads.an?.clear();
  refs.sigPads.ag?.clear();

  saveDraftDebounced();
}

function hookButtons() {
  $('btnReset')?.addEventListener('click', resetAll);

  $('btnSave')?.addEventListener('click', () => {
    saveToHistory();
    alert('Protokoll gespeichert.');
  });

  $('btnPdf')?.addEventListener('click', async () => {
    try {
      await exportPdf();
    } catch (err) {
      console.error(err);
      alert('PDF-Fehler: ' + (err?.message || String(err)));
    }
  });
}

function resizeCanvasForHiDPI(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(10, Math.floor(rect.width * dpr));
  const h = Math.max(10, Math.floor(rect.height * dpr));

  if (canvas.width === w && canvas.height === h) return;

  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function fillWhite(canvas) {
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, rect.width, rect.height);
  canvas.dataset.bg = '1';
}

function makeSignaturePad(canvas, onChange) {
  const ctx = canvas.getContext('2d');
  canvas.style.touchAction = 'none';

  let drawing = false;
  let last = null;
  let signed = false;

  function prep() {
    resizeCanvasForHiDPI(canvas);
    if (canvas.dataset.bg !== '1') fillWhite(canvas);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000';
  }

  function pos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    prep();
    drawing = true;
    last = pos(e);
    canvas.setPointerCapture?.(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
    signed = true;
  });

  function end(e) {
    if (!drawing) return;
    e?.preventDefault?.();
    drawing = false;
    last = null;
    onChange?.();
  }

  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', end);

  return {
    clear() {
      prep();
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      fillWhite(canvas);
      signed = false;
      onChange?.();
    },
    getDataURL() {
      return signed ? canvas.toDataURL('image/png') : '';
    },
    setFromDataURL(url) {
      prep();
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      fillWhite(canvas);
      if (!url) {
        signed = false;
        return;
      }
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        signed = true;
      };
      img.src = url;
    }
  };
}

function initSignaturePads() {
  const an = $('sigAnCanvas');
  const ag = $('sigAgCanvas');
  if (!an || !ag) return;

  refs.sigPads.an = makeSignaturePad(an, saveDraftDebounced);
  refs.sigPads.ag = makeSignaturePad(ag, saveDraftDebounced);

  $('sigAnClear')?.addEventListener('click', () => refs.sigPads.an.clear());
  $('sigAgClear')?.addEventListener('click', () => refs.sigPads.ag.clear());
}

function dataURLtoUint8(dataURL) {
  const b64 = String(dataURL || '').split(',')[1];
  if (!b64) return null;
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function svgToPngBytes(svgString, width, height) {
  return new Promise((resolve) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);

      canvas.toBlob(async (b) => {
        if (!b) return resolve(null);
        const ab = await b.arrayBuffer();
        resolve(new Uint8Array(ab));
      }, 'image/png');
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.src = url;
  });
}

async function exportPdf(optSnap = null) {
  const snap = optSnap || snapshot();
  const meta = snap.meta || {};

  if (!window.PDFLib) {
    alert('PDF-Library noch nicht geladen.');
    return;
  }

  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const pdf = await PDFDocument.create();
  const fontR = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);

  let logo = null;
  try {
    const pngBytes = await svgToPngBytes(LOGO_SVG, 512, 512);
    if (pngBytes) logo = await pdf.embedPng(pngBytes);
  } catch {}

  const pageW = 841.89;
  const pageH = 595.28;
  const page = pdf.addPage([pageW, pageH]);

  const K = rgb(0, 0, 0);
  const G = rgb(0.92, 0.92, 0.92);
  const G2 = rgb(0.85, 0.85, 0.85);
  const B = rgb(0.86, 0.92, 0.98);
  const GR = rgb(0.86, 0.96, 0.88);
  const W = rgb(1, 1, 1);

  const left = mm(8);
  const bottom = mm(7);
  const width = mm(281);
  const height = pageH - mm(14);
  const top = bottom + height;

  const row1H = mm(10);
  const row2H = mm(8);
  const row3H = meta.hinweis ? mm(7) : 0;
  const groupH = mm(7);
  const colH = mm(8);
  const sum1H = mm(8);
  const sum2H = mm(8);
  const sigH = mm(18);

  const dataRowH = (height - row1H - row2H - row3H - groupH - colH - sum1H - sum2H - sigH) / ROWS;

  function drawRect(x, yTop, w, h, fill, borderWidth = 0.5) {
    page.drawRectangle({
      x,
      y: yTop - h,
      width: w,
      height: h,
      color: fill || undefined,
      borderColor: K,
      borderWidth
    });
  }

  function fitText(text, font, size, maxWidth) {
    let s = String(text ?? '');
    if (!s) return '';
    const measure = (t) => font.widthOfTextAtSize(t, size);
    if (measure(s) <= maxWidth) return s;
    while (s.length > 1 && measure(s + '…') > maxWidth) s = s.slice(0, -1);
    return s ? s + '…' : '';
  }

  function drawTextCell(text, x, yTop, w, h, font, size, align = 'left', pad = mm(0.8)) {
    const raw = String(text ?? '').trim();
    if (!raw) return;
    const fitted = fitText(raw, font, size, Math.max(1, w - pad * 2));
    const tw = font.widthOfTextAtSize(fitted, size);

    let tx = x + pad;
    if (align === 'center') tx = x + (w - tw) / 2;
    if (align === 'right') tx = x + w - pad - tw;

    const ty = yTop - h + (h - size) / 2 + 1.5;
    page.drawText(fitted, { x: tx, y: ty, size, font, color: K });
  }

  function drawMultiCell(lines, x, yTop, w, h, font, size) {
    const arr = Array.isArray(lines) ? lines.filter(Boolean) : [String(lines)];
    if (!arr.length) return;
    const gap = size + 1;
    const total = arr.length * gap;
    const startY = yTop - h + (h - total) / 2 + gap - 1;
    arr.forEach((line, idx) => {
      const fitted = fitText(line, font, size, w - mm(1.6));
      const tw = font.widthOfTextAtSize(fitted, size);
      page.drawText(fitted, {
        x: x + (w - tw) / 2,
        y: startY + (arr.length - 1 - idx) * gap,
        size,
        font,
        color: K
      });
    });
  }

  page.drawRectangle({
    x: left,
    y: bottom,
    width,
    height,
    borderColor: K,
    borderWidth: 1
  });

  let y = top;

  const logoW = mm(28);
  const restW = width - logoW;
  const c1 = mm(110);
  const c2 = mm(55);
  const c3 = restW - c1 - c2;

  drawRect(left, y, logoW, row1H, G2, 0.8);
  drawRect(left + logoW, y, restW, row1H, G2, 0.8);

  page.drawLine({ start: { x: left + logoW + c1, y: y - row1H }, end: { x: left + logoW + c1, y }, thickness: 0.5, color: K });
  page.drawLine({ start: { x: left + logoW + c1 + c2, y: y - row1H }, end: { x: left + logoW + c1 + c2, y }, thickness: 0.5, color: K });

  if (logo) {
    const h = row1H * 0.78;
    const scale = h / logo.height;
    const w = logo.width * scale;
    page.drawImage(logo, {
      x: left + (logoW - w) / 2,
      y: y - row1H + (row1H - h) / 2,
      width: w,
      height: h
    });
  }

  drawTextCell('Auftragnehmer:', left + logoW, y, mm(25), row1H, fontB, 7);
  drawTextCell(meta.an || '', left + logoW + mm(25), y, c1 - mm(25), row1H, fontR, 8);

  drawTextCell('Bohrprotokoll Nr.:', left + logoW + c1, y, mm(30), row1H, fontB, 7);
  drawTextCell(meta.protoNr || '', left + logoW + c1 + mm(30), y, c2 - mm(30), row1H, fontB, 9);

  drawTextCell('Auftraggeber:', left + logoW + c1 + c2, y, mm(22), row1H, fontB, 7);
  drawTextCell(meta.ag || '', left + logoW + c1 + c2 + mm(22), y, c3 - mm(22), row1H, fontR, 8);

  y -= row1H;

  const row2Left = mm(160);
  const row2Right = width - row2Left;

  drawRect(left, y, width, row2H, G, 0.8);
  page.drawLine({ start: { x: left + row2Left, y: y - row2H }, end: { x: left + row2Left, y }, thickness: 0.5, color: K });

  drawTextCell('Bohrsystem:', left, y, mm(20), row2H, fontB, 7);
  drawTextCell(meta.bohrsystem || '', left + mm(20), y, row2Left - mm(20), row2H, fontR, 7.5);

  drawTextCell('Baustelle:', left + row2Left, y, mm(18), row2H, fontB, 7);
  drawTextCell(meta.baustelle || '', left + row2Left + mm(18), y, row2Right - mm(18), row2H, fontR, 7.5);

  y -= row2H;

  if (row3H > 0) {
    drawRect(left, y, width, row3H, W, 0.8);
    drawTextCell(meta.hinweis || '', left, y, width, row3H, fontR, 7);
    y -= row3H;
  }

  const colMM = [14, 14, 25, 15, 15, 16, 12, 13, 13, 13, 13, 13, 13, 14, 78];
  const col = colMM.map(mm);
  const xPos = [];
  let run = left;
  col.forEach((w) => { xPos.push(run); run += w; });

  const nagelDataW = col.slice(0, 7).reduce((a, b) => a + b, 0);
  const lockW = col[7] + col[8] + col[9];
  const felsW = col[10] + col[11] + col[12];

  drawRect(left, y, nagelDataW, groupH, G, 0.8);
  drawRect(xPos[7], y, lockW, groupH, B, 0.8);
  drawRect(xPos[10], y, felsW, groupH, GR, 0.8);
  drawRect(xPos[13], y, col[13], groupH, G, 0.8);
  drawRect(xPos[14], y, col[14], groupH, G, 0.8);

  drawTextCell('Nageldaten', left, y, nagelDataW, groupH, fontB, 7, 'center');
  drawTextCell('Lockergestein', xPos[7], y, lockW, groupH, fontB, 7, 'center');
  drawTextCell('Fels', xPos[10], y, felsW, groupH, fontB, 7, 'center');
  drawTextCell('Nagel [m]', xPos[13], y, col[13], groupH, fontB, 6.5, 'center');
  drawTextCell('Anmerkungen', xPos[14], y, col[14], groupH, fontB, 6.5, 'center');

  y -= groupH;

  drawRect(left, y, width, colH, G, 0.8);
  for (let i = 1; i < xPos.length; i++) {
    page.drawLine({ start: { x: xPos[i], y: y - colH }, end: { x: xPos[i], y }, thickness: 0.5, color: K });
  }

  const labels = [
    ['Nr.'],
    ['Neigung', '[°]'],
    ['Bezeichnung'],
    ['Gewebe-', 'strumpf'],
    ['Bohrloch', 'ø [mm]'],
    ['Zement', '[kg]'],
    ['W/Z-', 'Wert'],
    ['von [m]'],
    ['bis [m]'],
    ['Diff. [m]'],
    ['von [m]'],
    ['bis [m]'],
    ['Diff. [m]'],
    [''],
    ['']
  ];

  labels.forEach((lines, i) => {
    if (i >= 13) return;
    drawMultiCell(lines, xPos[i], y, col[i], colH, fontB, 6.2);
  });

  y -= colH;

  const rows = (snap.rows || []).slice(0, ROWS);

  for (let i = 0; i < ROWS; i++) {
    const r = rows[i] || {};
    const fill = i % 2 === 0 ? rgb(0.98, 0.98, 0.98) : W;
    drawRect(left, y, width, dataRowH, fill, 0.3);

    for (let c = 1; c < xPos.length; c++) {
      page.drawLine({
        start: { x: xPos[c], y: y - dataRowH },
        end: { x: xPos[c], y },
        thickness: 0.25,
        color: K
      });
    }

    const d = computeRow(r);

    const vals = [
      r.nr || '',
      r.neigung || '',
      (r.bez && r.bez !== '–') ? r.bez : '',
      r.gewebe || '',
      r.bohrloch || '',
      r.zement !== '' ? fmtDE(num(r.zement)) : '',
      r.wz || '',
      r.lv !== '' ? fmtDE(num(r.lv)) : '',
      r.lb !== '' ? fmtDE(num(r.lb)) : '',
      (r.lv !== '' || r.lb !== '') ? fmtDE(d.ld) : '',
      r.fv !== '' ? fmtDE(num(r.fv)) : '',
      r.fb !== '' ? fmtDE(num(r.fb)) : '',
      (r.fv !== '' || r.fb !== '') ? fmtDE(d.fd) : '',
      d.len > 0 ? fmtDE(d.len) : '',
      r.note || ''
    ];

    vals.forEach((val, c) => {
      if (!val) return;
      let align = 'center';
      let size = 5.7;
      if (c === 0 || c === 2 || c === 14) align = 'left';
      if ([5, 7, 8, 9, 10, 11, 12, 13].includes(c)) align = 'right';
      if (c === 14) size = 5.5;
      drawTextCell(val, xPos[c], y, col[c], dataRowH, fontR, size, align);
    });

    y -= dataRowH;
  }

  drawRect(left, y, width, sum1H, G, 0.8);

  const third = width / 3;
  page.drawLine({ start: { x: left + third, y: y - sum1H }, end: { x: left + third, y }, thickness: 0.5, color: K });
  page.drawLine({ start: { x: left + third * 2, y: y - sum1H }, end: { x: left + third * 2, y }, thickness: 0.5, color: K });

  const sums = (() => {
    let count = 0, cement = 0, len = 0;
    rows.forEach((r) => {
      const d = computeRow(r);
      if (d.any) {
        count++;
        cement += num(r.zement);
        len += d.len;
      }
    });
    return { count, cement, len };
  })();

  drawTextCell(`Nagelanzahl [Stk.]: ${sums.count}`, left, y, third, sum1H, fontB, 8);
  drawTextCell(`Zement ges. [kg]: ${fmtDE(sums.cement)}`, left + third, y, third, sum1H, fontB, 8);
  drawTextCell(`Nagellänge ges. [m]: ${fmtDE(sums.len)}`, left + third * 2, y, third, sum1H, fontB, 8);

  y -= sum1H;

  drawRect(left, y, width, sum2H, W, 0.8);
  const q = width / 4;
  page.drawLine({ start: { x: left + q, y: y - sum2H }, end: { x: left + q, y }, thickness: 0.5, color: K });
  page.drawLine({ start: { x: left + q * 2, y: y - sum2H }, end: { x: left + q * 2, y }, thickness: 0.5, color: K });
  page.drawLine({ start: { x: left + q * 3, y: y - sum2H }, end: { x: left + q * 3, y }, thickness: 0.5, color: K });

  drawTextCell(`Bohrzeitraum: ${meta.bohrzeitraum || ''}`, left, y, q, sum2H, fontR, 7);
  drawTextCell(`Verpresszeitraum: ${meta.verpresszeitraum || ''}`, left + q, y, q, sum2H, fontR, 7);
  drawTextCell('Für den Auftragnehmer:', left + q * 2, y, q, sum2H, fontR, 7);
  drawTextCell('Für den Auftraggeber:', left + q * 3, y, q, sum2H, fontR, 7);

  y -= sum2H;

  drawRect(left, y, width, sigH, W, 0.8);
  page.drawLine({ start: { x: left + width / 2, y: y - sigH }, end: { x: left + width / 2, y }, thickness: 0.5, color: K });

  drawTextCell(meta.sigAnName ? `i.A. ${meta.sigAnName}` : '', left, y, width / 2, mm(4.5), fontR, 7);
  drawTextCell(meta.sigAgName || '', left + width / 2, y, width / 2, mm(4.5), fontR, 7);

  async function drawSignature(dataUrl, x, yTop, w, h) {
    const u8 = dataURLtoUint8(dataUrl);
    if (!u8) return;
    const img = await pdf.embedPng(u8);
    const pad = mm(2);
    const aw = Math.max(1, w - pad * 2);
    const ah = Math.max(1, h - pad * 2);
    const scale = Math.min(aw / img.width, ah / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    page.drawImage(img, {
      x: x + (w - dw) / 2,
      y: yTop - h + (h - dh) / 2,
      width: dw,
      height: dh
    });
  }

  await drawSignature(snap.sign?.an || '', left, y - mm(4.5), width / 2, sigH - mm(4.5));
  await drawSignature(snap.sign?.ag || '', left + width / 2, y - mm(4.5), width / 2, sigH - mm(4.5));

  const bytes = await pdf.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');

  if (!win) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meta.protoNr || 'X'}_Bohrprotokoll_${(meta.baustelle || 'Baustelle').replace(/\s+/g, '_')}.pdf`;
    a.click();
  }

  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function initInstallButton() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    const btn = $('btnInstall');
    if (btn) btn.hidden = false;
  });

  $('btnInstall')?.addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result?.outcome === 'accepted') $('btnInstall').hidden = true;
    installPrompt = null;
  });

  window.addEventListener('appinstalled', () => {
    $('btnInstall') && ($('btnInstall').hidden = true);
    installPrompt = null;
  });
}

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register(`sw.js?v=${VERSION}`, { updateViaCache: 'none' });
    reg.update().catch(() => {});
  } catch {}
}

window.addEventListener('DOMContentLoaded', async () => {
  if (!state.meta.datum) {
    state.meta.datum = new Date().toISOString().slice(0, 10);
  }

  initTabs();
  buildJumpRow();
  buildSeriesSelects();
  buildCards();
  bindMetaInputs();
  initSignaturePads();
  hookViewButtons();
  hookJump();
  hookSeries();
  hookButtons();
  initInstallButton();

  applyMetaToInputs();
  renderAllRows();
  renderTotals();
  renderReviewTable();
  setView('cards');

  loadDraft();
  renderHistory();

  registerSW();
});
