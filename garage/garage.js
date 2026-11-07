(function () {
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEY = 'gg.data';

/* ---------- dati: pronti per più veicoli, mostrati uno alla volta ---------- */
const TYPES = [
  ['bollo', 'Bollo', 12], ['assicurazione', 'Assicurazione', 12], ['revisione', 'Revisione', 24], ['tagliando', 'Tagliando', 12]
];
let renewK = null;
const RENEWCAT = { bollo: 'bollo', assicurazione: 'assicurazione', revisione: 'revisione', tagliando: 'manutenzione' };
const EVERY = [[6, '6 mesi'], [12, '1 anno'], [24, '2 anni'], [36, '3 anni'], [48, '4 anni']];
const uid = () => 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function newVehicle(name, type) {
  const dl = {}; TYPES.forEach(([k, , ev]) => { dl[k] = { date: '', every: ev, note: '' }; });
  dl.tagliando.kmDue = null;
  return { id: uid(), name: name || '', type: type || 'auto', plate: '', km: null, dl, fills: [], expenses: [] };
}
function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (v && Array.isArray(v.vehicles) && v.vehicles.length) {
      v.vehicles.forEach(x => { // completa i campi mancanti senza perdere nulla
        x.dl = x.dl || {}; if (!Array.isArray(x.fills)) x.fills = []; if (!Array.isArray(x.expenses)) x.expenses = [];
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
const VIEWS = { menu: 'vMenu', scadenze: 'vScad', diario: 'vDiario', spese: 'vSpese', statistiche: 'vStat', mezzi: 'vMezzi', backup: 'vBackup' };
const TITLES = { menu: 'Garage', scadenze: 'Scadenze auto', diario: 'Diario rifornimenti', spese: 'Spese dell\'auto', statistiche: 'Statistiche', mezzi: 'I miei mezzi', backup: 'Backup' };
function route() {
  renewK = null;
  const h = (location.hash || '#menu').slice(1);
  const v = VIEWS[h] ? h : 'menu';
  Object.keys(VIEWS).forEach(k => { $(VIEWS[k]).hidden = k !== v; });
  $('ggTitle').textContent = TITLES[v]; $('btnBack').hidden = v === 'menu';
  if (v === 'menu') renderMenu(); if (v === 'scadenze') renderScad(); if (v === 'diario') renderDiario(true); if (v === 'mezzi') renderMezzi(); if (v === 'spese') renderSpese(true); if (v === 'statistiche') renderStat();
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
  const cv = cur(), mk = iso(new Date()).slice(0, 7);
  const mm = cv.expenses.filter(x => x.date.slice(0, 7) === mk).reduce((a, x) => a + x.amount, 0);
  $('spesaSub').textContent = cv.expenses.length ? 'Questo mese ' + fmtN(mm, 2) + ' € (carburante escluso)' : 'Manutenzione, gomme, pedaggi, multe';
  const tot12 = periodTotals(cv, 365);
  $('statSub').textContent = tot12.total > 0 ? 'Ultimi 12 mesi: ' + fmtN(tot12.total, 0) + ' € in tutto' : 'Quanto spendi, consumi, costo al km';
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
      km + (renewK === k
        ? '<div class="renew"><div class="field"><span>Quanto hai pagato? (€)</span><input type="number" inputmode="decimal" min="0" step="0.01" id="rAmt" placeholder="Es. 180,00"></div>' +
          '<div class="dl-acts"><button type="button" class="btn small" data-act="renew-save">Rinnova e registra la spesa</button><button type="button" class="btn small ghost" data-act="renew-skip">Rinnova senza spesa</button><button type="button" class="btn small ghost" data-act="renew-cancel">Annulla</button></div></div>'
        : '<div class="dl-acts"><button type="button" class="btn small" data-act="renew">Rinnovata</button>' + (dl.date ? '<button type="button" class="btn small ghost" data-act="clear">Togli data</button>' : '') + '</div>') + '</div>';
  }).join('');
}


/* ---------- selettore del mezzo (uguale in ogni modulo) ---------- */
function renderVbars() {
  const opts = D.vehicles.map(x => '<option value="' + esc(x.id) + '">' + esc(vName(x)) + (x.plate ? ' · ' + esc(x.plate) : '') + '</option>').join('');
  document.querySelectorAll('[data-vbar]').forEach(b => {
    const all = b.dataset.vbar === 'stat' && D.vehicles.length > 1;
    b.innerHTML = '<div class="field"><span>Mezzo</span><select data-vsel>' + (all ? '<option value="*">Tutti i mezzi</option>' : '') + opts + '</select></div><a class="btn small ghost" href="#mezzi">Gestisci</a>';
    b.querySelector('select').value = all && STALL ? '*' : D.active;
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


/* ---------- spese dell'auto ---------- */
const CATS = [['manutenzione', 'Manutenzione e tagliando'], ['riparazione', 'Riparazioni'], ['gomme', 'Gomme'], ['assicurazione', 'Assicurazione'],
  ['bollo', 'Bollo'], ['revisione', 'Revisione'], ['pedaggio', 'Pedaggi'], ['parcheggio', 'Parcheggi'], ['lavaggio', 'Lavaggio'],
  ['multa', 'Multe'], ['accessori', 'Accessori'], ['altro', 'Altro']];
const CATN = {}; CATS.forEach(([k, n]) => { CATN[k] = n; });
let expEdit = null;
function resetExp(keepMsg) {
  expEdit = null; $('expTitle').textContent = 'Nuova spesa'; $('btnExp').textContent = 'Salva la spesa'; $('btnExpCancel').hidden = true;
  $('eDate').value = iso(new Date()); $('eAmt').value = ''; $('eKm').value = ''; $('eNote').value = '';
  if (!$('eCat').options.length) $('eCat').innerHTML = CATS.map(([k, n]) => '<option value="' + k + '">' + n + '</option>').join('');
  if (!keepMsg) $('expMsg').textContent = '';
}
function renderSpese(reset) {
  renderVbars(); if (reset) resetExp();
  const v = cur(), e = v.expenses.slice().sort((a, b) => b.date.localeCompare(a.date));
  const box = $('expStats'); box.hidden = !e.length;
  if (e.length) {
    const lim = new Date(); lim.setDate(lim.getDate() - 365); const l12 = iso(lim), mk = iso(new Date()).slice(0, 7);
    const sum = f => e.filter(f).reduce((a, x) => a + x.amount, 0);
    const cell = (k, val, sub) => '<div><small>' + k + '</small><b class="num">' + val + '</b>' + (sub ? '<em>' + sub + '</em>' : '') + '</div>';
    $('expGrid').innerHTML = cell('Questo mese', fmtN(sum(x => x.date.slice(0, 7) === mk), 2) + ' €', '') + cell('Ultimi 12 mesi', fmtN(sum(x => x.date >= l12), 2) + ' €', '') +
      cell('Da sempre', fmtN(sum(() => true), 2) + ' €', plural(e.length, 'spesa', 'spese'));
  }
  $('expList').innerHTML = e.length ? e.map(x => '<div class="fill" data-id="' + esc(x.id) + '"><div class="ft"><b>' + fmtDate(x.date) + '</b><span>' + esc(CATN[x.cat] || x.cat) + '</span></div>' +
    '<div class="fv"><span class="num">' + fmtN(x.amount, 2) + ' €</span>' + (x.km != null ? '<span class="num">' + fmtN(x.km, 0) + ' km</span>' : '') + '</div>' +
    (x.note ? '<div class="fk">' + esc(x.note) + '</div>' : '') +
    '<div class="dl-acts"><button type="button" class="btn small ghost" data-act="edit">Modifica</button><button type="button" class="btn small ghost danger" data-act="del">Elimina</button></div></div>').join('')
    : '<p class="empty">Nessuna spesa registrata per questo mezzo. Inserisci la prima qui sopra: manutenzione, gomme, pedaggi, multe e tutto quello che non è carburante.</p>';
}
function saveExp(e) {
  e.preventDefault();
  const v = cur(), m = $('expMsg'); m.className = 'msg err';
  const date = $('eDate').value, amt = parseFloat($('eAmt').value), km = $('eKm').value === '' ? null : parseInt($('eKm').value, 10);
  if (!date) { m.textContent = 'Scegli la data.'; return; }
  if (date > iso(new Date())) { m.textContent = 'La data è nel futuro.'; return; }
  if (!(amt > 0 && amt <= 100000)) { m.textContent = 'L\'importo non è valido.'; return; }
  if (km != null && !(km >= 0)) { m.textContent = 'I chilometri non sono validi.'; return; }
  const rec = { id: expEdit || uid(), date, amount: Math.round(amt * 100) / 100, cat: $('eCat').value, km, note: $('eNote').value.trim() };
  if (expEdit) v.expenses = v.expenses.map(x => x.id === expEdit ? rec : x); else v.expenses.push(rec);
  if (km != null && (v.km == null || km > v.km)) v.km = km;
  save(); resetExp(true); m.className = 'msg'; m.textContent = 'Spesa salvata.'; renderSpese(false);
}
let expArm = null;
function expAction(e) {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const id = b.closest('.fill').dataset.id, v = cur();
  if (b.dataset.act === 'edit') {
    const x = v.expenses.find(y => y.id === id); if (!x) return;
    expEdit = id; $('expTitle').textContent = 'Modifica spesa'; $('btnExp').textContent = 'Salva le modifiche'; $('btnExpCancel').hidden = false;
    $('eDate').value = x.date; $('eAmt').value = x.amount; $('eCat').value = x.cat; $('eKm').value = x.km == null ? '' : x.km; $('eNote').value = x.note || '';
    $('expMsg').textContent = ''; $('expForm').scrollIntoView({ block: 'start' });
  } else if (b.dataset.act === 'del') {
    if (expArm !== id) { expArm = id; b.textContent = 'Tocca ancora per eliminare'; setTimeout(() => { if (expArm === id) { expArm = null; b.textContent = 'Elimina'; } }, 3500); return; }
    expArm = null; v.expenses = v.expenses.filter(x => x.id !== id); save(); resetExp(); renderSpese(false);
  }
}

/* ---------- statistiche ---------- */
let STP = '365', STALL = false;
const CATCOL = { carburante: 'var(--accent)', manutenzione: '#f0a24a', riparazione: '#e6765f', gomme: '#8d7cf0', assicurazione: '#4fc3b5', bollo: '#d6c24a', revisione: '#6fb8f0', pedaggio: '#c987d6', parcheggio: '#7aa66a', lavaggio: '#58b3c9', multa: '#e05a7a', accessori: '#a08f78', altro: '#8a98b4' };
function fromDate(p) { if (p === 'all') return '0000-00-00'; const d = new Date(); d.setDate(d.getDate() - parseInt(p, 10)); return iso(d); }
function periodTotals(v, p) {
  const from = fromDate(String(p));
  const fuel = v.fills.filter(x => x.date >= from).reduce((a, x) => a + x.total, 0);
  const other = v.expenses.filter(x => x.date >= from).reduce((a, x) => a + x.amount, 0);
  return { fuel, other, total: fuel + other, from };
}
function vehStat(v, from) {
  const fs = fillStats(v), inP = v.fills.filter(x => x.date >= from), ex = v.expenses.filter(x => x.date >= from);
  const fuel = inP.reduce((a, x) => a + x.total, 0), lt = inP.reduce((a, x) => a + x.liters, 0), other = ex.reduce((a, x) => a + x.amount, 0);
  const iv = fs.sorted.filter(x => x.date >= from && fs.res.has(x.id)).map(x => fs.res.get(x.id));
  const kms = inP.map(x => x.km).concat(ex.filter(x => x.km != null).map(x => x.km));
  const cats = {}; ex.forEach(x => { cats[x.cat] = (cats[x.cat] || 0) + x.amount; });
  return { v, fuel, other, total: fuel + other, lt, n: inP.length, cats,
    il: iv.reduce((a, r) => a + r.L, 0), id: iv.reduce((a, r) => a + r.dist, 0), ic: iv.reduce((a, r) => a + r.C, 0),
    span: kms.length > 1 ? Math.max(...kms) - Math.min(...kms) : 0,
    pts: fs.sorted.filter(x => fs.res.has(x.id) && x.date >= from).map(x => ({ d: x.date, c: fs.res.get(x.id).cons })) };
}
const VCOL = ['var(--accent)', 'var(--warn)', '#4fc3b5', '#c987d6', '#e6765f', '#7aa66a'];
function renderStat() {
  renderVbars();
  document.querySelectorAll('#stPeriod button').forEach(b => b.classList.toggle('on', b.dataset.p === STP));
  const multi = STALL && D.vehicles.length > 1, list = multi ? D.vehicles : [cur()];
  const has = list.some(v => v.fills.length || v.expenses.length);
  $('stEmpty').hidden = !!has; $('stBody').hidden = !has;
  $('stEmpty').textContent = multi ? 'Registra qualche rifornimento o spesa per vedere le statistiche dei tuoi mezzi.' : 'Registra qualche rifornimento o spesa per vedere le statistiche di questo mezzo.';
  if (!has) return;
  const from = fromDate(STP), S = list.map(v => vehStat(v, from));
  const sum = k => S.reduce((a, x) => a + x[k], 0);
  const fuel = sum('fuel'), other = sum('other'), total = fuel + other, lt = sum('lt'), il = sum('il'), id = sum('id'), ic = sum('ic'), n = sum('n');
  const withSpan = S.filter(x => x.span > 0), span = withSpan.reduce((a, x) => a + x.span, 0), spanCost = withSpan.reduce((a, x) => a + x.total, 0);
  const cell = (k, val, sub) => '<div><small>' + k + '</small><b class="num">' + val + '</b>' + (sub ? '<em>' + sub + '</em>' : '') + '</div>';
  const c1 = cell('Spesa totale', fmtN(total, 2) + ' €', 'carburante ' + fmtN(fuel, 0) + ' · altre ' + fmtN(other, 0));
  const c2 = cell('Costo al km', span > 0 ? fmtN(spanCost / span, 3) + ' €' : '—', span > 0 ? 'su ' + fmtN(span, 0) + ' km' : 'servono più chilometri');
  const c4 = cell('Prezzo medio', lt > 0 ? fmtN(fuel / lt, 3) + ' €/L' : '—', lt > 0 ? fmtN(lt, 1) + ' litri' : '');
  const c6 = cell('Rifornimenti', String(n), n ? 'in media ' + fmtN(fuel / n, 0) + ' €' : '');
  $('stCards').innerHTML = multi
    ? c1 + c2 + cell('Mezzi', String(S.length), S.map(x => x.v.type === 'moto' ? 'moto' : 'auto').join(' · ')) + c4 + cell('Km misurati', span > 0 ? fmtN(span, 0) : '—', 'somma dei mezzi') + c6
    : c1 + c2 + cell('Consumo medio', id > 0 ? fmtN(il / id * 100, 1) + ' l/100 km' : '—', id > 0 ? fmtN(id / il, 1) + ' km/l' : 'servono due pieni') + c4 +
      cell('Carburante al km', id > 0 ? fmtN(ic / id, 3) + ' €' : '—', 'solo carburante') + c6;
  // confronto tra mezzi
  $('stVehBox').hidden = !multi;
  if (multi) $('stVeh').innerHTML = S.slice().sort((a, b) => b.total - a.total).map(x =>
    '<div class="vrow"><span class="vdot" style="background:' + VCOL[D.vehicles.indexOf(x.v) % VCOL.length] + '"></span><div class="vi"><b>' + esc(vName(x.v)) + '</b><small>' +
    [x.span > 0 ? fmtN(x.total / x.span, 3) + ' €/km' : '', x.id > 0 ? fmtN(x.il / x.id * 100, 1) + ' l/100 km' : '', plural(x.n, 'rifornimento', 'rifornimenti')].filter(Boolean).join(' · ') + '</small></div>' +
    '<b class="num">' + fmtN(x.total, 2) + ' €</b></div>').join('');
  // mesi
  const now = new Date(), months = [];
  for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ k: d.getFullYear() + '-' + pad(d.getMonth() + 1), m: d.getMonth(), f: 0, o: 0 }); }
  list.forEach(v => {
    v.fills.forEach(x => { const m = months.find(y => y.k === x.date.slice(0, 7)); if (m) m.f += x.total; });
    v.expenses.forEach(x => { const m = months.find(y => y.k === x.date.slice(0, 7)); if (m) m.o += x.amount; });
  });
  const MI = 'GFMAMGLASOND', mx = Math.max(1, ...months.map(m => m.f + m.o));
  const W = 360, H = 170, L = 6, R = 6, T = 22, B = 22, bw = (W - L - R) / 12;
  let g = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="svgc" role="img" aria-label="Spesa mese per mese"><text x="' + L + '" y="12" class="ax">fino a ' + fmtN(mx, 0) + ' € al mese</text>';
  months.forEach((m, i) => {
    const x = L + i * bw + 3, w = bw - 6, hf = m.f / mx * (H - T - B), ho = m.o / mx * (H - T - B), y0 = H - B;
    if (m.f > 0) g += '<rect x="' + x.toFixed(1) + '" y="' + (y0 - hf).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + hf.toFixed(1) + '" rx="2" fill="var(--accent)"/>';
    if (m.o > 0) g += '<rect x="' + x.toFixed(1) + '" y="' + (y0 - hf - ho).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + ho.toFixed(1) + '" rx="2" fill="var(--warn)"/>';
    g += '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle" class="ax">' + MI[m.m] + '</text>';
  });
  $('stMonths').innerHTML = g + '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '" stroke="var(--line)"/></svg><p class="legend"><i style="background:var(--accent)"></i>Carburante <i style="background:var(--warn)"></i>Altre spese</p>';
  // ripartizione
  const parts = []; if (fuel > 0) parts.push(['carburante', 'Carburante', fuel]);
  CATS.forEach(([k, nm]) => { const a = S.reduce((s2, x) => s2 + (x.cats[k] || 0), 0); if (a > 0) parts.push([k, nm, a]); });
  parts.sort((a, b) => b[2] - a[2]);
  $('stBreak').innerHTML = parts.length ? parts.map(([k, nm, a]) => '<div class="bar"><div class="bl"><span>' + esc(nm) + '</span><b class="num">' + fmtN(a, 2) + ' € · ' + fmtN(a / total * 100, 0) + '%</b></div><div class="bt"><i style="width:' + Math.max(2, a / total * 100).toFixed(1) + '%;background:' + CATCOL[k] + '"></i></div></div>').join('') : '<p class="hint">Nessuna spesa nel periodo scelto.</p>';
  // consumo nel tempo: una linea per mezzo
  const ser = S.map(x => ({ name: vName(x.v), col: VCOL[D.vehicles.indexOf(x.v) % VCOL.length], pts: x.pts })).filter(x => x.pts.length);
  const all = ser.reduce((a, x) => a.concat(x.pts), []);
  if (all.length < 2 || !ser.some(x => x.pts.length > 1)) $('stCons').innerHTML = '<p class="hint">Servono almeno due consumi calcolati (tre pieni completi) nel periodo per vedere l\'andamento.</p>';
  else {
    const cs = all.map(p => p.c), lo = Math.min(...cs), hi = Math.max(...cs), pad2 = (hi - lo) * .2 || 0.5, y0 = lo - pad2, y1 = hi + pad2;
    const ts = all.map(p => new Date(p.d + 'T12:00:00').getTime()), t0 = Math.min(...ts), t1 = Math.max(...ts);
    const W2 = 360, H2 = 150, L2 = 8, R2 = 8, T2 = 18, B2 = 22;
    const X = d => L2 + (t1 === t0 ? .5 : (new Date(d + 'T12:00:00').getTime() - t0) / (t1 - t0)) * (W2 - L2 - R2), Y = c => T2 + (1 - (c - y0) / (y1 - y0)) * (H2 - T2 - B2);
    let g2 = '<svg viewBox="0 0 ' + W2 + ' ' + H2 + '" class="svgc" role="img" aria-label="Consumo nel tempo"><text x="' + L2 + '" y="11" class="ax">l/100 km: da ' + fmtN(lo, 1) + ' a ' + fmtN(hi, 1) + '</text>';
    ser.forEach(x => {
      if (x.pts.length > 1) g2 += '<polyline points="' + x.pts.map(p => X(p.d).toFixed(1) + ',' + Y(p.c).toFixed(1)).join(' ') + '" fill="none" stroke="' + x.col + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
      x.pts.forEach(p => { g2 += '<circle cx="' + X(p.d).toFixed(1) + '" cy="' + Y(p.c).toFixed(1) + '" r="3.2" fill="' + x.col + '"/>'; });
    });
    const d0 = new Date(t0), d1 = new Date(t1);
    g2 += '<text x="' + L2 + '" y="' + (H2 - 6) + '" class="ax">' + fmtDate(iso(d0)).slice(0, 5) + '</text><text x="' + (W2 - R2) + '" y="' + (H2 - 6) + '" text-anchor="end" class="ax">' + fmtDate(iso(d1)).slice(0, 5) + '</text></svg>';
    $('stCons').innerHTML = g2 + (ser.length > 1 ? '<p class="legend">' + ser.map(x => '<i style="background:' + x.col + '"></i>' + esc(x.name)).join(' ') + '</p>' : '');
  }
  $('stNote').textContent = 'Il costo al km usa i chilometri tra il primo e l\'ultimo rifornimento o spesa con chilometri nel periodo' + (multi ? ', mezzo per mezzo, e poi li somma' : '') + '. Le statistiche si aggiornano da sole con quello che registri.';
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
    if (e.target.value === '*') { STALL = true; renderStat(); return; }
    STALL = false; D.active = e.target.value; save(); route();
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
  $('expForm').addEventListener('submit', saveExp);
  $('btnExpCancel').addEventListener('click', () => { resetExp(); });
  $('expList').addEventListener('click', expAction);
  $('stPeriod').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; STP = b.dataset.p; renderStat(); });
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
    const k = b.closest('.dl-card').dataset.k, v = cur(), dl = v.dl[k], act = b.dataset.act, msg = $('scadMsg');
    msg.textContent = '';
    if (act === 'renew') { renewK = k; renderScad(); const i = $('rAmt'); if (i) i.focus(); return; }
    if (act === 'renew-cancel') { renewK = null; renderScad(); return; }
    if (act === 'renew-save' || act === 'renew-skip') {
      let amt = null;
      if (act === 'renew-save') {
        amt = parseFloat($('rAmt').value);
        if (!(amt > 0 && amt <= 100000)) { msg.className = 'msg err'; msg.textContent = 'Scrivi l\'importo pagato, oppure scegli «Rinnova senza spesa».'; return; }
      }
      const d = daysLeft(dl.date);
      dl.date = addMonths(dl.date && d != null && d > -400 ? dl.date : '', dl.every);
      // se la data è rimasta nel passato (rinnovo in ritardo di più periodi) riparte da oggi
      if (daysLeft(dl.date) < 0) dl.date = addMonths('', dl.every);
      const label = TYPES.find(t => t[0] === k)[1];
      if (amt != null) {
        v.expenses.push({ id: uid(), date: iso(new Date()), amount: Math.round(amt * 100) / 100, cat: RENEWCAT[k], km: v.km == null ? null : v.km, note: 'Rinnovo ' + label.toLowerCase() });
        msg.className = 'msg'; msg.textContent = label + ': nuova scadenza il ' + fmtDate(dl.date) + '. Spesa di ' + fmtN(amt, 2) + ' € registrata in «Spese dell\'auto».';
      } else { msg.className = 'msg'; msg.textContent = label + ': nuova scadenza il ' + fmtDate(dl.date) + '.'; }
      renewK = null; save(); renderScad(); return;
    }
    if (act === 'clear') dl.date = '';
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
