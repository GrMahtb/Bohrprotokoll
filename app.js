'use strict';

const VERSION = '20260408-01';
const ROWS = 25;
const STORAGE_DRAFT = 'htb-bohrzaun-draft-v20260408-01';
const STORAGE_HISTORY = 'htb-bohrzaun-history-v20260408-01';
const HISTORY_MAX = 30;

const $ = (id) => document.getElementById(id);

const BEZEICHNUNGEN = [
  '–',
  'TI 30/11',
  'TI30/11',
  'TI 40/20',
  'TI40/20',
  'TITAN 30/11',
  'TITAN 40/20',
  'Seilanker 14,5 mm',
  'Sonstiges'
];

const LOGO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="80" fill="#111111"/>
  <g transform="translate(256,256) scale(0.72) translate(-318.9,-248)">
    <path fill="#000000" d="M531.5,177.12H148.73l43.08-28.73c6.57-4.38,14.29-6.72,22.18-6.72h285.8s-140.7-93.84-140.7-93.84c-.7-.48-1.44-.95-2.15-1.42-21.73-14.64-54.36-14.64-76.09,0-.72.48-1.44.94-2.15,1.42L66.6,189.29h0c-4.68,3.2-8.98,6.93-12.8,11.12-41.01,45.63-8.95,118.29,52.5,118.53h382.77l-43.08,28.73c-6.57,4.38-14.29,6.72-22.19,6.72H138.01s140.71,93.84,140.71,93.84c.7.49,1.44.95,2.15,1.43,21.73,14.64,54.36,14.64,76.09,0,.72-.48,1.44-.94,2.14-1.42l212.1-141.45h0c4.69-3.21,9.01-6.96,12.84-11.16,11.73-12.89,18.35-30.15,18.33-47.58,0-39.16-31.73-70.9-70.87-70.9Z"/>
    <path fill="#ffed00" d="M438.32,263.5c.08-5.32-1.27-9.39-4.05-12.22-2.79-2.82-7.04-4.81-12.77-5.96,4.83-.9,8.43-2.8,10.81-5.71,2.37-2.91,3.56-6.61,3.56-11.11v-3.44c0-4.83-.94-8.72-2.82-11.67-1.88-2.95-4.75-5.08-8.6-6.39-3.85-1.31-8.72-1.96-14.61-1.96h-157.8v33.77h-30.21v-33.77h-22.59v85.96h22.59v-35.73h30.21v35.73h22.72v-69.26h33.52v69.26h22.84v-69.26h33.4v69.26h45.31c6.38,0,11.69-.78,15.9-2.33,4.21-1.55,7.41-3.99,9.58-7.31,2.17-3.32,3.25-7.55,3.25-12.71l-.25-5.16Z"/>
  </g>
</svg>
`;

let rowRefs = [];
let sigPads = { an: null, ag: null };
let installPrompt = null;

function fmtDE(value, digits = 2) {
  return Number(value || 0).toFixed(digits).replace('.', ',');
}

function parseNum(value) {
  const s = String(value ?? '').trim().replace(/\s+/g, '').replace(',', '.');
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

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
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

function buildTable() {
  const tbody = $('nailBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  rowRefs = [];

  for (let i = 0; i < ROWS; i++) {
    const tr = document.createElement('tr');
    const ref = {};

    const makeText = (cls = '') => {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = cls;
      inp.addEventListener('input', onAnyInput);
      return inp;
    };

    const makeNumber = (cls = '', step = '0.01') => {
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.step = step;
      inp.inputMode = 'decimal';
      inp.className = cls;
      inp.addEventListener('input', onAnyInput);
      return inp;
    };

    const makeCell = (child) => {
      const td = document.createElement('td');
      if (child) td.appendChild(child);
      tr.appendChild(td);
      return td;
    };

    ref.nr = makeText('inp-nr');
    makeCell(ref.nr);

    ref.neigung = makeNumber('', '1');
    makeCell(ref.neigung);

    ref.bez = document.createElement('select');
    ref.bez.className = 'sel-bez';
    BEZEICHNUNGEN.forEach((v) => ref.bez.appendChild(new Option(v, v)));
    ref.bez.addEventListener('change', onAnyInput);
    makeCell(ref.bez);

    ref.gewebe = makeText('');
    ref.gewebe.value = 'nein';
    makeCell(ref.gewebe);

    ref.bohrloch = makeNumber('', '1');
    makeCell(ref.bohrloch);

    ref.zement = makeNumber('');
    makeCell(ref.zement);

    ref.wz = makeText('');
    ref.wz.value = '0,45';
    makeCell(ref.wz);

    ref.lv = makeNumber('');
    makeCell(ref.lv);

    ref.lb = makeNumber('');
    makeCell(ref.lb);

    ref.ld = document.createElement('td');
    ref.ld.className = 'readonly-cell';
    ref.ld.textContent = '–';
    tr.appendChild(ref.ld);

    ref.fv = makeNumber('');
    makeCell(ref.fv);

    ref.fb = makeNumber('');
    makeCell(ref.fb);

    ref.fd = document.createElement('td');
    ref.fd.className = 'readonly-cell';
    ref.fd.textContent = '–';
    tr.appendChild(ref.fd);

    ref.len = document.createElement('td');
    ref.len.className = 'len-cell';
    ref.len.textContent = '–';
    tr.appendChild(ref.len);

    ref.note = makeText('inp-note');
    makeCell(ref.note);

    rowRefs.push(ref);
    tbody.appendChild(tr);
  }
}

function onAnyInput() {
  recalc();
  saveDraftDebounced();
}

function rowHasData(r) {
  return (
    String(r.nr.value || '').trim() !== '' ||
    String(r.neigung.value || '').trim() !== '' ||
    (r.bez.value && r.bez.value !== '–') ||
    String(r.zement.value || '').trim() !== '' ||
    String(r.lb.value || '').trim() !== '' ||
    String(r.fb.value || '').trim() !== '' ||
    String(r.note.value || '').trim() !== ''
  );
}

function recalc() {
  let count = 0;
  let sumZement = 0;
  let sumLen = 0;

  rowRefs.forEach((r) => {
    const lv = parseNum(r.lv.value);
    const lb = parseNum(r.lb.value);
    const fv = parseNum(r.fv.value);
    const fb = parseNum(r.fb.value);

    const ld = Math.max(0, lb - lv);
    const fd = Math.max(0, fb - fv);
    const len = Math.max(lb, fb);

    r.ld.textContent = (r.lv.value !== '' || r.lb.value !== '') ? fmtDE(ld) : '–';
    r.fd.textContent = (r.fv.value !== '' || r.fb.value !== '') ? fmtDE(fd) : '–';
    r.len.textContent = len > 0 ? fmtDE(len) : '–';

    if (rowHasData(r)) {
      count += 1;
      sumZement += parseNum(r.zement.value);
      sumLen += len;
    }
  });

  $('sumCount').textContent = String(count);
  $('sumCement').textContent = fmtDE(sumZement);
  $('sumLen').textContent = fmtDE(sumLen);
}

function collectState() {
  return {
    v: VERSION,
    meta: {
      datum: $('inp-datum')?.value || '',
      protoNr: $('inp-proto-nr')?.value || '',
      baustelle: $('inp-baustelle')?.value || '',
      an: $('inp-an')?.value || '',
      ag: $('inp-ag')?.value || '',
      bohrsystem: $('inp-bohrsystem')?.value || '',
      bohrzeitraum: $('inp-bohrzeitraum')?.value || '',
      verpresszeitraum: $('inp-verpresszeitraum')?.value || '',
      hinweis: $('inp-hinweis')?.value || '',
      sigAnName: $('sigAnName')?.value || '',
      sigAgName: $('sigAgName')?.value || ''
    },
    rows: rowRefs.map((r) => ({
      nr: r.nr.value || '',
      neigung: r.neigung.value || '',
      bez: r.bez.value || '–',
      gewebe: r.gewebe.value || '',
      bohrloch: r.bohrloch.value || '',
      zement: r.zement.value || '',
      wz: r.wz.value || '',
      lv: r.lv.value || '',
      lb: r.lb.value || '',
      fv: r.fv.value || '',
      fb: r.fb.value || '',
      note: r.note.value || ''
    })),
    sign: {
      an: sigPads.an?.getDataURL?.() || '',
      ag: sigPads.ag?.getDataURL?.() || ''
    }
  };
}

function applyState(state) {
  if (!state || !state.meta) return;

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

  (state.rows || []).slice(0, ROWS).forEach((row, i) => {
    const r = rowRefs[i];
    if (!r) return;
    r.nr.value = row.nr ?? '';
    r.neigung.value = row.neigung ?? '';
    r.bez.value = row.bez ?? '–';
    r.gewebe.value = row.gewebe ?? 'nein';
    r.bohrloch.value = row.bohrloch ?? '';
    r.zement.value = row.zement ?? '';
    r.wz.value = row.wz ?? '';
    r.lv.value = row.lv ?? '';
    r.lb.value = row.lb ?? '';
    r.fv.value = row.fv ?? '';
    r.fb.value = row.fb ?? '';
    r.note.value = row.note ?? '';
  });

  sigPads.an?.setFromDataURL?.(state.sign?.an || '');
  sigPads.ag?.setFromDataURL?.(state.sign?.ag || '');
  recalc();
}

const saveDraftDebounced = debounce(() => {
  try {
    localStorage.setItem(STORAGE_DRAFT, JSON.stringify(collectState()));
  } catch {}
}, 250);

function loadDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_DRAFT);
    if (raw) applyState(JSON.parse(raw));
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

function getSnapshotSums(snap) {
  let count = 0;
  let sumZement = 0;
  let sumLen = 0;

  (snap.rows || []).forEach((r) => {
    const has = (
      String(r.nr || '').trim() !== '' ||
      String(r.neigung || '').trim() !== '' ||
      (r.bez && r.bez !== '–') ||
      String(r.zement || '').trim() !== '' ||
      String(r.lb || '').trim() !== '' ||
      String(r.fb || '').trim() !== ''
    );

    const len = Math.max(parseNum(r.lb), parseNum(r.fb));
    const zem = parseNum(r.zement);

    if (has) {
      count += 1;
      sumZement += zem;
      sumLen += len;
    }
  });

  return { count, sumZement, sumLen };
}

function saveToHistory() {
  const snap = collectState();
  const sums = getSnapshotSums(snap);
  const entry = {
    id: uid(),
    savedAt: Date.now(),
    title: `${snap.meta.baustelle || '—'} · Prot ${snap.meta.protoNr || '—'} · ${dateDE(snap.meta.datum)}`,
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
        Zement: <b>${fmtDE(entry.sums.sumZement)} kg</b> ·
        Nagellänge: <b>${fmtDE(entry.sums.sumLen)} m</b>
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
      const list2 = readHistory();
      const entry = list2.find((e) => e.id === id);

      if (act === 'load' && entry) {
        applyState(entry.snap);
        saveDraftDebounced();
        document.querySelector('.tab[data-tab="protokoll"]')?.click();
      }

      if (act === 'pdf' && entry) {
        await exportPdf(entry.snap);
      }

      if (act === 'del') {
        writeHistory(list2.filter((e) => e.id !== id));
        renderHistory();
      }
    });
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
      if (!signed) return '';
      return canvas.toDataURL('image/png');
    },
    setFromDataURL(dataURL) {
      prep();
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      fillWhite(canvas);
      if (!dataURL) {
        signed = false;
        return;
      }
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        signed = true;
      };
      img.src = dataURL;
    }
  };
}

function initSignaturePads() {
  sigPads.an = makeSignaturePad($('sigAnCanvas'), saveDraftDebounced);
  sigPads.ag = makeSignaturePad($('sigAgCanvas'), saveDraftDebounced);

  $('sigAnClear')?.addEventListener('click', () => sigPads.an.clear());
  $('sigAgClear')?.addEventListener('click', () => sigPads.ag.clear());
}

function dataURLtoUint8(dataURL) {
  const b64 = String(dataURL || '').split(',')[1];
  if (!b64) return null;
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function exportPdf(snapArg = null) {
  const snap = snapArg || collectState();
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

    while (s.length > 1 && measure(s + '…') > maxWidth) {
      s = s.slice(0, -1);
    }
    return s ? `${s}…` : '';
  }

  function drawTextCell(text, x, yTop, w, h, font, size, align = 'left', pad = mm(0.8)) {
    const raw = String(text ?? '').trim();
    if (!raw) return;
    const maxW = Math.max(1, w - pad * 2);
    const fitted = fitText(raw, font, size, maxW);
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
    const lineGap = size + 1;
    const total = arr.length * lineGap;
    const startY = yTop - h + (h - total) / 2 + lineGap - 1;

    arr.forEach((line, idx) => {
      const fitted = fitText(line, font, size, w - mm(1.6));
      const tw = font.widthOfTextAtSize(fitted, size);
      page.drawText(fitted, {
        x: x + (w - tw) / 2,
        y: startY + (arr.length - 1 - idx) * lineGap,
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
  col.forEach((w) => {
    xPos.push(run);
    run += w;
  });

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
        end: { x: xPos[c], y: y },
        thickness: 0.25,
        color: K
      });
    }

    const lv = parseNum(r.lv);
    const lb = parseNum(r.lb);
    const fv = parseNum(r.fv);
    const fb = parseNum(r.fb);
    const ld = Math.max(0, lb - lv);
    const fd = Math.max(0, fb - fv);
    const len = Math.max(lb, fb);

    const vals = [
      r.nr || '',
      r.neigung || '',
      (r.bez && r.bez !== '–') ? r.bez : '',
      r.gewebe || '',
      r.bohrloch || '',
      r.zement !== '' ? fmtDE(parseNum(r.zement)) : '',
      r.wz || '',
      r.lv !== '' ? fmtDE(lv) : '',
      r.lb !== '' ? fmtDE(lb) : '',
      (r.lv !== '' || r.lb !== '') ? fmtDE(ld) : '',
      r.fv !== '' ? fmtDE(fv) : '',
      r.fb !== '' ? fmtDE(fb) : '',
      (r.fv !== '' || r.fb !== '') ? fmtDE(fd) : '',
      len > 0 ? fmtDE(len) : '',
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

  const sums = getSnapshotSums(snap);

  drawTextCell(`Nagelanzahl [Stk.]: ${sums.count}`, left, y, third, sum1H, fontB, 8);
  drawTextCell(`Zement ges. [kg]: ${fmtDE(sums.sumZement)}`, left + third, y, third, sum1H, fontB, 8);
  drawTextCell(`Nagellänge ges. [m]: ${fmtDE(sums.sumLen)}`, left + third * 2, y, third, sum1H, fontB, 8);

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

function hookMetaEvents() {
  [
    'inp-datum',
    'inp-proto-nr',
    'inp-baustelle',
    'inp-an',
    'inp-ag',
    'inp-bohrsystem',
    'inp-bohrzeitraum',
    'inp-verpresszeitraum',
    'inp-hinweis',
    'sigAnName',
    'sigAgName'
  ].forEach((id) => {
    $(id)?.addEventListener('input', onAnyInput);
    $(id)?.addEventListener('change', onAnyInput);
  });
}

function hookButtons() {
  $('btnReset')?.addEventListener('click', () => {
    $('inp-proto-nr').value = '';
    $('inp-baustelle').value = '';
    $('inp-ag').value = '';
    $('inp-bohrsystem').value = '';
    $('inp-bohrzeitraum').value = '';
    $('inp-verpresszeitraum').value = '';
    $('inp-hinweis').value = '';
    $('sigAnName').value = '';
    $('sigAgName').value = '';

    rowRefs.forEach((r) => {
      r.nr.value = '';
      r.neigung.value = '';
      r.bez.value = '–';
      r.gewebe.value = 'nein';
      r.bohrloch.value = '';
      r.zement.value = '';
      r.wz.value = '0,45';
      r.lv.value = '';
      r.lb.value = '';
      r.fv.value = '';
      r.fb.value = '';
      r.note.value = '';
    });

    sigPads.an?.clear();
    sigPads.ag?.clear();

    recalc();
    saveDraftDebounced();
  });

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
    const choice = await installPrompt.userChoice;
    if (choice?.outcome === 'accepted') $('btnInstall').hidden = true;
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
  if ($('inp-datum') && !$('inp-datum').value) {
    $('inp-datum').value = new Date().toISOString().slice(0, 10);
  }

  initTabs();
  buildTable();
  initSignaturePads();
  hookMetaEvents();
  hookButtons();
  initInstallButton();

  loadDraft();
  recalc();
  renderHistory();

  registerSW();
});
