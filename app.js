'use strict';
console.log('HTB Bohrprotokoll Zaun app.js v2 loaded');

/* ─── Konstanten ─────────────────────────────────── */
const STORAGE_DRAFT   = 'htb-bohrz-draft-v2';
const STORAGE_HISTORY = 'htb-bohrz-history-v2';
const HISTORY_MAX     = 30;
const ROWS            = 25;

const $ = id => document.getElementById(id);

/* ─── Bezeichnung-Dropdown (nur Bezeichnung, keine Auto-Fill) ── */
const BEZEICHNUNGEN = [
  '–',
  'TI 30/11',
  'TI30/11',
  'TI 40/20',
  'TI40/20',
  'Seilanker 14,5 mm',
  'TITAN 30/11',
  'TITAN 40/20',
  'Sonstiges',
];

/* ─── Helpers ──────────────────────────────────── */
function fmtC(n, d = 2) { return Number(n || 0).toFixed(d).replace('.', ','); }
function num(v) { const x = Number(String(v || '').replace(',', '.')); return isNaN(x) ? 0 : x; }
function uid() { return crypto?.randomUUID?.() || ('id_' + Date.now() + '_' + Math.random().toString(16).slice(2)); }
function dateDE(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return s;
}
function dateName(d = new Date()) {
  return String(d.getDate()).padStart(2, '0') +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getFullYear());
}

/* ─── Row refs ─────────────────────────────────── */
let rowRefs = [];
let sigPads = { an: null, ag: null };

/* ─── Tabs ─────────────────────────────────────── */
function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.toggle('is-active', b === btn));
      document.querySelectorAll('.pane').forEach(p => {
        const on = p.id === `tab-${btn.dataset.tab}`;
        p.classList.toggle('is-active', on);
        p.hidden = !on;
      });
      if (btn.dataset.tab === 'verlauf') renderHistory();
    });
  });
}

/* ─── Table build (fix 25 Zeilen) ──────────────── */
function buildTable() {
  const tbody = $('nailBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  rowRefs = [];

  for (let i = 0; i < ROWS; i++) {
    const tr = document.createElement('tr');

    // helper: input
    const mkI = (type, cls, placeholder) => {
      const inp = document.createElement('input');
      inp.type = type;
      if (cls) inp.className = cls;
      if (placeholder) inp.placeholder = placeholder;
      if (type === 'number') { inp.step = '0.01'; inp.inputMode = 'decimal'; }
      inp.addEventListener('input', () => { recalc(); draftDebounce(); });
      return inp;
    };

    // Nr
    const inpNr = mkI('text', 'inp-nr');
    td(tr, inpNr);

    // Neigung
    const inpNei = mkI('number', '');
    inpNei.step = '1'; inpNei.min = '0'; inpNei.max = '90';
    inpNei.style.width = '58px';
    td(tr, inpNei);

    // Bezeichnung – DROPDOWN
    const selBez = document.createElement('select');
    selBez.className = 'sel-bez';
    BEZEICHNUNGEN.forEach(b => selBez.appendChild(new Option(b, b)));
    selBez.addEventListener('change', () => { recalc(); draftDebounce(); });
    td(tr, selBez);

    // Gewebe-strumpf
    const inpGew = mkI('text', 'inp-gew');
    inpGew.value = 'nein';
    td(tr, inpGew);

    // Bohrloch ø
    const inpBohr = mkI('number', '');
    inpBohr.step = '1'; inpBohr.style.width = '65px';
    td(tr, inpBohr);

    // Zement
    const inpZem = mkI('number', '');
    inpZem.style.width = '70px';
    td(tr, inpZem);

    // W/Z
    const inpWZ = mkI('number', '');
    inpWZ.step = '0.01'; inpWZ.style.width = '58px';
    td(tr, inpWZ);

    // Lockergestein von/bis/diff
    const inpLv = mkI('number', ''); inpLv.style.width = '60px';
    const inpLb = mkI('number', ''); inpLb.style.width = '60px';
    const tdLd  = document.createElement('td'); tdLd.className = 'td-diff'; tdLd.textContent = '–';
    td(tr, inpLv); td(tr, inpLb); tr.appendChild(tdLd);

    // Fels von/bis/diff
    const inpFv = mkI('number', ''); inpFv.style.width = '60px';
    const inpFb = mkI('number', ''); inpFb.style.width = '60px';
    const tdFd  = document.createElement('td'); tdFd.className = 'td-diff'; tdFd.textContent = '–';
    td(tr, inpFv); td(tr, inpFb); tr.appendChild(tdFd);

    // Nagel [m] (auto-berechnet)
    const tdLen = document.createElement('td'); tdLen.className = 'td-len'; tdLen.textContent = '–';
    tr.appendChild(tdLen);

    // Anmerkungen
    const inpNote = mkI('text', 'inp-note');
    td(tr, inpNote);

    tbody.appendChild(tr);

    rowRefs.push({
      inpNr, inpNei, selBez, inpGew, inpBohr, inpZem, inpWZ,
      inpLv, inpLb, tdLd, inpFv, inpFb, tdFd, tdLen, inpNote
    });
  }
}

function td(tr, el) {
  const cell = document.createElement('td');
  cell.appendChild(el);
  tr.appendChild(cell);
  return cell;
}

/* ─── Recalc ───────────────────────────────────── */
function recalc() {
  let count = 0, sumCem = 0, sumLen = 0;

  rowRefs.forEach(r => {
    const lv = num(r.inpLv.value), lb = num(r.inpLb.value);
    const fv = num(r.inpFv.value), fb = num(r.inpFb.value);
    const ld = Math.max(0, lb - lv);
    const fd = Math.max(0, fb - fv);

    r.tdLd.textContent = (r.inpLv.value !== '' || r.inpLb.value !== '') ? fmtC(ld) : '–';
    r.tdFd.textContent = (r.inpFv.value !== '' || r.inpFb.value !== '') ? fmtC(fd) : '–';

    // Nagellänge = Max(Lockergestein_bis, Fels_bis)
    const len = Math.max(lb, fb);
    r.tdLen.textContent = len > 0 ? fmtC(len) : '–';

    const cem = num(r.inpZem.value);
    const hasData = r.inpNr.value.trim() !== ''
      || num(r.inpNei.value) > 0
      || (r.selBez.value && r.selBez.value !== '–')
      || cem > 0 || len > 0;

    if (hasData) { count++; sumCem += cem; sumLen += len; }
  });

  $('sumCount')  && ($('sumCount').textContent  = String(count));
  $('sumCement') && ($('sumCement').textContent = fmtC(sumCem, 2));
  $('sumLen')    && ($('sumLen').textContent    = fmtC(sumLen, 2));
}

/* ─── Draft / State ────────────────────────────── */
function collectState() {
  return {
    v: 2,
    meta: {
      datum:           $('inp-datum')?.value || '',
      protoNr:         $('inp-proto-nr')?.value || '',
      baustelle:       $('inp-baustelle')?.value || '',
      an:              $('inp-an')?.value || '',
      ag:              $('inp-ag')?.value || '',
      bohrsystem:      $('inp-bohrsystem')?.value || '',
      bohrzeitraum:    $('inp-bohrzeitraum')?.value || '',
      verpresszeitraum:$('inp-verpresszeitraum')?.value || '',
      bereich:         $('inp-bereich')?.value || '',
      sigAnName:       $('sigAnName')?.value || '',
      sigAgName:       $('sigAgName')?.value || '',
    },
    nails: rowRefs.map(r => ({
      nr:      r.inpNr.value,
      nei:     r.inpNei.value,
      bez:     r.selBez.value,
      gew:     r.inpGew.value,
      bohr:    r.inpBohr.value,
      zem:     r.inpZem.value,
      wz:      r.inpWZ.value,
      lv:      r.inpLv.value,
      lb:      r.inpLb.value,
      fv:      r.inpFv.value,
      fb:      r.inpFb.value,
      note:    r.inpNote.value,
    })),
    sign: {
      an: sigPads.an?.getDataURL?.() || '',
      ag: sigPads.ag?.getDataURL?.() || '',
    }
  };
}

function applyState(s) {
  if (!s?.meta) return;
  const m = s.meta;
  $('inp-datum').value            = m.datum || '';
  $('inp-proto-nr').value         = m.protoNr || '';
  $('inp-baustelle').value        = m.baustelle || '';
  $('inp-an').value               = m.an || 'HTB Baugesellschaft m.b.H.';
  $('inp-ag').value               = m.ag || '';
  $('inp-bohrsystem').value       = m.bohrsystem || '';
  $('inp-bohrzeitraum').value     = m.bohrzeitraum || '';
  $('inp-verpresszeitraum').value = m.verpresszeitraum || '';
  $('inp-bereich').value          = m.bereich || '';
  $('sigAnName').value            = m.sigAnName || '';
  $('sigAgName').value            = m.sigAgName || '';

  (s.nails || []).slice(0, ROWS).forEach((n, i) => {
    const r = rowRefs[i]; if (!r) return;
    r.inpNr.value   = n.nr   ?? '';
    r.inpNei.value  = n.nei  ?? '';
    r.selBez.value  = n.bez  ?? '–';
    r.inpGew.value  = n.gew  ?? 'nein';
    r.inpBohr.value = n.bohr ?? '';
    r.inpZem.value  = n.zem  ?? '';
    r.inpWZ.value   = n.wz   ?? '';
    r.inpLv.value   = n.lv   ?? '';
    r.inpLb.value   = n.lb   ?? '';
    r.inpFv.value   = n.fv   ?? '';
    r.inpFb.value   = n.fb   ?? '';
    r.inpNote.value = n.note ?? '';
  });

  sigPads.an?.setFromDataURL?.(s.sign?.an || '');
  sigPads.ag?.setFromDataURL?.(s.sign?.ag || '');
  recalc();
}

let _dT = null;
function draftDebounce() {
  clearTimeout(_dT);
  _dT = setTimeout(() => {
    try { localStorage.setItem(STORAGE_DRAFT, JSON.stringify(collectState())); } catch {}
  }, 300);
}
function loadDraft() {
  try {
    const r = localStorage.getItem(STORAGE_DRAFT);
    if (r) applyState(JSON.parse(r));
  } catch {}
}

/* ─── History ──────────────────────────────────── */
function readHist() { try { return JSON.parse(localStorage.getItem(STORAGE_HISTORY) || '[]'); } catch { return []; } }
function writeHist(list) { try { localStorage.setItem(STORAGE_HISTORY, JSON.stringify(list.slice(0, HISTORY_MAX))); } catch {} }

function sumsOf(snap) {
  let cnt = 0, cem = 0, len = 0;
  (snap.nails || []).forEach(n => {
    const lb = num(n.lb), fb = num(n.fb);
    const L = Math.max(lb, fb);
    const C = num(n.zem);
    const has = (n.nr || '').trim() !== '' || num(n.nei) > 0 || C > 0 || L > 0;
    if (has) { cnt++; cem += C; len += L; }
  });
  return { cnt, cem, len };
}

function saveToHistory() {
  const snap  = collectState();
  const sums  = sumsOf(snap);
  const title = `${snap.meta.baustelle || '—'} · Prot. ${snap.meta.protoNr || '—'} · ${dateDE(snap.meta.datum)}`;
  const entry = { id: uid(), savedAt: Date.now(), title, snap, sums };
  const list  = readHist();
  list.unshift(entry);
  writeHist(list);
  renderHistory();
}

function renderHistory() {
  const host = $('historyList');
  if (!host) return;
  const list = readHist();
  if (!list.length) {
    host.innerHTML = '<div class="historyItem"><div class="historySub">Noch keine Protokolle gespeichert.</div></div>';
    return;
  }
  host.innerHTML = '';
  list.forEach(entry => {
    const s = entry.sums || sumsOf(entry.snap);
    const div = document.createElement('div');
    div.className = 'historyItem';
    div.innerHTML = `
      <div class="historyTop">
        <span>${entry.title}</span>
        <span style="color:var(--muted);font-size:.82em">${new Date(entry.savedAt).toLocaleString('de-DE')}</span>
      </div>
      <div class="historySub">
        Nägel: <b>${s.cnt}</b> · Zement: <b>${fmtC(s.cem, 2)} kg</b> · Länge: <b>${fmtC(s.len, 2)} m</b>
      </div>
      <div class="historyBtns">
        <button class="btn btn--ghost" type="button" data-act="load" data-id="${entry.id}">Laden</button>
        <button class="btn btn--ghost" type="button" data-act="pdf"  data-id="${entry.id}">PDF</button>
        <button class="btn btn--ghost" type="button" data-act="del"  data-id="${entry.id}">Löschen</button>
      </div>`;
    host.appendChild(div);
  });
  host.querySelectorAll('button[data-act]').forEach(b => {
    b.addEventListener('click', async () => {
      const { id, act } = b.dataset;
      if (act === 'del') { writeHist(readHist().filter(e => e.id !== id)); renderHistory(); }
      if (act === 'load') {
        const e = readHist().find(e => e.id === id);
        if (!e) return;
        applyState(e.snap); draftDebounce();
        document.querySelector('.tab[data-tab="protokoll"]')?.click();
      }
      if (act === 'pdf') {
        const e = readHist().find(e => e.id === id);
        if (e) await exportPdf(e.snap);
      }
    });
  });
}

/* ─── Signature Pads ───────────────────────────── */
function initSigPads() {
  sigPads.an = makeSigPad($('sigAnCanvas'), draftDebounce);
  sigPads.ag = makeSigPad($('sigAgCanvas'), draftDebounce);
  $('sigAnClear')?.addEventListener('click', () => sigPads.an.clear());
  $('sigAgClear')?.addEventListener('click', () => sigPads.ag.clear());
}

function makeSigPad(canvas, onChange) {
  if (!canvas) return { getDataURL: () => '', setFromDataURL: () => {}, clear: () => {} };
  const ctx = canvas.getContext('2d');
  let drawing = false, last = null, signed = false;

  function prep() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(10, Math.floor(rect.width * dpr));
    const h = Math.max(10, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    if (!canvas.dataset.bg) fillWhite();
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#000';
  }
  function fillWhite() {
    const r = canvas.getBoundingClientRect();
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, r.width, r.height);
    canvas.dataset.bg = '1';
  }
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  canvas.addEventListener('pointerdown', e => { e.preventDefault(); prep(); drawing = true; last = pos(e); canvas.setPointerCapture?.(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!drawing) return; e.preventDefault();
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p; signed = true;
  });
  const end = e => { if (!drawing) return; e?.preventDefault?.(); drawing = false; last = null; onChange?.(); };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', end);

  return {
    clear() {
      prep();
      const r = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, r.width, r.height);
      fillWhite(); signed = false; onChange?.();
    },
    getDataURL() { return signed ? canvas.toDataURL('image/png') : ''; },
    setFromDataURL(url) {
      prep();
      const r = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, r.width, r.height); fillWhite();
      if (!url) { signed = false; return; }
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, r.width, r.height); signed = true; };
      img.src = url;
    }
  };
}

/* ─── PDF Export (1:1 Vorlage, A4 Querformat) ─── */
function u8fromDataURL(url) {
  const b64 = String(url || '').split(',')[1];
  if (!b64) return null;
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

async function exportPdf(optSnap) {
  const snap = optSnap || collectState();
  const meta = snap.meta || {};

  if (!window.PDFLib) { alert('PDF-Library lädt noch. Bitte kurz warten.'); return; }

  const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
  const pdf = await PDFDocument.create();

  // Fonts – versuche fontkit + Arial, Fallback Helvetica
  let fR, fB;
  if (window.fontkit) pdf.registerFontkit(window.fontkit);
  try {
    const ar = await fetch('arial.ttf').then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); });
    fR = await pdf.embedFont(ar, { subset: true });
    const ab = await fetch('ARIALBD.TTF').then(r => r.ok ? r.arrayBuffer() : null);
    fB = ab ? await pdf.embedFont(ab, { subset: true }) : fR;
  } catch {
    fR = await pdf.embedFont(StandardFonts.Helvetica);
    fB = await pdf.embedFont(StandardFonts.HelveticaBold);
  }

  // Logo einbetten
  let logo = null;
  try {
    const lb = await fetch('logo.png').then(r => r.ok ? r.arrayBuffer() : null);
    if (lb) logo = await pdf.embedPng(lb);
  } catch {}

  // A4 Querformat: 841.89 x 595.28 pt
  const page = pdf.addPage([841.89, 595.28]);
  const W = 841.89, H = 595.28;
  const mm = v => v * 72 / 25.4;
  const K  = rgb(0, 0, 0);
  const LGREY = rgb(0.88, 0.88, 0.88);
  const DGREY = rgb(0.50, 0.50, 0.50);

  const ml = mm(8), mr = mm(8), mt = mm(6), mb = mm(6);
  const x0 = ml, y0 = mb;
  const PW = W - ml - mr;  // usable width
  const PH = H - mt - mb;  // usable height

  const line = (x1, y1, x2, y2, t = 0.5, c = K) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: t, color: c });
  const rect = (x, y, w, h, opts = {}) =>
    page.drawRectangle({ x, y, width: w, height: h, ...opts });
  const text = (t, x, y, opts = {}) => {
    const s = String(t ?? '').trim();
    if (!s) return;
    page.drawText(s, { x, y, font: fR, size: 8, color: K, ...opts });
  };
  const textB = (t, x, y, opts = {}) => text(t, x, y, { font: fB, ...opts });

  // ── RAHMEN ────────────────────────────────────────────
  rect(x0, y0, PW, PH, { borderColor: K, borderWidth: 1.2 });

  // ── LOGO BLOCK (links oben) ────────────────────────────
  const logoBoxW = mm(28);
  const hdr1H    = mm(13); // 1. Kopfzeile Höhe
  const hdr1Y    = y0 + PH - hdr1H;

  rect(x0, hdr1Y, logoBoxW, hdr1H, { color: LGREY, borderColor: K, borderWidth: 1 });

  if (logo) {
    const lh = hdr1H * 0.75;
    const ls = lh / logo.height;
    const lw = logo.width * ls;
    page.drawImage(logo, {
      x: x0 + (logoBoxW - lw) / 2,
      y: hdr1Y + (hdr1H - lh) / 2,
      width: lw, height: lh
    });
  } else {
    textB('HTB', x0 + mm(3), hdr1Y + mm(4), { size: 11 });
  }

  // ── HEADER BLOCK ──────────────────────────────────────
  // Zeile 1: Auftragnehmer | Bohrprotokoll Nr. | Auftraggeber
  const hdrX = x0 + logoBoxW;
  const hdrW = PW - logoBoxW;
  const col3 = hdrW / 3;

  // Hintergrund Zeile 1
  rect(hdrX, hdr1Y, hdrW, hdr1H, { color: LGREY, borderColor: K, borderWidth: 1 });

  // Spaltentrennlinien
  line(hdrX + col3,       hdr1Y, hdrX + col3,       hdr1Y + hdr1H);
  line(hdrX + col3 * 2,   hdr1Y, hdrX + col3 * 2,   hdr1Y + hdr1H);

  const hy1 = hdr1Y + mm(4.5);
  textB('Auftragnehmer:', hdrX + mm(2), hy1 + mm(1.5), { size: 7 });
  text(meta.an || '', hdrX + mm(30), hy1 + mm(1.5));

  const cx2 = hdrX + col3;
  textB('Bohrprotokoll Nr.:', cx2 + mm(2), hy1 + mm(1.5), { size: 7 });
  text(meta.protoNr || '', cx2 + mm(30), hy1 + mm(1.5), { font: fB, size: 9 });

  const cx3 = hdrX + col3 * 2;
  textB('Auftraggeber:', cx3 + mm(2), hy1 + mm(1.5), { size: 7 });
  text(meta.ag || '', cx3 + mm(25), hy1 + mm(1.5));

  // Zeile 2: Bohrsystem | (Datum) | Baustelle
  const hdr2H = mm(8);
  const hdr2Y = hdr1Y - hdr2H;
  rect(x0, hdr2Y, PW, hdr2H, { borderColor: K, borderWidth: 0.8 });
  line(hdrX + col3,     hdr2Y, hdrX + col3,     hdr2Y + hdr2H);
  line(hdrX + col3 * 2, hdr2Y, hdrX + col3 * 2, hdr2Y + hdr2H);

  textB('Bohrsystem:',   x0 + mm(2),            hdr2Y + mm(2.2), { size: 7 });
  text(meta.bohrsystem || '', x0 + mm(24),       hdr2Y + mm(2.2));

  textB('Datum:',               cx2 + mm(2),  hdr2Y + mm(2.2), { size: 7 });
  text(dateDE(meta.datum) || '',cx2 + mm(18), hdr2Y + mm(2.2));

  textB('Baustelle:',    cx3 + mm(2),  hdr2Y + mm(2.2), { size: 7 });
  text(meta.baustelle || '', cx3 + mm(20), hdr2Y + mm(2.2));

  // Hinweis-Zeile (optional, wenn Bereich/Hinweis gesetzt)
  let tableTopY = hdr2Y;
  if (meta.bereich && meta.bereich.trim()) {
    const hdr3H = mm(7);
    const hdr3Y = hdr2Y - hdr3H;
    rect(x0, hdr3Y, PW, hdr3H, { borderColor: K, borderWidth: 0.6 });
    text(meta.bereich, x0 + mm(2), hdr3Y + mm(2.1), { size: 7.5, color: DGREY });
    tableTopY = hdr3Y;
  }

  // ── TABELLEN-HEADER ───────────────────────────────────
  // Spaltenbreiten (mm) → angepasst auf A4 quer
  // Nr | Nei | Bez | Gew | Bohr | Zem | WZ | Lv | Lb | Ld | Fv | Fb | Fd | Len | Anm
  const CW = [
    mm(13),  // Nr
    mm(12),  // Neigung
    mm(22),  // Bezeichnung
    mm(13),  // Gewebe
    mm(14),  // Bohrloch
    mm(14),  // Zement
    mm(11),  // W/Z
    mm(13),  // Lv
    mm(13),  // Lb
    mm(13),  // Ldiff
    mm(13),  // Fv
    mm(13),  // Fb
    mm(13),  // Fdiff
    mm(14),  // Nagel
    0,       // Anmerkungen = Rest
  ];
  // Rest-Breite für Anmerkungen
  const fixedW = CW.slice(0, 14).reduce((a, b) => a + b, 0);
  CW[14] = PW - fixedW;

  // X-Positionen der Spalten
  const CX = [];
  let cx = x0;
  CW.forEach(w => { CX.push(cx); cx += w; });

  const thH1 = mm(6.5);  // Tabellen-Header Zeile 1 (Gruppe)
  const thH2 = mm(6);    // Tabellen-Header Zeile 2 (Unterzeile)
  const thTotal = thH1 + thH2;

  const thY2 = tableTopY - thTotal; // Zeile 2 (untere)
  const thY1 = tableTopY - thH1;   // Zeile 1 (obere)

  // Hintergrund Header
  rect(x0, thY2, PW, thTotal, { color: LGREY, borderColor: K, borderWidth: 0.8 });

  // Gruppenüberschriften (merge über Lockergestein-Spalten, Fels-Spalten)
  // Zeile 1: Nageldaten | | | | | | | Lockergestein(3) | Fels(3) | |
  const grpLockX = CX[7];
  const grpLockW = CW[7] + CW[8] + CW[9];
  const grpFelsX = CX[10];
  const grpFelsW = CW[10] + CW[11] + CW[12];

  rect(grpLockX, thY1, grpLockW, thH1, { color: rgb(0.82, 0.88, 0.95), borderColor: K, borderWidth: 0.5 });
  rect(grpFelsX,  thY1, grpFelsW, thH1, { color: rgb(0.82, 0.95, 0.88), borderColor: K, borderWidth: 0.5 });

  textB('Nageldaten', x0 + mm(1.5), thY1 + mm(1.5), { size: 7 });
  textB('Lockergestein', grpLockX + mm(1.5), thY1 + mm(1.5), { size: 7 });
  textB('Fels',          grpFelsX + mm(1.5), thY1 + mm(1.5), { size: 7 });

  // Linie zwischen Zeile 1 und 2
  line(x0, thY1, x0 + PW, thY1, 0.5);

  // Spalten-Labels (Zeile 2)
  const colLabels = [
    'Nr.', 'Neig.\n[°]', 'Bezeichnung', 'Gewebe-\nstrumpf',
    'Bohrloch\nø [mm]', 'Zement\n[kg]', 'W/Z-\nWert',
    'von [m]', 'bis [m]', 'Diff. [m]',
    'von [m]', 'bis [m]', 'Diff. [m]',
    'Nagel\n[m]', 'Anmerkungen'
  ];
  colLabels.forEach((lbl, i) => {
    const lines = lbl.split('\n');
    const x = CX[i] + mm(1);
    if (lines.length === 2) {
      textB(lines[0], x, thY2 + mm(3.8), { size: 6.5 });
      textB(lines[1], x, thY2 + mm(1.2), { size: 6.5 });
    } else {
      textB(lbl, x, thY2 + mm(2.3), { size: 6.5 });
    }
    if (i > 0) line(CX[i], thY2, CX[i], tableTopY, 0.5);
  });

  // Rahmen Tabellen-Header
  line(x0, thY2, x0, tableTopY, 0.8);
  line(x0 + PW, thY2, x0 + PW, tableTopY, 0.8);
  line(x0, thY2, x0 + PW, thY2, 0.8);

  // ── TABELLEN-DATEN (25 Zeilen) ────────────────────────
  // Footer-Bereich reservieren: Summen + Signaturen
  const footH  = mm(9);   // Summen-Zeile
  const sigH   = mm(20);  // Signatur-Block
  const tableBottomY = y0 + footH + sigH;

  const availH = thY2 - tableBottomY;
  const rowH   = availH / ROWS;

  const nails = (snap.nails || []).slice(0, ROWS);

  for (let i = 0; i < ROWS; i++) {
    const n = nails[i] || {};
    const ry = thY2 - (i + 1) * rowH;

    // Zebrierung
    if (i % 2 === 1) {
      rect(x0, ry, PW, rowH, { color: rgb(0.97, 0.97, 0.97) });
    }

    // Trennlinie
    line(x0, ry, x0 + PW, ry, 0.4, rgb(0.7, 0.7, 0.7));

    // Spaltenlinien
    CX.forEach((cx, ci) => { if (ci > 0) line(cx, ry, cx, ry + rowH, 0.4, rgb(0.7, 0.7, 0.7)); });

    const ty = ry + mm(1.8);
    const fs = 7.8;

    const lv = num(n.lv), lb = num(n.lb), fv = num(n.fv), fb = num(n.fb);
    const ld = Math.max(0, lb - lv);
    const fd = Math.max(0, fb - fv);
    const len = Math.max(lb, fb);

    const vals = [
      n.nr || '',
      n.nei || '',
      (n.bez && n.bez !== '–') ? n.bez : '',
      n.gew || '',
      n.bohr || '',
      n.zem ? fmtC(num(n.zem), 2) : '',
      n.wz  || '',
      n.lv !== '' ? fmtC(lv, 2) : '',
      n.lb !== '' ? fmtC(lb, 2) : '',
      (n.lv !== '' || n.lb !== '') ? fmtC(ld, 2) : '',
      n.fv !== '' ? fmtC(fv, 2) : '',
      n.fb !== '' ? fmtC(fb, 2) : '',
      (n.fv !== '' || n.fb !== '') ? fmtC(fd, 2) : '',
      len > 0 ? fmtC(len, 2) : '',
      n.note || '',
    ];

    vals.forEach((v, ci) => {
      if (!v) return;
      const tw = CW[ci] - mm(2);
      // Fit-Text (einfache Breitenreduktion)
      let sz = fs;
      if (ci === 2 || ci === 14) sz = Math.min(fs, 7); // Bezeichnung + Anmerkungen etwas kleiner wenn nötig
      text(v, CX[ci] + mm(1), ty, { size: sz });
    });
  }

  // Rahmen-Linien Tabelle außen
  const tableEndY = thY2 - ROWS * rowH;
  line(x0,      tableEndY, x0,      thY2, 0.8);
  line(x0 + PW, tableEndY, x0 + PW, thY2, 0.8);
  line(x0, tableEndY, x0 + PW, tableEndY, 0.8);

  // ── SUMMEN-ZEILE ─────────────────────────────────────
  const sums = sumsOf(snap);
  const sumY = tableBottomY + sigH;
  rect(x0, sumY - footH, PW, footH, { color: LGREY, borderColor: K, borderWidth: 0.8 });

  const sty = sumY - footH + mm(2.2);
  const col3W = PW / 3;

  textB(`Nagelanzahl [Stk.]: ${sums.cnt}`,
    x0 + mm(2), sty, { size: 8 });
  textB(`Zement ges. [kg]: ${fmtC(sums.cem, 2)}`,
    x0 + col3W + mm(2), sty, { size: 8 });
  textB(`Nagellänge ges. [m]: ${fmtC(sums.len, 2)}`,
    x0 + col3W * 2 + mm(2), sty, { size: 8 });

  // Bohrzeitraum / Verpresszeitraum (2. Zeile Summenblock)
  if (meta.bohrzeitraum || meta.verpresszeitraum) {
    textB(`Bohrzeitraum: ${meta.bohrzeitraum || ''}`,
      x0 + mm(2), sty + mm(3.5), { size: 7 });
    textB(`Verpresszeitraum: ${meta.verpresszeitraum || ''}`,
      x0 + col3W + mm(2), sty + mm(3.5), { size: 7 });
  }

  // ── SIGNATUREN ───────────────────────────────────────
  const sigBlockY  = y0;
  const sigBlockH  = sigH;
  const sigHalfW   = PW / 2;

  rect(x0, sigBlockY, PW, sigBlockH, { borderColor: K, borderWidth: 0.8 });
  line(x0 + sigHalfW, sigBlockY, x0 + sigHalfW, sigBlockY + sigBlockH, 0.8);

  // Labels
  textB('Für den Auftragnehmer:', x0 + mm(2), sigBlockY + sigBlockH - mm(4), { size: 7.5 });
  if (meta.sigAnName) text(`i.A. ${meta.sigAnName}`, x0 + mm(2), sigBlockY + sigBlockH - mm(7.5), { size: 7 });

  textB('Für den Auftraggeber:', x0 + sigHalfW + mm(2), sigBlockY + sigBlockH - mm(4), { size: 7.5 });
  if (meta.sigAgName) text(meta.sigAgName, x0 + sigHalfW + mm(2), sigBlockY + sigBlockH - mm(7.5), { size: 7 });

  // Signatur-Bilder
  async function drawSig(dataURL, sx, sy, sw, sh) {
    const u8 = u8fromDataURL(dataURL);
    if (!u8) return;
    const img = await pdf.embedPng(u8);
    const pad = mm(3);
    const aw = sw - 2 * pad, ah = sh - 2 * pad;
    const sc = Math.min(aw / img.width, ah / img.height);
    const dw = img.width * sc, dh = img.height * sc;
    page.drawImage(img, { x: sx + (sw - dw) / 2, y: sy + (sh - dh) / 2, width: dw, height: dh });
  }

  const innerSigH = sigBlockH - mm(9);
  if (snap.sign?.an) await drawSig(snap.sign.an, x0 + mm(2), sigBlockY + mm(1), sigHalfW - mm(4), innerSigH);
  if (snap.sign?.ag) await drawSig(snap.sign.ag, x0 + sigHalfW + mm(2), sigBlockY + mm(1), sigHalfW - mm(4), innerSigH);

  // ── SPEICHERN & ÖFFNEN ────────────────────────────────
  const bytes = await pdf.save();
  const blob  = new Blob([bytes], { type: 'application/pdf' });
  const url   = URL.createObjectURL(blob);
  const win   = window.open(url, '_blank');
  if (!win) {
    const d = meta.datum ? new Date(meta.datum) : new Date();
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dateName(d)}_Bohrprotokoll_${meta.protoNr || 'X'}_${(meta.baustelle || '').replace(/\s+/g, '_')}.pdf`;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* ─── Events ───────────────────────────────────── */
function hookEvents() {
  const metaIds = [
    'inp-datum', 'inp-proto-nr', 'inp-baustelle', 'inp-an', 'inp-ag',
    'inp-bohrsystem', 'inp-bohrzeitraum', 'inp-verpresszeitraum', 'inp-bereich',
    'sigAnName', 'sigAgName'
  ];
  metaIds.forEach(id => {
    $(id)?.addEventListener('input',  () => { recalc(); draftDebounce(); });
    $(id)?.addEventListener('change', () => { recalc(); draftDebounce(); });
  });

  $('btnReset')?.addEventListener('click', () => {
    if (!confirm('Alle Eingaben zurücksetzen?')) return;
    $('inp-proto-nr').value = '';
    $('inp-baustelle').value = '';
    $('inp-ag').value = '';
    $('inp-bohrsystem').value = '';
    $('inp-bohrzeitraum').value = '';
    $('inp-verpresszeitraum').value = '';
    $('inp-bereich').value = '';
    $('sigAnName').value = '';
    $('sigAgName').value = '';
    rowRefs.forEach(r => {
      r.inpNr.value = ''; r.inpNei.value = ''; r.selBez.value = '–';
      r.inpGew.value = 'nein'; r.inpBohr.value = ''; r.inpZem.value = '';
      r.inpWZ.value = ''; r.inpLv.value = ''; r.inpLb.value = '';
      r.inpFv.value = ''; r.inpFb.value = ''; r.inpNote.value = '';
      r.tdLd.textContent = '–'; r.tdFd.textContent = '–'; r.tdLen.textContent = '–';
    });
    sigPads.an?.clear();
    sigPads.ag?.clear();
    recalc(); draftDebounce();
  });

  $('btnSave')?.addEventListener('click', () => {
    saveToHistory();
    alert('✓ Protokoll im Verlauf gespeichert.');
  });

  $('btnPdf')?.addEventListener('click', () => {
    exportPdf().catch(err => {
      console.error(err);
      alert('PDF-Fehler: ' + (err?.message || String(err)));
    });
  });
}

/* ─── Init ─────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  if ($('inp-datum') && !$('inp-datum').value)
    $('inp-datum').value = new Date().toISOString().slice(0, 10);

  initTabs();
  buildTable();
  initSigPads();
  hookEvents();
  loadDraft();
  recalc();
  renderHistory();

  // PWA Install
  let _prompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); _prompt = e;
    $('btnInstall') && ($('btnInstall').hidden = false);
  });
  $('btnInstall')?.addEventListener('click', async () => {
    if (!_prompt) return;
    _prompt.prompt();
    const { outcome } = await _prompt.userChoice;
    if (outcome === 'accepted') $('btnInstall').hidden = true;
    _prompt = null;
  });
  window.addEventListener('appinstalled', () => {
    $('btnInstall') && ($('btnInstall').hidden = true);
    _prompt = null;
  });

  // Service Worker
  if ('serviceWorker' in navigator)
    navigator.serviceWorker.register('sw.js').catch(() => {});
});