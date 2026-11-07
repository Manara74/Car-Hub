(function () {
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEY = 'gg.data';

/* ---------- dati: pronti per più veicoli, mostrati uno alla volta ---------- */
const TYPES = [
  ['bollo', 'Bollo', 12], ['assicurazione', 'Assicurazione', 12], ['revisione', 'Revisione', 24], ['tagliando', 'Tagliando', 12]
];
const EVERY = [[6, '6 mesi'], [12, '1 anno'], [24, '2 anni'], [36, '3 anni'], [48, '4 anni']];
const uid = () => 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function newVehicle(name, type) {
  const dl = {}; TYPES.forEach(([k, , ev]) => { dl[k] = { date: '', every: ev, note: '' }; });
  dl.tagliando.kmDue = null;
  return { id: uid(), name: name || '', type: type || 'auto', plate: '', km: null, dl };
}
function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (v && Array.isArray(v.vehicles) && v.vehicles.length) {
      v.vehicles.forEach(x => { // completa i campi mancanti senza perdere nulla
        x.dl = x.dl || {};
        TYPES.forEach(([k, , ev]) => { x.dl[k] = Object.assign({ date: '', every: ev, note: '' }, x.dl[k]); });
      });
      if (!v.vehicles.some(x => x.id === v.active)) v.active = v.vehicles[0].id;
      return v;
    }
  } catch (e) { /* senza memoria locale riparte da zero */ }
  const x = newVehicle('', 'auto');
  return { v: 1, vehicles: [x], active: x.id };
}
let D = load();
const cur = () => D.vehicles.find(x => x.id === D.active) || D.vehicles[0];
function save() { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { /* memoria piena o bloccata */ } }

/* ---------- date ---------- */
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
function daysLeft(s) {
  if (!s) return null;
  const t = new Date(); t.setHours(12, 0, 0, 0);
  return Math.round((new Date(s + 'T12:00:00').getTime() - t.getTime()) / 864e5);
}
function addMonths(s, n) {
  const d = s ? new Date(s + 'T12:00:00') : new Date();
  const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last)); return iso(d);
}
const fmtDate = s => s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
function status(d) {
  if (d == null) return { c: 'none', t: 'Da impostare' };
  if (d < 0) return { c: 'late', t: 'Scaduta da ' + plural(-d, 'giorno', 'giorni') };
  if (d === 0) return { c: 'late', t: 'Scade oggi' };
  if (d <= 7) return { c: 'late', t: 'Tra ' + plural(d, 'giorno', 'giorni') };
  if (d <= 30) return { c: 'soon', t: 'Tra ' + d + ' giorni' };
  if (d <= 90) return { c: 'ok', t: 'Tra ' + d + ' giorni' };
  const m = Math.round(d / 30.44);
  return { c: 'ok', t: m < 24 ? 'Tra ' + m + ' mesi' : 'Tra ' + (Math.round(d / 36.5) / 10).toLocaleString('it-IT') + ' anni' };
}
function kmStatus(v) {
  const t = v.dl.tagliando;
  if (!t.kmDue || !v.km) return null;
  const left = t.kmDue - v.km;
  if (left < 0) return { c: 'late', t: 'Tagliando: superati di ' + (-left).toLocaleString('it-IT') + ' km' };
  if (left <= 1000) return { c: left <= 300 ? 'late' : 'soon', t: 'Tagliando fra ' + left.toLocaleString('it-IT') + ' km' };
  return { c: 'none', t: 'Tagliando fra ' + left.toLocaleString('it-IT') + ' km' };
}

/* ---------- avvisi (tutti i mezzi) ---------- */
function alerts() {
  const out = [];
  D.vehicles.forEach(v => {
    const nm = v.name || (v.type === 'moto' ? 'La mia moto' : 'La mia auto');
    TYPES.forEach(([k, label]) => {
      const d = daysLeft(v.dl[k].date);
      if (d != null && d <= 30) out.push({ d, c: d <= 7 ? 'late' : 'soon', t: label + (D.vehicles.length > 1 ? ' · ' + nm : '') + ': ' + status(d).t.toLowerCase() });
    });
    const ks = kmStatus(v); if (ks && ks.c !== 'none') out.push({ d: -1, c: ks.c, t: (D.vehicles.length > 1 ? nm + ' · ' : '') + ks.t.toLowerCase() });
  });
  return out.sort((a, b) => a.d - b.d);
}

/* ---------- schermate ---------- */
const VIEWS = { menu: 'vMenu', scadenze: 'vScad', backup: 'vBackup' };
const TITLES = { menu: 'Garage', scadenze: 'Scadenze auto', backup: 'Backup' };
function route() {
  const h = (location.hash || '#menu').slice(1);
  const v = VIEWS[h] ? h : 'menu';
  Object.keys(VIEWS).forEach(k => { $(VIEWS[k]).hidden = k !== v; });
  $('ggTitle').textContent = TITLES[v]; $('btnBack').hidden = v === 'menu';
  if (v === 'menu') renderMenu(); if (v === 'scadenze') renderScad();
  window.scrollTo(0, 0);
}
function renderMenu() {
  const al = alerts(), b = $('scadBadge');
  b.hidden = !al.length; b.textContent = String(al.length); b.classList.toggle('warn', !al.some(x => x.c === 'late'));
  const m = $('menuAlert');
  m.hidden = !al.length;
  m.innerHTML = al.length ? '<b>' + (al.length === 1 ? '1 scadenza da controllare' : al.length + ' scadenze da controllare') + ':</b> ' + esc(al.slice(0, 2).map(x => cap(x.t)).join(' · ')) + (al.length > 2 ? '…' : '') : '';
  $('scadSub').textContent = al.length ? cap(al[0].t) : 'Bollo, assicurazione, revisione, tagliando';
}
function renderScad() {
  const v = cur();
  $('vehSwitch').hidden = D.vehicles.length < 2;
  if (D.vehicles.length > 1) { $('selVeh').innerHTML = D.vehicles.map(x => '<option value="' + esc(x.id) + '">' + esc(x.name || 'Senza nome') + '</option>').join(''); $('selVeh').value = v.id; }
  if (document.activeElement !== $('vName')) $('vName').value = v.name;
  if (document.activeElement !== $('vPlate')) $('vPlate').value = v.plate;
  if (document.activeElement !== $('vKm')) $('vKm').value = v.km == null ? '' : v.km;
  document.querySelectorAll('#vType button').forEach(b => b.classList.toggle('on', b.dataset.t === v.type));
  const al = alerts();
  $('scadSum').textContent = al.length ? (al.length === 1 ? '1 scadenza da controllare: ' : al.length + ' scadenze da controllare: ') + al.slice(0, 3).map(x => cap(x.t)).join(' · ') + '.' : 'Nessuna scadenza nei prossimi 30 giorni.';
  const ks = kmStatus(v);
  $('dlList').innerHTML = TYPES.map(([k, label]) => {
    const dl = v.dl[k], d = daysLeft(dl.date), st = status(d);
    const km = k === 'tagliando' && ks ? '<p class="kmline ' + ks.c + '">' + esc(ks.t) + '</p>' : '';
    return '<div class="dl-card ' + st.c + '" data-k="' + k + '"><div class="dl-top"><b>' + label + '</b><span class="dl-st ' + st.c + '">' + esc(st.t) + '</span></div>' +
      '<div class="grid"><div class="field"><span>Prossima scadenza</span><input type="date" data-f="date" value="' + esc(dl.date) + '"></div>' +
      '<div class="field"><span>Si ripete ogni</span><select data-f="every">' + EVERY.map(([n, t]) => '<option value="' + n + '"' + (n === dl.every ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div>' +
      (k === 'tagliando' ? '<div class="field wide"><span>Prossimo tagliando ai km (facoltativo)</span><input type="number" inputmode="numeric" min="0" step="1" data-f="kmDue" placeholder="Es. 90000" value="' + (dl.kmDue == null ? '' : dl.kmDue) + '"></div>' : '') +
      '<div class="field wide"><span>Nota (facoltativa)</span><input type="text" data-f="note" maxlength="80" placeholder="' + (k === 'assicurazione' ? 'Compagnia, numero polizza' : k === 'bollo' ? 'Regione, importo' : 'Officina, cosa fare') + '" value="' + esc(dl.note) + '" autocomplete="off"></div></div>' +
      km + '<div class="dl-acts"><button type="button" class="btn small" data-act="renew">Rinnovata</button>' + (dl.date ? '<button type="button" class="btn small ghost" data-act="clear">Togli data</button>' : '') + '</div></div>';
  }).join('');
}

/* ---------- eventi ---------- */
function wire() {
  window.addEventListener('hashchange', route);
  $('btnBack').addEventListener('click', () => { if (history.length > 1) history.back(); else location.hash = '#menu'; });
  $('vName').addEventListener('change', e => { cur().name = e.target.value.trim(); save(); renderScad(); });
  $('vPlate').addEventListener('change', e => { cur().plate = e.target.value.trim().toUpperCase(); save(); renderScad(); });
  $('vKm').addEventListener('change', e => { const n = parseInt(e.target.value, 10); cur().km = n >= 0 ? n : null; save(); renderScad(); });
  $('vType').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; cur().type = b.dataset.t; save(); renderScad(); });
  $('selVeh').addEventListener('change', e => { D.active = e.target.value; save(); renderScad(); });
  $('dlList').addEventListener('change', e => {
    const card = e.target.closest('.dl-card'), f = e.target.dataset.f; if (!card || !f) return;
    const dl = cur().dl[card.dataset.k];
    if (f === 'every') dl.every = parseInt(e.target.value, 10) || dl.every;
    else if (f === 'kmDue') { const n = parseInt(e.target.value, 10); dl.kmDue = n > 0 ? n : null; }
    else dl[f] = e.target.value;
    save(); renderScad();
  });
  $('dlList').addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const dl = cur().dl[b.closest('.dl-card').dataset.k];
    if (b.dataset.act === 'renew') {
      const d = daysLeft(dl.date);
      dl.date = addMonths(dl.date && d != null && d > -400 ? dl.date : '', dl.every);
      // se la data è rimasta nel passato (rinnovo in ritardo di più periodi) riparte da oggi
      if (daysLeft(dl.date) < 0) dl.date = addMonths('', dl.every);
    } else if (b.dataset.act === 'clear') dl.date = '';
    save(); renderScad();
  });
  // backup
  $('btnExport').addEventListener('click', exportAll);
  $('impFile').addEventListener('change', pickFile);
  $('btnImport').addEventListener('click', doImport);
}

/* ---------- backup ---------- */
const OWN = k => /^(gg|pg)\./.test(k);
function exportAll() {
  const m = $('expMsg');
  try {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (OWN(k)) data[k] = localStorage.getItem(k); }
    const body = JSON.stringify({ app: 'garage-backup', version: 1, created: new Date().toISOString(), data }, null, 1);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
    a.download = 'garage-backup-' + iso(new Date()) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    m.className = 'msg'; m.textContent = 'File creato con ' + Object.keys(data).length + ' voci. Lo trovi nei download del telefono.';
  } catch (e) { m.className = 'msg err'; m.textContent = 'Non riesco a creare il file: ' + (e.message || e); }
}
let pending = null;
function pickFile(e) {
  const f = e.target.files[0], m = $('impMsg'); pending = null; $('btnImport').hidden = true;
  if (!f) return;
  $('impName').textContent = f.name;
  const r = new FileReader();
  r.onload = () => {
    try {
      const j = JSON.parse(r.result);
      if (!j || j.app !== 'garage-backup' || typeof j.data !== 'object') throw new Error('Questo non è un file di backup di Garage.');
      const d = {}; Object.keys(j.data).forEach(k => { if (OWN(k) && typeof j.data[k] === 'string') d[k] = j.data[k]; });
      if (!Object.keys(d).length) throw new Error('Il file non contiene dati.');
      pending = d; m.className = 'msg';
      m.textContent = 'File valido: ' + Object.keys(d).length + ' voci' + (j.created ? ', creato il ' + fmtDate(String(j.created).slice(0, 10)) : '') + '. Tocca il pulsante per sostituire i dati di questo telefono.';
      $('btnImport').hidden = false;
    } catch (er) { m.className = 'msg err'; m.textContent = er.message || 'Non riesco a leggere il file.'; }
  };
  r.onerror = () => { m.className = 'msg err'; m.textContent = 'Non riesco a leggere il file.'; };
  r.readAsText(f); e.target.value = '';
}
function doImport() {
  if (!pending) return;
  try {
    const old = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (OWN(k)) old.push(k); }
    old.forEach(k => localStorage.removeItem(k));
    Object.keys(pending).forEach(k => localStorage.setItem(k, pending[k]));
    pending = null; D = load();
    const m = $('impMsg'); m.className = 'msg'; m.textContent = 'Dati ripristinati.'; $('btnImport').hidden = true;
    setTimeout(() => { location.hash = '#menu'; location.reload(); }, 600);
  } catch (e) { const m = $('impMsg'); m.className = 'msg err'; m.textContent = 'Ripristino non riuscito: ' + (e.message || e); }
}

wire(); route();
})();
