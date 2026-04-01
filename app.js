'use strict';

/* ─── Konstanten ───────────────────────────────── */
const STORAGE_DRAFT   = 'htb-bohrz-v3';
const STORAGE_HISTORY = 'htb-bohrz-hist-v3';
const HISTORY_MAX     = 30;
const ROWS            = 25;

const $ = id => document.getElementById(id);

/* ─── Bezeichnung-Dropdown ─────────────────────── */
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

/* ─── HTB Logo SVG als Data-URL (aus internem Wissen) ── */
const HTB_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="80" fill="#111111"/>
<g transform="translate(256,256) scale(0.72) translate(-318.9,-248)">
<path fill="#000000" d="M531.5,177.12H148.73l43.08-28.73c6.57-4.38,14.29-6.72,22.18-6.72h285.8s-140.7-93.84-140.7-93.84c-.7-.48-1.44-.95-2.15-1.42-21.73-14.64-54.36-14.64-76.09,0-.72.48-1.44.94-2.15,1.42L66.6,189.29h0c-4.68,3.2-8.98,6.93-12.8,11.12-41.01,45.63-8.95,118.29,52.5,118.53h382.77l-43.08,28.73c-6.57,4.38-14.29,6.72-22.19,6.72H138.01s140.71,93.84,140.71,93.84c.7.49,1.44.95,2.15,1.43,21.73,14.64,54.36,14.64,76.09,0,.72-.48,1.44-.94,2.14-1.42l212.1-141.45h0c4.69-3.21,9.01-6.96,12.84-11.16,11.73-12.89,18.35-30.15,18.33-47.58,0-39.16-31.73-70.9-70.87-70.9Z"/>
<path fill="#ffed00" d="M438.32,263.5c.08-5.32-1.27-9.39-4.05-12.22-2.79-2.82-7.04-4.81-12.77-5.96,4.83-.9,8.43-2.8,10.81-5.71,2.37-2.91,3.56-6.61,3.56-11.11v-3.44c0-4.83-.94-8.72-2.82-11.67-1.88-2.95-4.75-5.08-8.6-6.39-3.85-1.31-8.72-1.96-14.61-1.96h-157.8v33.77h-30.21v-33.77h-22.59v85.96h22.59v-35.73h30.21v35.73h22.72v-69.26h33.52v69.26h22.84v-69.26h33.4v69.26h45.31c6.38,0,11.69-.78,15.9-2.33,4.21-1.55,7.41-3.99,9.58-7.31,2.17-3.32,3.25-7.55,3.25-12.71l-.25-5.16ZM386.87,220.77h18.42c2.78,0,4.81.57,6.08,1.72,1.27,1.15,1.9,3.11,1.9,5.89v3.19c0,1.96-.29,3.54-.86,4.73-.57,1.19-1.43,2.05-2.58,2.58-1.15.53-2.7,0,0,0Z"/>
</g>
</svg>`;

/* ─── SVG → PNG via Canvas ─────────────────────── */
async function svgToPngBytes(svgStr, w, h) {
  return new Promise(resolve => {
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const img  = new Image(w, h);
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      cv.toBlob(b => {
        b.arrayBuffer().then(ab => resolve(new Uint8Array(ab)));
      }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

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

/* ─── Table build ──────────────────────────────── */
function buildTable() {
  const tbody = $('nailBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  rowRefs = [];

  for (let i = 0; i < ROWS; i++) {
    const tr = document.createElement('tr');
    if (i % 2 === 0) tr.style.background = 'rgba(255,255,255,0.015)';

    const mkN = (cls) => {
      const inp = document.createElement('input');
      inp.type = 'number'; inp.step = '0.01'; inp.inputMode = 'decimal';
      if (cls) inp.className = cls;
      inp.addEventListener('input', () => { recalc(); draftDebounce(); });
      return inp;
    };
    const mkT = (cls) => {
      const inp = document.createElement('input');
      inp.type = 'text';
      if (cls) inp.className = cls;
      inp.addEventListener('input', () => { recalc(); draftDebounce(); });
      return inp;
    };
    const cel = (el) => { const td = document.createElement('td'); td.appendChild(el); tr.appendChild(td); return td; };

    // Nr
    const inpNr = mkT('inp-nr'); cel(inpNr);
    // Neigung
    const inpNei = mkN(); inpNei.step = '1'; inpNei.min = '0'; inpNei.max = '90'; cel(inpNei);
    // Bezeichnung
    const selBez = document.createElement('select');
    selBez.className = 'sel-bez';
    BEZEICHNUNGEN.forEach(b => selBez.appendChild(new Option(b, b)));
    selBez.addEventListener('change', () => { recalc(); draftDebounce(); });
    const tdBez = document.createElement('td'); tdBez.appendChild(selBez); tr.appendChild(tdBez);
    // Gewebe
    const inpGew = mkT(); inpGew.value = 'nein'; cel(inpGew);
    // Bohrloch
    const inpBohr = mkN(); inpBohr.step = '1'; cel(inpBohr);
    // Zement
    const inpZem = mkN(); cel(inpZem);
    // W/Z
    const inpWZ = mkN(); inpWZ.step = '0.01'; cel(inpWZ);
    // Lockergestein
    const inpLv = mkN(); cel(inpLv);
    const inpLb = mkN(); cel(inpLb);
    const tdLd = document.createElement('td'); tdLd.className = 'td-diff'; tdLd.textContent = '–'; tr.appendChild(tdLd);
    // Fels
    const inpFv = mkN(); cel(inpFv);
    const inpFb = mkN(); cel(inpFb);
    const tdFd = document.createElement('td'); tdFd.className = 'td-diff'; tdFd.textContent = '–'; tr.appendChild(tdFd);
    // Nagel
    const tdLen = document.createElement('td'); tdLen.className = 'td-len'; tdLen.textContent = '–'; tr.appendChild(tdLen);
    // Anmerkungen
    const inpNote = mkT('inp-note'); cel(inpNote);

    tbody.appendChild(tr);
    rowRefs.push({ inpNr, inpNei, selBez, inpGew, inpBohr, inpZem, inpWZ, inpLv, inpLb, tdLd, inpFv, inpFb, tdFd, tdLen, inpNote });
  }
}

/* ─── Recalc ───────────────────────────────────── */
function recalc() {
  let count = 0, sumCem = 0, sumLen = 0;
  rowRefs.forEach(r => {
    const lv = num(r.inpLv.value), lb = num(r.inpLb.value);
    const fv = num(r.inpFv.value), fb = num(r.inpFb.value);
    r.tdLd.textContent = (r.inpLv.value !== '' || r.inpLb.value !== '') ? fmtC(Math.max(0, lb - lv)) : '–';
    r.tdFd.textContent = (r.inpFv.value !== '' || r.inpFb.value !== '') ? fmtC(Math.max(0, fb - fv)) : '–';
    const len = Math.max(lb, fb);
    r.tdLen.textContent = len > 0 ? fmtC(len) : '–';
    const cem = num(r.inpZem.value);
    const has = r.inpNr.value.trim() !== '' || num(r.inpNei.value) > 0 || (r.selBez.value && r.selBez.value !== '–') || cem > 0 || len > 0;
    if (has) { count++; sumCem += cem; sumLen += len; }
  });
  $('sumCount')  && ($('sumCount').textContent  = count);
  $('sumCement') && ($('sumCement').textContent = fmtC(sumCem, 2));
  $('sumLen')    && ($('sumLen').textContent    = fmtC(sumLen, 2));
}

/* ─── State ────────────────────────────────────── */
function collectState() {
  return {
    v: 3,
    meta: {
      datum:            $('inp-datum')?.value || '',
      protoNr:          $('inp-proto-nr')?.value || '',
      baustelle:        $('inp-baustelle')?.value || '',
      an:               $('inp-an')?.value || '',
      ag:               $('inp-ag')?.value || '',
      bohrsystem:       $('inp-bohrsystem')?.value || '',
      bohrzeitraum:     $('inp-bohrzeitraum')?.value || '',
      verpresszeitraum: $('inp-verpresszeitraum')?.value || '',
      hinweis:          $('inp-hinweis')?.value || '',
      sigAnName:        $('sigAnName')?.value || '',
      sigAgName:        $('sigAgName')?.value || '',
    },
    nails: rowRefs.map(r => ({
      nr: r.inpNr.value, nei: r.inpNei.value, bez: r.selBez.value,
      gew: r.inpGew.value, bohr: r.inpBohr.value, zem: r.inpZem.value,
      wz: r.inpWZ.value, lv: r.inpLv.value, lb: r.inpLb.value,
      fv: r.inpFv.value, fb: r.inpFb.value, note: r.inpNote.value,
    })),
    sign: { an: sigPads.an?.getDataURL?.() || '', ag: sigPads.ag?.getDataURL?.() || '' }
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
  $('inp-hinweis').value          = m.hinweis || '';
  $('sigAnName').value            = m.sigAnName || '';
  $('sigAgName').value            = m.sigAgName || '';
  (s.nails || []).slice(0, ROWS).forEach((n, i) => {
    const r = rowRefs[i]; if (!r) return;
    r.inpNr.value   = n.nr   ?? '';  r.inpNei.value  = n.nei  ?? '';
    r.selBez.value  = n.bez  ?? '–'; r.inpGew.value  = n.gew  ?? 'nein';
    r.inpBohr.value = n.bohr ?? '';  r.inpZem.value  = n.zem  ?? '';
    r.inpWZ.value   = n.wz   ?? '';  r.inpLv.value   = n.lv   ?? '';
    r.inpLb.value   = n.lb   ?? '';  r.inpFv.value   = n.fv   ?? '';
    r.inpFb.value   = n.fb   ?? '';  r.inpNote.value = n.note ?? '';
  });
  sigPads.an?.setFromDataURL?.(s.sign?.an || '');
  sigPads.ag?.setFromDataURL?.(s.sign?.ag || '');
  recalc();
}

let _dT = null;
function draftDebounce() {
  clearTimeout(_dT);
  _dT = setTimeout(() => { try { localStorage.setItem(STORAGE_DRAFT, JSON.stringify(collectState())); } catch {} }, 300);
}
function loadDraft() {
  try { const r = localStorage.getItem(STORAGE_DRAFT); if (r) applyState(JSON.parse(r)); } catch {}
}

/* ─── History ──────────────────────────────────── */
function readHist() { try { return JSON.parse(localStorage.getItem(STORAGE_HISTORY) || '[]'); } catch { return []; } }
function writeHist(l) { try { localStorage.setItem(STORAGE_HISTORY, JSON.stringify(l.slice(0, HISTORY_MAX))); } catch {} }

function sumsOf(snap) {
  let cnt = 0, cem = 0, len = 0;
  (snap.nails || []).forEach(n => {
    const L = Math.max(num(n.lb), num(n.fb)), C = num(n.zem);
    const has = (n.nr || '').trim() !== '' || num(n.nei) > 0 || C > 0 || L > 0;
    if (has) { cnt++; cem += C; len += L; }
  });
  return { cnt, cem, len };
}

function saveToHistory() {
  const snap = collectState(), sums = sumsOf(snap);
  const title = `${snap.meta.baustelle || '—'} · Nr. ${snap.meta.protoNr || '—'} · ${dateDE(snap.meta.datum)}`;
  writeHist([{ id: uid(), savedAt: Date.now(), title, snap, sums }, ...readHist()]);
  renderHistory();
}

function renderHistory() {
  const host = $('historyList'); if (!host) return;
  const list = readHist();
  if (!list.length) { host.innerHTML = '<div class="historyItem"><div class="historySub">Noch keine Protokolle gespeichert.</div></div>'; return; }
  host.innerHTML = '';
  list.forEach(entry => {
    const s = entry.sums || sumsOf(entry.snap);
    const div = document.createElement('div'); div.className = 'historyItem';
    div.innerHTML = `
      <div class="historyTop">
        <span>${entry.title}</span>
        <span style="color:var(--muted);font-size:.82em">${new Date(entry.savedAt).toLocaleString('de-DE')}</span>
      </div>
      <div class="historySub">Nägel: <b>${s.cnt}</b> · Zement: <b>${fmtC(s.cem,2)} kg</b> · Länge: <b>${fmtC(s.len,2)} m</b></div>
      <div class="historyBtns">
        <button class="btn btn--ghost" data-act="load" data-id="${entry.id}">Laden</button>
        <button class="btn btn--ghost" data-act="pdf"  data-id="${entry.id}">PDF</button>
        <button class="btn btn--ghost" data-act="del"  data-id="${entry.id}">Löschen</button>
      </div>`;
    host.appendChild(div);
  });
  host.querySelectorAll('button[data-act]').forEach(b => {
    b.addEventListener('click', async () => {
      const { id, act } = b.dataset;
      if (act === 'del') { writeHist(readHist().filter(e => e.id !== id)); renderHistory(); }
      if (act === 'load') { const e = readHist().find(e => e.id === id); if (e) { applyState(e.snap); draftDebounce(); document.querySelector('.tab[data-tab="protokoll"]')?.click(); } }
      if (act === 'pdf')  { const e = readHist().find(e => e.id === id); if (e) await exportPdf(e.snap); }
    });
  });
}

/* ─── Signature Pads ───────────────────────────── */
function initSigPads() {
  sigPads.an = makePad($('sigAnCanvas'), draftDebounce);
  sigPads.ag = makePad($('sigAgCanvas'), draftDebounce);
  $('sigAnClear')?.addEventListener('click', () => sigPads.an.clear());
  $('sigAgClear')?.addEventListener('click', () => sigPads.ag.clear());
}

function makePad(canvas, onChange) {
  if (!canvas) return { getDataURL: () => '', setFromDataURL: () => {}, clear: () => {} };
  const ctx = canvas.getContext('2d');
  let drawing = false, last = null, signed = false;
  function prep() {
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    const w = Math.max(10, Math.floor(r.width * dpr)), h = Math.max(10, Math.floor(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    if (!canvas.dataset.bg) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, r.width, r.height); canvas.dataset.bg = '1'; }
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#000';
  }
  function pos(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  canvas.addEventListener('pointerdown', e => { e.preventDefault(); prep(); drawing = true; last = pos(e); canvas.setPointerCapture?.(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (!drawing) return; e.preventDefault(); const p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; signed = true; });
  const end = e => { if (!drawing) return; e?.preventDefault?.(); drawing = false; last = null; onChange?.(); };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end); canvas.addEventListener('pointerleave', end);
  return {
    clear() { prep(); const r = canvas.getBoundingClientRect(); ctx.clearRect(0, 0, r.width, r.height); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, r.width, r.height); signed = false; onChange?.(); },
    getDataURL() { return signed ? canvas.toDataURL('image/png') : ''; },
    setFromDataURL(url) {
      prep(); const r = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, r.width, r.height); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, r.width, r.height);
      if (!url) { signed = false; return; }
      const img = new Image(); img.onload = () => { ctx.drawImage(img, 0, 0, r.width, r.height); signed = true; }; img.src = url;
    }
  };
}

/* ─────────────────────────────────────────────────
   PDF EXPORT – 1:1 nach Vorlage Bohrprotokoll SSZ 1.5
   A4 Querformat 841,89 × 595,28 pt
───────────────────────────────────────────────── */
function u8fromDataURL(url) {
  const b64 = String(url || '').split(',')[1]; if (!b64) return null;
  const bin = atob(b64), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

async function exportPdf(optSnap) {
  const snap = optSnap || collectState();
  const meta = snap.meta || {};

  if (!window.PDFLib) { alert('PDF-Library lädt noch – bitte kurz warten.'); return; }
  const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
  const pdf = await PDFDocument.create();
  if (window.fontkit) pdf.registerFontkit(window.fontkit);

  /* Fonts */
  let fR, fB;
  try {
    const arB = await fetch('arial.ttf').then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); });
    fR = await pdf.embedFont(arB, { subset: true });
    const abB = await fetch('ARIALBD.TTF').then(r => r.ok ? r.arrayBuffer() : null);
    fB = abB ? await pdf.embedFont(abB, { subset: true }) : fR;
  } catch {
    fR = await pdf.embedFont(StandardFonts.Helvetica);
    fB = await pdf.embedFont(StandardFonts.HelveticaBold);
  }

  /* Logo – erst logo.png versuchen, dann SVG rendern */
  let logoImg = null;
  try {
    const lb = await fetch('logo.png').then(r => r.ok ? r.arrayBuffer() : null);
    if (lb) logoImg = await pdf.embedPng(lb);
  } catch {}
  if (!logoImg) {
    try {
      const pngBytes = await svgToPngBytes(HTB_LOGO_SVG, 512, 512);
      if (pngBytes) logoImg = await pdf.embedPng(pngBytes);
    } catch {}
  }

  /* Seite: A4 Querformat */
  const PW = 841.89, PH = 595.28;
  const page = pdf.addPage([PW, PH]);
  const mm = v => v * 72 / 25.4;

  /* Farben */
  const K       = rgb(0, 0, 0);
  const WHITE   = rgb(1, 1, 1);
  const LGREY   = rgb(0.82, 0.82, 0.82);  /* Header-Hintergrund */
  const MGREY   = rgb(0.93, 0.93, 0.93);  /* Tabellenkopf */
  const BLUE_BG = rgb(0.85, 0.92, 0.98);  /* Lockergestein-Gruppe */
  const GREN_BG = rgb(0.85, 0.96, 0.88);  /* Fels-Gruppe */
  const YELL    = rgb(1.0, 0.929, 0.0);   /* HTB Gelb */

  /* Ränder */
  const ML = mm(8), MR = mm(8), MT = mm(7), MB = mm(7);
  const X0 = ML, Y0 = MB;
  const TW = PW - ML - MR;   /* Tabellenbreite */
  const TH = PH - MT - MB;   /* Tabellenhöhe */

  /* ── Hilfsfunktionen ── */
  const line = (x1, y1, x2, y2, t = 0.5, col = K) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: t, color: col });
  const rect = (x, y, w, h, opts = {}) =>
    page.drawRectangle({ x, y, width: Math.max(0.1, w), height: Math.max(0.1, h), ...opts });

  /* Text mit harter Breitengrenze – trunciert mit '…' wenn nötig */
  function clipText(txt, x, y, maxW, font, sz, col = K, align = 'left') {
    let s = String(txt ?? '').trim(); if (!s) return;
    const measure = t => { try { return font.widthOfTextAtSize(t, sz); } catch { return s.length * sz * 0.55; } };
    while (s.length > 1 && measure(s) > maxW - 1) s = s.slice(0, -1);
    if (String(txt).trim() !== s && s.length > 1) s = s.slice(0, -1) + '…';
    let dx = x;
    if (align === 'center') dx = x + (maxW - measure(s)) / 2;
    else if (align === 'right') dx = x + maxW - measure(s);
    page.drawText(s, { x: Math.max(X0, dx), y, size: sz, font, color: col });
  }

  /* ═══════════════════════════════════════════════
     KOPFBEREICH (nach Vorlage [10])
  ═══════════════════════════════════════════════ */
  const HDR_H1 = mm(10);   /* Zeile 1: AN / Nr / AG */
  const HDR_H2 = mm(8);    /* Zeile 2: Bohrsystem / Baustelle */
  const HDR_H3 = mm(7);    /* Zeile 3: Hinweiszeile (optional) */
  const LOGO_W = mm(28);   /* Logo-Block links */

  const hdr1Y = Y0 + TH - HDR_H1;
  const hdr2Y = hdr1Y - HDR_H2;

  /* Logo-Block */
  rect(X0, hdr1Y, LOGO_W, HDR_H1, { color: LGREY, borderColor: K, borderWidth: 0.8 });
  if (logoImg) {
    const lh = HDR_H1 * 0.80;
    const sc = lh / logoImg.height;
    const lw = logoImg.width * sc;
    const lx = X0 + (LOGO_W - lw) / 2;
    const ly = hdr1Y + (HDR_H1 - lh) / 2;
    /* Gelber Hintergrund hinter Logo */
    rect(lx - 2, ly - 1, lw + 4, lh + 2, { color: YELL });
    page.drawImage(logoImg, { x: lx, y: ly, width: lw, height: lh });
  } else {
    rect(X0, hdr1Y, LOGO_W, HDR_H1, { color: YELL, borderColor: K, borderWidth: 0.8 });
    clipText('HTB', X0 + mm(2), hdr1Y + mm(3), LOGO_W - mm(4), fB, 11);
  }

  /* Kopfzeile 1: Auftragnehmer | Bohrprotokoll Nr. | Auftraggeber */
  const hdrRestW = TW - LOGO_W;
  const COL3 = hdrRestW / 3;
  const hX = X0 + LOGO_W;

  rect(hX, hdr1Y, hdrRestW, HDR_H1, { color: LGREY, borderColor: K, borderWidth: 0.8 });
  line(hX + COL3, hdr1Y, hX + COL3, hdr1Y + HDR_H1);
  line(hX + COL3 * 2, hdr1Y, hX + COL3 * 2, hdr1Y + HDR_H1);

  const hy1 = hdr1Y + mm(2.8);
  const PAD = mm(1.5);

  /* Spalte 1: Auftragnehmer */
  clipText('Auftragnehmer:', hX + PAD, hy1, mm(26), fB, 7);
  clipText(meta.an || '', hX + mm(27), hy1, COL3 - mm(28), fR, 8);

  /* Spalte 2: Bohrprotokoll Nr. */
  const c2x = hX + COL3;
  clipText('Bohrprotokoll Nr.:', c2x + PAD, hy1, mm(30), fB, 7);
  clipText(meta.protoNr || '', c2x + mm(31), hy1, COL3 - mm(32), fB, 9);

  /* Spalte 3: Auftraggeber */
  const c3x = hX + COL3 * 2;
  clipText('Auftraggeber:', c3x + PAD, hy1, mm(22), fB, 7);
  clipText(meta.ag || '', c3x + mm(23), hy1, COL3 - mm(24), fR, 8);

  /* Kopfzeile 2: Bohrsystem | (leer) | Baustelle */
  rect(X0, hdr2Y, TW, HDR_H2, { color: MGREY, borderColor: K, borderWidth: 0.8 });
  line(hX + COL3,     hdr2Y, hX + COL3,     hdr2Y + HDR_H2);
  line(hX + COL3 * 2, hdr2Y, hX + COL3 * 2, hdr2Y + HDR_H2);

  const hy2 = hdr2Y + mm(2.2);
  clipText('Bohrsystem:', X0 + PAD, hy2, mm(22), fB, 7);
  clipText(meta.bohrsystem || '', X0 + mm(22), hy2, LOGO_W + COL3 - mm(23), fR, 7.5);
  clipText('Baustelle:', c3x + PAD, hy2, mm(18), fB, 7);
  clipText(meta.baustelle || '', c3x + mm(19), hy2, COL3 - mm(20), fR, 7.5);

  /* Kopfzeile 3: Hinweis (optional) */
  let tableTopY = hdr2Y;
  if (meta.hinweis && meta.hinweis.trim()) {
    const hdr3Y = hdr2Y - HDR_H3;
    rect(X0, hdr3Y, TW, HDR_H3, { color: WHITE, borderColor: K, borderWidth: 0.8 });
    clipText(meta.hinweis, X0 + PAD, hdr3Y + mm(2), TW - PAD * 2, fR, 7, rgb(0.3, 0.3, 0.3));
    tableTopY = hdr3Y;
  }

  /* ═══════════════════════════════════════════════
     SPALTEN-LAYOUT (exakt wie Vorlage [10])
     Summe muss = TW
  ═══════════════════════════════════════════════ */
  /* Breiten in mm */
  const CW_MM = [
    14,   /* 0  Nr. */
    11,   /* 1  Neigung */
    25,   /* 2  Bezeichnung */
    14,   /* 3  Gewebe */
    14,   /* 4  Bohrloch */
    15,   /* 5  Zement */
    11,   /* 6  W/Z */
    13,   /* 7  Lock-von */
    13,   /* 8  Lock-bis */
    13,   /* 9  Lock-diff */
    13,   /* 10 Fels-von */
    13,   /* 11 Fels-bis */
    13,   /* 12 Fels-diff */
    13,   /* 13 Nagel */
    0,    /* 14 Anmerkungen = Rest */
  ];
  /* Gesamtbreite fest = TW (pt) */
  const fixMM = CW_MM.slice(0, 14).reduce((a, b) => a + b, 0);
  CW_MM[14] = (TW / mm(1)) - fixMM;  /* Rest in mm */

  const CW = CW_MM.map(v => mm(v));  /* pt */
  const CX = [];
  let cx = X0;
  CW.forEach(w => { CX.push(cx); cx += w; });

  /* ═══════════════════════════════════════════════
     TABELLEN-HEADER (2 Zeilen)
  ═══════════════════════════════════════════════ */
  const TH1_H = mm(7);   /* Gruppenzeile */
  const TH2_H = mm(10);  /* Spaltenzeile */

  const th1Y = tableTopY - TH1_H;
  const th2Y = th1Y - TH2_H;

  /* Gruppen-Hintergründe */
  /* Nageldaten (Spalten 0–6) */
  const nageldatenW = CW.slice(0, 7).reduce((a, b) => a + b, 0);
  rect(CX[0], th1Y, nageldatenW, TH1_H, { color: MGREY, borderColor: K, borderWidth: 0.5 });

  /* Lockergestein (Spalten 7–9) */
  const lockW = CW[7] + CW[8] + CW[9];
  rect(CX[7], th1Y, lockW, TH1_H, { color: BLUE_BG, borderColor: K, borderWidth: 0.5 });

  /* Fels (Spalten 10–12) */
  const felsW = CW[10] + CW[11] + CW[12];
  rect(CX[10], th1Y, felsW, TH1_H, { color: GREN_BG, borderColor: K, borderWidth: 0.5 });

  /* Nagel + Anmerkungen (Spalten 13–14) */
  const restW = CW[13] + CW[14];
  rect(CX[13], th1Y, restW, TH1_H, { color: MGREY, borderColor: K, borderWidth: 0.5 });

  /* Gruppentext */
  clipText('Nageldaten', CX[0] + PAD, th1Y + mm(2), nageldatenW - PAD * 2, fB, 7);
  clipText('Lockergestein', CX[7] + mm(1), th1Y + mm(2), lockW - mm(2), fB, 7, K, 'center');
  clipText('Fels', CX[10] + mm(1), th1Y + mm(2), felsW - mm(2), fB, 7, K, 'center');

  /* Spaltenzeile (Zeile 2) */
  rect(X0, th2Y, TW, TH2_H, { color: MGREY, borderColor: K, borderWidth: 0.8 });
  line(X0, th1Y, X0 + TW, th1Y, 0.8);

  const colLabels = [
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
    ['Nagel', '[m]'],
    ['Anmerkungen'],
  ];

  colLabels.forEach((lines, i) => {
    const cellW = CW[i];
    if (i > 0) line(CX[i], th2Y, CX[i], tableTopY, 0.5);
    const totalLines = lines.length;
    const lineH = mm(3.5);
    const startY = th2Y + (TH2_H - totalLines * lineH) / 2 + (totalLines === 1 ? lineH * 0.3 : 0);
    lines.forEach((lbl, li) => {
      clipText(lbl, CX[i] + mm(0.8), startY + (totalLines - 1 - li) * lineH, cellW - mm(1.6), fB, 6.5, K, 'center');
    });
  });

  line(X0, th2Y, X0 + TW, th2Y, 0.8);
  line(X0, tableTopY, X0 + TW, tableTopY, 0.8);

  /* ═══════════════════════════════════════════════
     DATEN-BEREICH (25 Zeilen)
  ═══════════════════════════════════════════════ */
  const FOOT_H  = mm(9);    /* Summenzeile */
  const SIG_H   = mm(22);   /* Signaturblock */
  const tableBottomY = Y0 + FOOT_H + SIG_H;
  const dataH = th2Y - tableBottomY;
  const rowH  = dataH / ROWS;

  const nails = (snap.nails || []).slice(0, ROWS);

  for (let i = 0; i < ROWS; i++) {
    const n = nails[i] || {};
    const rowY = th2Y - (i + 1) * rowH;

    /* Zebrierung */
    if (i % 2 === 0) {
      rect(X0, rowY, TW, rowH, { color: rgb(0.975, 0.975, 0.975) });
    }

    /* Zeilentrennlinie */
    line(X0, rowY, X0 + TW, rowY, 0.35, rgb(0.65, 0.65, 0.65));

    /* Spaltenlinien */
    CX.forEach((cx, ci) => { if (ci > 0) line(cx, rowY, cx, rowY + rowH, 0.35, rgb(0.65, 0.65, 0.65)); });

    /* Berechnungen */
    const lv = num(n.lv), lb = num(n.lb), fv = num(n.fv), fb = num(n.fb);
    const ld = Math.max(0, lb - lv), fd = Math.max(0, fb - fv);
    const len = Math.max(lb, fb);

    const ty = rowY + (rowH * 0.38);  /* Textbasislinie zentriert in Zeile */
    const fs = 7.5;

    /* Hilfsfunktion: Text zentriert in Zelle, innerhalb Grenzen */
    const cell = (txt, col, align = 'center') => {
      const v = String(txt ?? '').trim();
      if (!v || v === '0' && col > 5) return;
      if (!v || v === '–') return;
      clipText(v, CX[col] + mm(0.8), ty, CW[col] - mm(1.6), fR, fs, K, align);
    };

    cell(n.nr || '',                       0, 'left');
    cell(n.nei || '',                       1, 'center');
    cell((n.bez && n.bez !== '–') ? n.bez : '', 2, 'left');
    cell(n.gew || '',                       3, 'center');
    cell(n.bohr || '',                      4, 'center');
    cell(n.zem ? fmtC(num(n.zem), 2) : '', 5, 'right');
    cell(n.wz  ? String(n.wz).replace('.', ',') : '', 6, 'center');

    if (n.lv !== '') clipText(fmtC(lv, 2), CX[7] + mm(0.8), ty, CW[7] - mm(1.6), fR, fs, K, 'right');
    if (n.lb !== '') clipText(fmtC(lb, 2), CX[8] + mm(0.8), ty, CW[8] - mm(1.6), fR, fs, K, 'right');
    if (n.lv !== '' || n.lb !== '') clipText(fmtC(ld, 2), CX[9] + mm(0.8), ty, CW[9] - mm(1.6), fR, fs, K, 'right');

    if (n.fv !== '') clipText(fmtC(fv, 2), CX[10] + mm(0.8), ty, CW[10] - mm(1.6), fR, fs, K, 'right');
    if (n.fb !== '') clipText(fmtC(fb, 2), CX[11] + mm(0.8), ty, CW[11] - mm(1.6), fR, fs, K, 'right');
    if (n.fv !== '' || n.fb !== '') clipText(fmtC(fd, 2), CX[12] + mm(0.8), ty, CW[12] - mm(1.6), fR, fs, K, 'right');

    if (len > 0) clipText(fmtC(len, 2), CX[13] + mm(0.8), ty, CW[13] - mm(1.6), fR, fs, K, 'right');
    if (n.note) clipText(n.note, CX[14] + mm(0.8), ty, CW[14] - mm(1.6), fR, 6.8, K, 'left');
  }

  /* Äußerer Rahmen Datentabelle */
  const dataTop    = th2Y;
  const dataBottom = tableBottomY;
  rect(X0, dataBottom, TW, dataTop - dataBottom, { borderColor: K, borderWidth: 0.8 });

  /* ═══════════════════════════════════════════════
     SUMMEN-ZEILE (wie Vorlage [10])
  ═══════════════════════════════════════════════ */
  const sums = sumsOf(snap);
  const sumY = tableBottomY;
  rect(X0, sumY - FOOT_H, TW, FOOT_H, { color: MGREY, borderColor: K, borderWidth: 0.8 });

  const sumTY = sumY - FOOT_H + mm(2.5);
  const third = TW / 3;

  /* Block 1 */
  clipText('Nagelanzahl [Stk.]:', X0 + PAD, sumTY, mm(35), fB, 8);
  clipText(String(sums.cnt), X0 + mm(36), sumTY, third - mm(37), fB, 9, rgb(0, 0, 0.6));

  /* Block 2 */
  clipText('Zement ges. [kg]:', X0 + third + PAD, sum
