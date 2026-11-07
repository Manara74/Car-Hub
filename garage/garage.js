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
  return { id: uid(), name: name || '', type: type || 'auto', plate: '', km: null, dl, fills: [] };
}
function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (v && Array.isArray(v.vehicles) && v.vehicles.length) {
      v.vehicles.forEach(x => { // completa i campi mancanti senza perdere nulla
        x.dl = x.dl || {}; if (!Array.isArray(x.fills)) x.fills = [];
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
const fmtN = (n, d) => Number(n).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
const vName = v => v.name || (v.type === 'moto' ? 'La mia moto' : 'La mia auto');
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
const VIEWS = { menu: 'vMenu', scadenze: 'vScad', diario: 'vDiario', mezzi: 'vMezzi', backup: 'vBackup' };
const TITLES = { menu: 'Garage', scadenze: 'Scadenze auto', diario: 'Diario rifornimenti', mezzi: 'I miei mezzi', backup: 'Backup' };
function route() {
  const h = (location.hash || '#menu').slice(1);
  const v = VIEWS[h] ? h : 'menu';
  Object.keys(VIEWS).forEach(k => { $(VIEWS[k]).hidden = k !== v; });
  $('ggTitle').textContent = TITLES[v]; $('btnBack').hidden = v === 'menu';
  if (v === 'menu') renderMenu(); if (v === 'scadenze') renderScad(); if (v === 'diario') renderDiario(true); if (v === 'mezzi') renderMezzi();
  window.scrollTo(0, 0);
}
function renderMenu() {
  const al = alerts(), b = $('scadBadge');
  b.hidden = !al.length; b.textContent = String(al.length); b.classList.toggle('warn', !al.some(x => x.c === 'late'));
  const m = $('menuAlert');
  m.hidden = !al.length;
  m.innerHTML = al.length ? '<b>' + (al.length === 1 ? '1 scadenza da controllare' : al.length + ' scadenze da controllare') + ':</b> ' + esc(al.slice(0, 2).map(x => cap(x.t)).join(' · ')) + (al.length > 2 ? '…' : '') : '';
  const vs = D.vehicles; $('mezziSub').textContent = vs.length === 1 ? vName(vs[0]) : vs.length + ' mezzi: ' + vs.map(vName).join(', ');
  const lf = cur().fills.slice().sort((a, b) => a.date.localeCompare(b.date) || a.km - b.km), st = fillStats(cur());
  $('diaSub').textContent = !lf.length ? 'Litri, spesa e consumi reali' : st.avg != null ? 'Consumo medio ' + fmtN(st.avg, 1) + ' l/100 km' : lf.length + (lf.length === 1 ? ' rifornimento registrato' : ' rifornimenti registrati');
  $('scadSub').textContent = al.length ? cap(al[0].t) : 'Bollo, assicurazione, revisione, tagliando';
}
function renderScad() {
  const v = cur(); renderVbars();
  const al = alerts();
  $('scadSum').textContent = al.length ? (al.length === 1 ? '1 scadenza da controllare: ' : al.length + ' scadenze da controllare: ') + al.slice(0, 3).map(x => cap(x.t)).join(' · ') + '.' : 'Nessuna scadenza nei prossimi 30 giorni.';
  const ks = kmStatus(v);
  $('dlList').innerHTML = TYPES.map(([k, label]) => {
    const dl = v.dl[k], d = daysLeft(dl.date), st = status(d);
    const km = k === 'tagliando' && ks ? '<p class="kmline ' + ks.c + '">' + esc(ks.t) + '</p>' : '';
    return '<div class="dl-card ' + st.c + '" data-k="' + k + '"><div class="dl-top"><b>' + label + '</b><span class="dl-st ' + st.c + '">' + esc(st.t) + '</span></div>' +
      '<div class="grid"><div class="field"><span>Prossima scadenza</span><input type="date" data-f="date" value="' + esc(dl.date) + '"></div>' +
      '<div class="field"><span>Si ripete ogni</span><select data-f="every">' + EVERY.map(([n, t]) => '<option value="' + n + '"' + (n === dl.every ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div>' +
      (k === 'tagliando' ? '<div class="field"><span>Km attuali</span><input type="number" inputmode="numeric" min="0" step="1" data-f="vkm" placeholder="Es. 84500" value="' + (v.km == null ? '' : v.km) + '"></div><div class="field"><span>Tagliando ai km</span><input type="number" inputmode="numeric" min="0" step="1" data-f="kmDue" placeholder="Es. 90000" value="' + (dl.kmDue == null ? '' : dl.kmDue) + '"></div>' : '') +
      '<div class="field wide"><span>Nota (facoltativa)</span><input type="text" data-f="note" maxlength="80" placeholder="' + (k === 'assicurazione' ? 'Compagnia, numero polizza' : k === 'bollo' ? 'Regione, importo' : 'Officina, cosa fare') + '" value="' + esc(dl.note) + '" autocomplete="off"></div></div>' +
      km + '<div class="dl-acts"><button type="button" class="btn small" data-act="renew">Rinnovata</button>' + (dl.date ? '<button type="button" class="btn small ghost" data-act="clear">Togli data</button>' : '') + '</div></div>';
  }).join('');
}


/* ---------- selettore del mezzo (uguale in ogni modulo) ---------- */
function renderVbars() {
  const opts = D.vehicles.map(x => '<option value="' + esc(x.id) + '">' + esc(vName(x)) + (x.plate ? ' · ' + esc(x.plate) : '') + '</option>').join('');
  document.querySelectorAll('[data-vbar]').forEach(b => {
    b.innerHTML = '<div class="field"><span>Mezzo</span><select data-vsel>' + opts + '</select></div><a class="btn small ghost" href="#mezzi">Gestisci</a>';
    b.querySelector('select').value = D.active;
  });
}

/* ---------- schermata «I miei mezzi» ---------- */
function renderMezzi() {
  const v = cur();
  $('vehList').innerHTML = D.vehicles.map(x => '<button type="button" class="vitem' + (x.id === v.id ? ' on' : '') + '" data-vid="' + esc(x.id) + '">' +
    '<span class="vt">' + (x.type === 'moto' ? 'Moto' : 'Auto') + '</span><b>' + esc(vName(x)) + '</b>' +
    '<small>' + [x.plate, x.km != null ? fmtN(x.km, 0) + ' km' : '', x.fills.length ? plural(x.fills.length, 'rifornimento', 'rifornimenti') : ''].filter(Boolean).map(esc).join(' · ') + '</small></button>').join('');
  if (document.activeElement !== $('vName')) $('vName').value = v.name;
  if (document.activeElement !== $('vPlate')) $('vPlate').value = v.plate;
  if (document.activeElement !== $('vKm')) $('vKm').value = v.km == null ? '' : v.km;
  document.querySelectorAll('#vType button').forEach(b => b.classList.toggle('on', b.dataset.t === v.type));
  const only = D.vehicles.length < 2;
  $('btnDelVeh').disabled = only;
  $('delHint').textContent = only ? 'Deve restare almeno un mezzo. Aggiungine un altro prima di eliminare questo.' :
    'Elimina «' + vName(v) + '» con le sue scadenze e il suo diario dei rifornimenti. Non si può annullare: fai prima un backup se vuoi tenerne una copia.';
}

/* ---------- diario dei rifornimenti ---------- */
const FUELN = { B: 'Benzina', D: 'Gasolio', G: 'GPL', M: 'Metano' };
const byDate = (a, b) => a.date.localeCompare(b.date) || a.km - b.km;
/* Il consumo si calcola tra due pieni completi: litri messi dopo il primo pieno fino al secondo, divisi per i km fatti. */
function fillStats(v) {
  const f = v.fills.slice().sort(byDate), res = new Map();
  let last = -1, tl = 0, td = 0, tc = 0;
  f.forEach((x, i) => {
    if (!x.full) return;
    if (last >= 0) {
      const dist = x.km - f[last].km; let L = 0, C = 0;
      for (let j = last + 1; j <= i; j++) { L += f[j].liters; C += f[j].total; }
      if (dist > 0) { res.set(x.id, { dist, L, C, cons: L / dist * 100 }); tl += L; td += dist; tc += C; }
    }
    last = i;
  });
  return { sorted: f, res, avg: td > 0 ? tl / td * 100 : null, cpk: td > 0 ? tc / td : null, td };
}
let editId = null;
function fillPrice() {
  const l = parseFloat($('fL').value), t = parseFloat($('fTot').value);
  $('fPrice').textContent = l > 0 && t > 0 ? fmtN(t / l, 3) + ' €/L' : '—';
}
function resetForm(keepMsg) {
  const v = cur(), last = v.fills.slice().sort(byDate).pop();
  editId = null; $('fillTitle').textContent = 'Nuovo rifornimento'; $('btnFill').textContent = 'Salva il rifornimento'; $('btnFillCancel').hidden = true;
  $('fDate').value = iso(new Date()); $('fKm').value = ''; $('fL').value = ''; $('fTot').value = ''; $('fNote').value = ''; $('fFull').checked = true;
  $('fFuel').value = last ? last.fuel : 'B'; $('fKm').placeholder = last ? 'Ultimo: ' + fmtN(last.km, 0) : 'Contachilometri';
  if (!keepMsg) $('fillMsg').textContent = '';
  fillPrice();
}
function renderDiario(reset) {
  renderVbars();
  if (reset) resetForm();
  const v = cur(), st = fillStats(v), f = st.sorted.slice().reverse();
  const box = $('diaStats'); box.hidden = !f.length;
  if (f.length) {
    const tot = f.reduce((a, x) => ({ l: a.l + x.liters, c: a.c + x.total }), { l: 0, c: 0 });
    const lim = new Date(); lim.setDate(lim.getDate() - 30); const l30 = iso(lim);
    const c30 = f.filter(x => x.date >= l30).reduce((a, x) => a + x.total, 0);
    const cell = (k, val, sub) => '<div><small>' + k + '</small><b class="num">' + val + '</b>' + (sub ? '<em>' + sub + '</em>' : '') + '</div>';
    $('statsGrid').innerHTML =
      cell('Consumo medio', st.avg != null ? fmtN(st.avg, 1) + ' l/100 km' : '—', st.avg != null ? fmtN(100 / st.avg, 1) + ' km/l' : 'servono due pieni') +
      cell('Costo al km', st.cpk != null ? fmtN(st.cpk, 3) + ' €' : '—', st.cpk != null ? 'solo carburante' : '') +
      cell('Spesa ultimi 30 giorni', fmtN(c30, 2) + ' €', '') +
      cell('Prezzo medio', fmtN(tot.c / tot.l, 3) + ' €/L', '');
    $('statsNote').textContent = plural(f.length, 'rifornimento', 'rifornimenti') + ' · ' + fmtN(tot.l, 1) + ' litri · ' + fmtN(tot.c, 2) + ' € in totale' + (st.td ? ' · ' + fmtN(st.td, 0) + ' km misurati' : '') + '.';
  }
  $('fillList').innerHTML = f.length ? f.map(x => {
    const r = st.res.get(x.id);
    const cons = r ? fmtN(r.cons, 1) + ' l/100 km · ' + fmtN(r.dist, 0) + ' km dal pieno precedente' : x.full ? 'Primo pieno: il consumo parte dal prossimo' : 'Pieno parziale';
    return '<div class="fill" data-id="' + esc(x.id) + '"><div class="ft"><b>' + fmtDate(x.date) + '</b><span>' + esc(FUELN[x.fuel] || x.fuel) + (x.note ? ' · ' + esc(x.note) : '') + '</span></div>' +
      '<div class="fv"><span class="num">' + fmtN(x.liters, 2) + ' L</span><span class="num">' + fmtN(x.total, 2) + ' €</span><span class="num">' + fmtN(x.total / x.liters, 3) + ' €/L</span></div>' +
      '<div class="fk">' + fmtN(x.km, 0) + ' km · ' + esc(cons) + '</div>' +
      '<div class="dl-acts"><button type="button" class="btn small ghost" data-act="edit">Modifica</button><button type="button" class="btn small ghost danger" data-act="del">Elimina</button></div></div>';
  }).join('') : '<p class="empty">Nessun rifornimento registrato per questo mezzo. Inserisci il primo qui sopra: per i consumi servono almeno due pieni completi.</p>';
}
function saveFill(e) {
  e.preventDefault();
  const v = cur(), m = $('fillMsg'); m.className = 'msg err';
  const date = $('fDate').value, km = parseInt($('fKm').value, 10), l = parseFloat($('fL').value), t = parseFloat($('fTot').value);
  if (!date) { m.textContent = 'Scegli la data.'; return; }
  if (date > iso(new Date())) { m.textContent = 'La data è nel futuro.'; return; }
  if (!(km >= 0)) { m.textContent = 'Scrivi i chilometri del contachilometri.'; return; }
  if (!(l > 0 && l <= 400)) { m.textContent = 'I litri non sono validi.'; return; }
  if (!(t > 0 && t <= 5000)) { m.textContent = 'Il totale pagato non è valido.'; return; }
  const others = v.fills.filter(x => x.id !== editId);
  const bad = others.find(x => (x.date < date && x.km > km) || (x.date > date && x.km < km));
  if (bad) { m.textContent = 'I chilometri non tornano con il rifornimento del ' + fmtDate(bad.date) + ' (' + fmtN(bad.km, 0) + ' km). Controlla data e chilometri.'; return; }
  const rec = { id: editId || uid(), date, km, liters: Math.round(l * 100) / 100, total: Math.round(t * 100) / 100, fuel: $('fFuel').value, full: $('fFull').checked, note: $('fNote').value.trim() };
  if (editId) v.fills = v.fills.map(x => x.id === editId ? rec : x); else v.fills.push(rec);
  if (v.km == null || km > v.km) v.km = km;
  save(); resetForm(true); m.className = 'msg'; m.textContent = 'Rifornimento salvato.'; renderDiario(false);
}
let delArm = null;
function fillAction(e) {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const id = b.closest('.fill').dataset.id, v = cur();
  if (b.dataset.act === 'edit') {
    const x = v.fills.find(y => y.id === id); if (!x) return;
    editId = id; $('fillTitle').textContent = 'Modifica rifornimento'; $('btnFill').textContent = 'Salva le modifiche'; $('btnFillCancel').hidden = false;
    $('fDate').value = x.date; $('fKm').value = x.km; $('fL').value = x.liters; $('fTot').value = x.total; $('fFuel').value = x.fuel; $('fNote').value = x.note || ''; $('fFull').checked = !!x.full;
    $('fillMsg').textContent = ''; fillPrice(); $('fillForm').scrollIntoView({ block: 'start' });
  } else if (b.dataset.act === 'del') {
    if (delArm !== id) { delArm = id; b.textContent = 'Tocca ancora per eliminare'; setTimeout(() => { if (delArm === id) { delArm = null; b.textContent = 'Elimina'; } }, 3500); return; }
    delArm = null; v.fills = v.fills.filter(x => x.id !== id); save(); resetForm(); renderDiario(false);
  }
}

/* ---------- eventi ---------- */
function wire() {
  window.addEventListener('hashchange', route);
  $('btnBack').addEventListener('click', () => { if (history.length > 1) history.back(); else location.hash = '#menu'; });
  $('vName').addEventListener('change', e => { cur().name = e.target.value.trim(); save(); renderMezzi(); });
  $('vPlate').addEventListener('change', e => { cur().plate = e.target.value.trim().toUpperCase(); save(); renderMezzi(); });
  $('vKm').addEventListener('change', e => { const n = parseInt(e.target.value, 10); cur().km = n >= 0 ? n : null; save(); renderMezzi(); });
  $('vType').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; cur().type = b.dataset.t; save(); renderMezzi(); });
  $('vehList').addEventListener('click', e => { const b = e.target.closest('.vitem'); if (!b) return; D.active = b.dataset.vid; save(); renderMezzi(); });
  document.addEventListener('change', e => {
    if (!e.target.matches || !e.target.matches('select[data-vsel]')) return;
    D.active = e.target.value; save(); route();
  });
  $('btnAddVeh').addEventListener('click', () => {
    const x = newVehicle('', D.vehicles.some(y => y.type === 'auto') && !D.vehicles.some(y => y.type === 'moto') ? 'moto' : 'auto');
    D.vehicles.push(x); D.active = x.id; save(); renderMezzi(); $('vName').focus();
  });
  let delT = 0;
  $('btnDelVeh').addEventListener('click', () => {
    const b = $('btnDelVeh');
    if (!delT) { b.textContent = 'Tocca ancora per eliminare'; delT = setTimeout(() => { delT = 0; b.textContent = 'Elimina questo mezzo'; }, 3500); return; }
    clearTimeout(delT); delT = 0; b.textContent = 'Elimina questo mezzo';
    if (D.vehicles.length < 2) return;
    D.vehicles = D.vehicles.filter(x => x.id !== D.active); D.active = D.vehicles[0].id; save(); renderMezzi();
  });
  $('fillForm').addEventListener('submit', saveFill);
  $('btnFillCancel').addEventListener('click', () => { resetForm(); });
  ['fL', 'fTot'].forEach(i => $(i).addEventListener('input', fillPrice));
  $('fillList').addEventListener('click', fillAction);
  $('dlList').addEventListener('change', e => {
    const card = e.target.closest('.dl-card'), f = e.target.dataset.f; if (!card || !f) return;
    const dl = cur().dl[card.dataset.k];
    if (f === 'vkm') { const n = parseInt(e.target.value, 10); cur().km = n >= 0 ? n : null; save(); renderScad(); return; }
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
