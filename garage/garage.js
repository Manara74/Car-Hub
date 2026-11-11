(function () {
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEY = 'gg.data';

/* ---------- dati: pronti per più veicoli, mostrati uno alla volta ---------- */
const TYPES = [
  ['bollo', 'Bollo', 12], ['assicurazione', 'Assicurazione', 12], ['revisione', 'Revisione', 24], ['tagliando', 'Tagliando', 12], ['gomme', 'Cambio gomme', 6]
];
let renewK = null;
const RENEWCAT = { bollo: 'bollo', assicurazione: 'assicurazione', revisione: 'revisione', tagliando: 'manutenzione', gomme: 'gomme' };
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
let stradaT = 0;
const VIEWS = { menu: 'vMenu', scadenze: 'vScad', diario: 'vDiario', spese: 'vSpese', statistiche: 'vStat', mezzi: 'vMezzi', backup: 'vBackup', strada: 'vStrada' };
const TITLES = { menu: 'Car Hub', scadenze: 'Scadenze auto', diario: 'Diario rifornimenti', spese: 'Spese dell\'auto', statistiche: 'Statistiche', mezzi: 'I miei mezzi', backup: 'Backup', strada: 'In strada' };
function route() {
  renewK = null; clearInterval(stradaT); stradaT = 0;
  const h = (location.hash || '#menu').slice(1);
  const v = VIEWS[h] ? h : 'menu';
  Object.keys(VIEWS).forEach(k => { $(VIEWS[k]).hidden = k !== v; });
  $('ggTitle').textContent = TITLES[v]; $('btnBack').hidden = v === 'menu'; $('btnOpz').hidden = v !== 'menu';
  if (v === 'menu') renderMenu(); if (v === 'scadenze') renderScad(); if (v === 'diario') renderDiario(true); if (v === 'mezzi') renderMezzi(); if (v === 'spese') renderSpese(true); if (v === 'statistiche') renderStat(); if (v === 'strada') { renderStrada(); tPriceTouched = false; tripInit(); stradaT = setInterval(renderSosta, 1000); }
  window.scrollTo(0, 0);
}
function renderMenu() {
  const al = alerts(), b = $('scadBadge');
  b.hidden = !al.length; b.textContent = String(al.length); b.classList.toggle('warn', !al.some(x => x.c === 'late'));
  const m = $('menuAlert');
  m.hidden = !al.length;
  m.innerHTML = al.length ? '<b>' + (al.length === 1 ? '1 scadenza da controllare' : al.length + ' scadenze da controllare') + ':</b> ' + esc(al.slice(0, 2).map(x => cap(x.t)).join(' · ')) + (al.length > 2 ? '…' : '') : '';
  const vs = D.vehicles, nb = vs.reduce((a, x) => a + Object.keys(x.parts || {}).filter(k => x.parts[k].buy).length, 0);
  $('mezziSub').textContent = (vs.length === 1 ? vName(vs[0]) : vs.length + ' mezzi: ' + vs.map(vName).join(', ')) + (nb ? ' · ' + nb + ' da comprare' : '');
  const lf = cur().fills.slice().sort((a, b) => a.date.localeCompare(b.date) || a.km - b.km), st = fillStats(cur());
  $('diaSub').textContent = !lf.length ? 'Litri, spesa e consumi reali' : st.avg != null ? 'Consumo medio ' + fmtN(st.avg, 1) + ' l/100 km' : lf.length + (lf.length === 1 ? ' rifornimento registrato' : ' rifornimenti registrati');
  const cv = cur(), mk = iso(new Date()).slice(0, 7);
  const mm = cv.expenses.filter(x => x.date.slice(0, 7) === mk).reduce((a, x) => a + x.amount, 0);
  $('spesaSub').textContent = cv.expenses.length ? 'Questo mese ' + fmtN(mm, 2) + ' € (carburante escluso)' : 'Manutenzione, gomme, pedaggi, multe';
  const tot12 = periodTotals(cv, 365);
  $('statSub').textContent = tot12.total > 0 ? 'Ultimi 12 mesi: ' + fmtN(tot12.total, 0) + ' € in tutto' : 'Quanto spendi, consumi, costo al km';
  $('stradaSub').textContent = stradaSub(cur());
  $('scadSub').textContent = al.length ? cap(al[0].t) : 'Bollo, assicurazione, revisione, tagliando, gomme';
}
function renderScad() {
  const v = cur(); renderVbars();
  const al = alerts();
  $('scadSum').textContent = al.length ? (al.length === 1 ? '1 scadenza da controllare: ' : al.length + ' scadenze da controllare: ') + al.slice(0, 3).map(x => cap(x.t)).join(' · ') + '.' : 'Nessuna scadenza nei prossimi 30 giorni.';
  const ks = kmStatus(v);
  $('dlList').innerHTML = TYPES.map(([k, label]) => {
    const dl = v.dl[k], d = daysLeft(dl.date), st = status(d);
    const cost = lastCost(v, k);
    const km = k === 'tagliando' && ks ? '<p class="kmline ' + ks.c + '">' + esc(ks.t) + '</p>' : '';
    return '<div class="dl-card ' + st.c + '" data-k="' + k + '"><div class="dl-top"><b>' + label + '</b><span class="dl-st ' + st.c + '">' + esc(st.t) + '</span></div>' +
      '<div class="grid"><div class="field"><span>Prossima scadenza</span><input type="date" data-f="date" value="' + esc(dl.date) + '"></div>' +
      '<div class="field"><span>Si ripete ogni</span><select data-f="every">' + EVERY.map(([n, t]) => '<option value="' + n + '"' + (n === dl.every ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div>' +
      (k === 'tagliando' ? '<div class="field"><span>Km attuali</span><input type="number" inputmode="numeric" min="0" step="1" data-f="vkm" placeholder="Es. 84500" value="' + (v.km == null ? '' : v.km) + '"></div><div class="field"><span>Tagliando ai km</span><input type="number" inputmode="numeric" min="0" step="1" data-f="kmDue" placeholder="Es. 90000" value="' + (dl.kmDue == null ? '' : dl.kmDue) + '"></div>' : '') +
      '<div class="field wide"><span>Nota (facoltativa)</span><input type="text" data-f="note" maxlength="80" placeholder="' + (k === 'assicurazione' ? 'Compagnia, numero polizza' : k === 'bollo' ? 'Regione, importo' : k === 'gomme' ? 'Es. Invernali, dal gommista' : 'Officina, cosa fare') + '" value="' + esc(dl.note) + '" autocomplete="off"></div></div>' +
      km + cost + (renewK === k
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
  document.querySelectorAll('[data-info]').forEach(i => { if (document.activeElement !== i) i.value = (v.info || {})[i.dataset.info] || ''; });
  document.querySelectorAll('[data-phone]').forEach(i => { if (document.activeElement !== i) i.value = (v.phones || {})[i.dataset.phone] || ''; });
  document.querySelectorAll('#vType button').forEach(b => b.classList.toggle('on', b.dataset.t === v.type));
  renderParts();
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
  const mk = $('fMkt'), a = mktAvg($('fFuel').value, 1, $('fDate').value || iso(new Date())), ex = fSt && fSt.price ? 'Prezzo esposto dal distributore: ' + fmtN(fSt.price, 3) + ' €/L' : '';
  if (!a) { mk.textContent = ex; return; }
  let txt = 'Media self ' + FN[$('fFuel').value].toLowerCase() + ' in ' + a.where + ' il ' + fmtDate(a.d).slice(0, 5) + ': ' + fmtN(a.v, 3) + ' €/L';
  if (l > 0 && t > 0) { const df = (t / l - a.v) * 100; txt += Math.abs(df) < 0.5 ? ' · sei in linea con il mercato.' : ' · stai pagando ' + fmtN(Math.abs(df), 1) + ' cent/L ' + (df > 0 ? 'in più.' : 'in meno.'); }
  mk.textContent = txt + (ex ? ' · ' + ex : '');
}
function applyPrefill() {
  let p = null; try { p = JSON.parse(localStorage.getItem('gg.prefill') || 'null'); localStorage.removeItem('gg.prefill'); } catch (e) { /* niente */ }
  if (!p || !p.id || Date.now() - p.t > 30 * 60000) return;
  fSt = { id: p.id, name: p.name, price: p.price }; if (['B', 'D', 'G', 'M'].includes(p.fuel)) $('fFuel').value = p.fuel;
  renderStChip(); fillPrice(); $('fillMsg').className = 'msg'; $('fillMsg').textContent = 'Distributore e carburante compilati da Pompa Giusta: scrivi litri, importo e chilometri.';
}
function resetForm(keepMsg) {
  const v = cur(), last = v.fills.slice().sort(byDate).pop();
  fSt = null; renderStChip(); editId = null; $('fillTitle').textContent = 'Nuovo rifornimento'; $('btnFill').textContent = 'Salva il rifornimento'; $('btnFillCancel').hidden = true;
  $('fDate').value = iso(new Date()); $('fKm').value = ''; $('fL').value = ''; $('fTot').value = ''; $('fNote').value = ''; $('fFull').checked = true;
  $('fFuel').value = last ? last.fuel : 'B'; $('fKm').placeholder = last ? 'Ultimo: ' + fmtN(last.km, 0) : 'Contachilometri';
  if (!keepMsg) $('fillMsg').textContent = '';
  fillPrice();
}
function renderDiario(reset) {
  renderVbars(); loadMarket();
  if (reset) { resetForm(); applyPrefill(); }
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
    return '<div class="fill" data-id="' + esc(x.id) + '"><div class="ft"><b>' + fmtDate(x.date) + '</b><span>' + esc(FUELN[x.fuel] || x.fuel) + (x.note ? ' · ' + esc(x.note) : '') + '</span></div>' + (x.sn ? '<div class="fk">' + esc(x.sn) + '</div>' : '') +
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
  if (fSt) { rec.sid = fSt.id; rec.sn = fSt.name; }
  if (editId) v.fills = v.fills.map(x => x.id === editId ? rec : x); else v.fills.push(rec);
  if (v.km == null || km > v.km) v.km = km;
  save(); resetForm(true); m.className = 'msg'; m.textContent = 'Rifornimento salvato.'; renderDiario(false);
}

/* ---------- finestra di conferma per eliminare ---------- */
let delFn = null;
function askDel(title, text, fn) {
  delFn = fn; $('dlgDelT').textContent = title; $('dlgDelP').textContent = text; $('dlgDel').hidden = false;
}

function fillAction(e) {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const id = b.closest('.fill').dataset.id, v = cur();
  if (b.dataset.act === 'edit') {
    const x = v.fills.find(y => y.id === id); if (!x) return;
    editId = id; $('fillTitle').textContent = 'Modifica rifornimento'; $('btnFill').textContent = 'Salva le modifiche'; $('btnFillCancel').hidden = false;
    $('fDate').value = x.date; $('fKm').value = x.km; $('fL').value = x.liters; $('fTot').value = x.total; $('fFuel').value = x.fuel; $('fNote').value = x.note || ''; $('fFull').checked = !!x.full; fSt = x.sid || x.sn ? { id: x.sid || '', name: x.sn || '' } : null; renderStChip();
    $('fillMsg').textContent = ''; fillPrice(); $('fillForm').scrollIntoView({ block: 'start' });
  } else if (b.dataset.act === 'del') {
    askDel('Eliminare questo rifornimento?', 'Il rifornimento verrà eliminato dal diario. Non si può annullare.',
      () => { v.fills = v.fills.filter(x => x.id !== id); save(); resetForm(); renderDiario(false); });
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
function expAction(e) {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const id = b.closest('.fill').dataset.id, v = cur();
  if (b.dataset.act === 'edit') {
    const x = v.expenses.find(y => y.id === id); if (!x) return;
    expEdit = id; $('expTitle').textContent = 'Modifica spesa'; $('btnExp').textContent = 'Salva le modifiche'; $('btnExpCancel').hidden = false;
    $('eDate').value = x.date; $('eAmt').value = x.amount; $('eCat').value = x.cat; $('eKm').value = x.km == null ? '' : x.km; $('eNote').value = x.note || '';
    $('expMsg').textContent = ''; $('expForm').scrollIntoView({ block: 'start' });
  } else if (b.dataset.act === 'del') {
    askDel('Eliminare questa spesa?', 'La spesa verrà eliminata. Non si può annullare.',
      () => { v.expenses = v.expenses.filter(x => x.id !== id); save(); resetExp(); renderSpese(false); });
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
  CTX = { list, from }; renderCost(list, from); renderStationStats(list, from); loadMarket(); renderMarket(list); renderSpunti(list);
  $('stNote').textContent = 'Il costo al km usa i chilometri tra il primo e l\'ultimo rifornimento o spesa con chilometri nel periodo' + (multi ? ', mezzo per mezzo, e poi li somma' : '') + '. Le statistiche si aggiornano da sole con quello che registri.';
}


/* ---------- in strada: parcheggio, sosta, emergenza ---------- */
const hhmm = ms => new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
function leftTxt(ms) {
  const s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
  return h ? h + ' h ' + pad(m) + ' min' : m ? m + ' min ' + pad(s % 60) + ' s' : s + ' s';
}
function stradaSub(v) {
  if (v.sosta && v.sosta > Date.now()) return 'Sosta: scade alle ' + hhmm(v.sosta);
  if (v.park) return 'Parcheggiata alle ' + hhmm(v.park.at);
  return 'Parcheggio, sosta, emergenza, costo del viaggio';
}
function parkWhen(at) {
  const d = new Date(at), same = iso(d) === iso(new Date());
  return (same ? 'oggi' : 'il ' + fmtDate(iso(d))) + ' alle ' + hhmm(at);
}
function renderStrada() {
  renderVbars();
  const v = cur(), p = v.park;
  $('parkSt').textContent = p ? 'Posizione salvata ' + parkWhen(p.at) + (p.acc ? ' (precisione circa ' + Math.round(p.acc) + ' m)' : '') + '.' : 'Nessuna posizione salvata per questo mezzo.';
  if (document.activeElement !== $('parkNote')) $('parkNote').value = p ? p.note || '' : '';
  $('btnPark').textContent = p ? 'Aggiorna la posizione' : 'Salva la posizione qui';
  const go = $('btnGoCar'); go.hidden = !p;
  if (p) go.href = 'https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=' + p.lat + ',' + p.lng;
  $('parkMore').hidden = !p;
  const ph = $('parkPhoto'); ph.hidden = !(p && p.photo); if (p && p.photo) ph.src = p.photo;
  renderSosta();
  const pn = v.phones || {}, box = $('emPhones'), tel = s => String(s).replace(/[^\d+]/g, '');
  box.innerHTML = [['assist', 'Assistenza stradale'], ['assic', 'Assicurazione']].map(([k, t]) => pn[k] && tel(pn[k]) ?
    '<a class="btn ghost" href="tel:' + esc(tel(pn[k])) + '">' + t + '</a>' : '').join('') +
    (pn.assist && pn.assic ? '' : '<a class="btn small ghost" href="#mezzi">Aggiungi i tuoi numeri</a>');
}
function renderSosta() {
  const v = cur(), st = $('sostaSt'), on = v.sosta && v.sosta > Date.now();
  if (v.sosta && !on) { st.textContent = 'Sosta scaduta alle ' + hhmm(v.sosta) + '.'; st.className = 'verdict'; }
  else if (on) { st.textContent = 'Scade alle ' + hhmm(v.sosta) + ': mancano ' + leftTxt(v.sosta - Date.now()) + '.'; }
  else { st.textContent = 'Nessun timer attivo.'; }
  $('btnSostaOff').hidden = !v.sosta;
}
function getPos(ok, ko) {
  if (!navigator.geolocation) { ko('Questo telefono non fornisce la posizione.'); return; }
  navigator.geolocation.getCurrentPosition(ok, e => ko(e && e.code === 1 ? 'Non ho il permesso di leggere la posizione: consentilo nelle impostazioni del browser.' : 'Non riesco a trovare la posizione. Riprova all\'aperto.'), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
}
function parkSave() {
  const m = $('parkMsg'), b = $('btnPark'); m.className = 'msg'; m.textContent = 'Cerco la posizione…'; b.disabled = true;
  getPos(pos => {
    const v = cur(), old = v.park || {};
    v.park = { lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lng: Math.round(pos.coords.longitude * 1e6) / 1e6, acc: pos.coords.accuracy, at: Date.now(), note: $('parkNote').value.trim(), photo: old.photo || null };
    save(); b.disabled = false; m.textContent = 'Posizione salvata.'; renderStrada();
  }, t => { b.disabled = false; m.className = 'msg err'; m.textContent = t; });
}
function shrink(file, cb) {
  const img = new Image(), u = URL.createObjectURL(file);
  img.onload = () => {
    const s = Math.min(1, 900 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(u); cb(c.toDataURL('image/jpeg', 0.6));
  };
  img.onerror = () => { URL.revokeObjectURL(u); cb(null); };
  img.src = u;
}
function shareLoc() {
  const m = $('emMsg'); m.className = 'msg'; m.textContent = 'Cerco la posizione…';
  getPos(pos => {
    const url = 'https://maps.google.com/?q=' + pos.coords.latitude.toFixed(6) + ',' + pos.coords.longitude.toFixed(6), text = 'Mi trovo qui: ' + url;
    if (navigator.share) { navigator.share({ text }).then(() => { m.textContent = ''; }, () => { m.textContent = ''; }); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => { m.textContent = 'Posizione copiata: incollala in un messaggio.'; }, () => { m.textContent = text; });
    else m.textContent = text;
  }, t => { m.className = 'msg err'; m.textContent = t; });
}


/* ---------- costo del viaggio ---------- */
const numv = id => { const n = parseFloat(String($(id).value).replace(',', '.')); return n >= 0 ? n : NaN; };
function tripInit() {
  const v = cur(), st = fillStats(v), last = st.sorted.filter(x => x.liters > 0).pop();
  loadMarket();
  const a = last ? mktAvg(last.fuel, 1, iso(new Date())) : null;
  $('tCons').value = st.avg != null ? (Math.round(st.avg * 10) / 10) : '';
  if (!tPriceTouched) $('tPrice').value = a ? Math.round(a.v * 1000) / 1000 : last ? (Math.round(last.total / last.liters * 1000) / 1000) : '';
  const bits = [];
  if (st.avg != null) bits.push('il consumo medio è quello del tuo diario');
  if (a) bits.push('il prezzo è la media self di oggi in ' + a.where + (last ? ' (il tuo ultimo pieno: ' + fmtN(last.total / last.liters, 3) + ' €/L)' : ''));
  else if (last) bits.push('il prezzo è quello del tuo ultimo rifornimento');
  $('tHint').textContent = bits.length ? 'Compilati in automatico: ' + bits.join('; ') + '. Puoi cambiarli.' : 'Scrivi il consumo e il prezzo del carburante. Con qualche rifornimento nel diario li compilo io.';
  tripCalc();
}
function tripCalc() {
  const km = numv('tKm'), c = numv('tCons'), p = numv('tPrice'), toll = numv('tToll') || 0, n = Math.max(1, Math.min(9, parseInt($('tPers').value, 10) || 1));
  const out = $('tOut');
  if (!(km > 0) || !(c > 0) || !(p > 0)) { out.hidden = true; return; }
  const d = km * ($('tRound').checked ? 2 : 1), L = d * c / 100, fuel = L * p, tot = fuel + toll;
  out.hidden = false;
  out.innerHTML = '<div><small>CARBURANTE</small><b>' + fmtN(fuel, 2) + ' €</b><em>' + fmtN(L, 1) + ' litri su ' + fmtN(d, 0) + ' km</em></div>' +
    '<div><small>TOTALE</small><b>' + fmtN(tot, 2) + ' €</b><em>' + (toll > 0 ? 'con pedaggi e parcheggi' : 'senza pedaggi') + '</em></div>' +
    (n > 1 ? '<div class="wide2"><small>A PERSONA (' + n + ')</small><b>' + fmtN(tot / n, 2) + ' €</b></div>' : '');
}


/* ---------- prezzi di mercato contro i tuoi rifornimenti ---------- */
let HIST = null, PROVL = null, MKF = '', MKM = 1, tPriceTouched = false;
const FN = { B: 'Benzina', D: 'Gasolio', G: 'GPL', M: 'Metano' };
function loadMarket() {
  if (HIST) return;
  HIST = {}; PROVL = [];
  fetch('data/history.json').then(r => r.json()).then(j => { HIST = j || {}; }, () => {})
    .then(() => fetch('province.json')).then(r => r.json()).then(j => { PROVL = j || []; }, () => {})
    .then(afterMarketLoad);
}
function myRegion() {
  let prov = ''; try { prov = (JSON.parse(localStorage.getItem('pg.prefs') || '{}')).prov || ''; } catch (e) { /* niente */ }
  const r = PROVL.find(x => x[0] === prov); return r ? r[2] : 'ALL';
}
function mktAvg(fuel, mode, date) {
  const days = Object.keys(HIST || {}).sort(), key = fuel + mode, region = myRegion(); let dd = null;
  for (const d of days) { if (d <= date && HIST[d][key]) dd = d; }
  if (!dd) return null;
  const r = HIST[dd][key][region] != null ? region : 'ALL';
  return { v: HIST[dd][key][r], d: dd, where: r === 'ALL' ? 'Italia' : r };
}
function afterMarketLoad() {
  if (!$('vStat').hidden) { renderMarket(); renderSpunti(STALL && D.vehicles.length > 1 ? D.vehicles : [cur()]); }
  if (!$('vDiario').hidden) fillPrice();
  if (!$('vStrada').hidden && !tPriceTouched) tripInit();
}
function renderMarket(list) {
  list = list || (STALL && D.vehicles.length > 1 ? D.vehicles : [cur()]);
  const box = $('stMkt'), days = Object.keys(HIST || {}).sort();
  if (!days.length) { box.hidden = true; return; }
  box.hidden = false;
  const fills = [].concat(...list.map(v => v.fills));
  const cnt = {}; fills.forEach(x => { cnt[x.fuel] = (cnt[x.fuel] || 0) + 1; });
  const present = Object.keys(FN).filter(c => days.some(d => HIST[d][c + '1'] || HIST[d][c + '0']));
  if (!MKF || !present.includes(MKF)) MKF = present.sort((a, b) => (cnt[b] || 0) - (cnt[a] || 0))[0];
  $('mkF').innerHTML = present.map(c => '<option value="' + c + '"' + (c === MKF ? ' selected' : '') + '>' + FN[c] + '</option>').join('');
  document.querySelectorAll('#mkM button').forEach(b => b.classList.toggle('on', +b.dataset.m === MKM));
  const key = MKF + MKM, region = myRegion(), from = fromDate(STP);
  const ds = days.filter(d => d >= from && HIST[d][key] && (HIST[d][key][region] != null || HIST[d][key].ALL != null));
  const val = d => HIST[d][key][region] != null ? HIST[d][key][region] : HIST[d][key].ALL;
  const rname = region === 'ALL' || HIST[ds[0] || days[0]][key] && HIST[ds[0] || days[0]][key][region] == null ? 'Italia' : region;
  if (ds.length < 2) { $('mkChart').innerHTML = '<p class="hint">Servono almeno due giorni di prezzi per questo carburante nel periodo scelto.</p>'; $('mkCards').innerHTML = ''; $('mkNote').textContent = ''; return; }
  const my = fills.filter(x => x.fuel === MKF && x.liters > 0 && x.total > 0).map(x => {
    let dd = null; for (const d of ds) { if (d <= x.date) dd = d; else break; }
    return { d: x.date, md: dd, p: x.total / x.liters, l: x.liters, m: dd ? val(dd) : null };
  }).filter(x => x.d >= ds[0] && x.d <= ds[ds.length - 1] && x.m != null);
  const vals = ds.map(val).concat(my.map(x => x.p)), lo0 = Math.min(...vals), hi0 = Math.max(...vals), pd = Math.max(0.01, (hi0 - lo0) * .2), lo = lo0 - pd, hi = hi0 + pd;
  const W = 360, H = 180, L = 8, R = 8, T = 16, B = 24, t0 = new Date(ds[0] + 'T12:00:00').getTime(), t1 = new Date(ds[ds.length - 1] + 'T12:00:00').getTime();
  const X = d => L + (new Date(d + 'T12:00:00').getTime() - t0) / (t1 - t0) * (W - L - R), Y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="svgc" role="img" aria-label="Prezzo di mercato e rifornimenti"><text x="' + L + '" y="11" class="ax">€/litro: da ' + fmtN(lo0, 3) + ' a ' + fmtN(hi0, 3) + '</text>';
  s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '" stroke="var(--line)"/>';
  s += '<polyline points="' + ds.map(d => X(d).toFixed(1) + ',' + Y(val(d)).toFixed(1)).join(' ') + '" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>';
  my.forEach(x => { s += '<circle cx="' + X(x.d).toFixed(1) + '" cy="' + Y(x.p).toFixed(1) + '" r="4.5" fill="' + (x.p <= x.m + 0.0005 ? 'var(--good)' : 'var(--bad)') + '" stroke="var(--bg)" stroke-width="1.5"/>'; });
  s += '<text x="' + L + '" y="' + (H - 7) + '" class="ax">' + fmtDate(ds[0]).slice(0, 5) + '</text><text x="' + (W - R) + '" y="' + (H - 7) + '" text-anchor="end" class="ax">' + fmtDate(ds[ds.length - 1]).slice(0, 5) + '</text></svg>';
  $('mkChart').innerHTML = s + '<p class="legend"><i style="background:var(--accent)"></i>Media ' + esc(rname) + ' <i style="background:var(--good)"></i>hai pagato meno <i style="background:var(--bad)"></i>hai pagato più</p>';
  const first = val(ds[0]), last = val(ds[ds.length - 1]), dv = last - first;
  const cell = (k, v, sub) => '<div><small>' + k + '</small><b class="num">' + v + '</b>' + (sub ? '<em>' + sub + '</em>' : '') + '</div>';
  let c = cell('Oggi', fmtN(last, 3) + ' €/L', esc(rname)) + cell('Nel periodo', (dv >= 0 ? '+' : '−') + fmtN(Math.abs(dv), 3) + ' €', fmtN(Math.abs(dv / first * 100), 1) + '% ' + (dv >= 0 ? 'in più' : 'in meno') + ' dal ' + fmtDate(ds[0]).slice(0, 5));
  c += cell('Minimo', fmtN(Math.min(...ds.map(val)), 3) + ' €/L', 'massimo ' + fmtN(Math.max(...ds.map(val)), 3));
  if (my.length) {
    const L2 = my.reduce((a, x) => a + x.l, 0), diff = my.reduce((a, x) => a + (x.p - x.m) * x.l, 0) / L2, tot = my.reduce((a, x) => a + (x.p - x.m) * x.l, 0);
    c += cell('Tu rispetto al mercato', (diff > 0 ? '+' : '−') + fmtN(Math.abs(diff) * 100, 1) + ' cent/L', diff > 0 ? 'hai pagato più della media' : 'hai pagato meno della media');
    c += '<div class="wide2"><small>IN EURO, SU ' + plural(my.length, 'RIFORNIMENTO', 'RIFORNIMENTI') + '</small><b class="num">' + (tot > 0 ? '+' : '−') + fmtN(Math.abs(tot), 2) + ' €</b><em>' + (tot > 0 ? 'spesi in più' : 'risparmiati') + ' rispetto alla media di ' + esc(rname) + '</em></div>';
  }
  $('mkCards').innerHTML = c;
  $('mkNote').textContent = (my.length ? '' : 'Registra rifornimenti di questo carburante nel diario per confrontarli con il mercato. ') + 'La media è di ' + rname + (rname === 'Italia' && region === 'ALL' ? ' (scegli la zona in Pompa Giusta per vedere la tua regione)' : '') + ', esclude gli impianti autostradali e la modalità è quella scelta qui sopra. Lo storico parte dal ' + fmtDate(days[0]) + '.';
}


/* ---------- il quadro dei costi ---------- */
const FIXED = ['bollo', 'assicurazione', 'revisione'];
const dayDiff = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
function sumRange(list, a, b) { // a incluso, b escluso
  let fx = 0, va = 0;
  list.forEach(v => {
    v.fills.forEach(x => { if (x.date >= a && x.date < b) va += x.total; });
    v.expenses.forEach(x => { if (x.date >= a && x.date < b) { if (FIXED.includes(x.cat)) fx += x.amount; else va += x.amount; } });
  });
  return { fx, va, t: fx + va };
}
function renderCost(list, from) {
  const today = iso(new Date()), tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return iso(d); })();
  const dates = [].concat(...list.map(v => v.fills.map(x => x.date).concat(v.expenses.map(x => x.date)))).sort();
  const start = dates.length && dates[0] > from ? dates[0] : from;
  const days = Math.max(1, dayDiff(start, today) + 1), cur2 = sumRange(list, start, tomorrow);
  const cell = (k, v, sub) => '<div><small>' + k + '</small><b class="num">' + v + '</b>' + (sub ? '<em>' + sub + '</em>' : '') + '</div>';
  const perMonth = cur2.t / days * 30.44;
  let c = cell('Al mese', fmtN(perMonth, 0) + ' €', 'media del periodo') + cell('Al giorno', fmtN(cur2.t / days, 2) + ' €', plural(days, 'giorno', 'giorni') + ' considerati');
  c += cell('In un anno', fmtN(perMonth * 12, 0) + ' €', days < 180 ? 'indicativo: ancora pochi mesi di dati' : 'se continui così');
  if (STP !== 'all') {
    const p0 = new Date(from + 'T12:00:00'); p0.setDate(p0.getDate() - parseInt(STP, 10));
    const prev = sumRange(list, iso(p0), from), dl = prev.t > 0 ? (cur2.t - prev.t) / prev.t * 100 : null;
    c += dl == null ? cell('Periodo precedente', '—', 'nessun dato prima') : cell('Rispetto a prima', (dl >= 0 ? '+' : '−') + fmtN(Math.abs(dl), 0) + '%', 'prima: ' + fmtN(prev.t, 0) + ' €');
  } else c += cell('Totale', fmtN(cur2.t, 0) + ' €', 'dall\'inizio');
  // mese più caro (su tutto lo storico)
  const mm = {}; list.forEach(v => { v.fills.forEach(x => { mm[x.date.slice(0, 7)] = (mm[x.date.slice(0, 7)] || 0) + x.total; }); v.expenses.forEach(x => { mm[x.date.slice(0, 7)] = (mm[x.date.slice(0, 7)] || 0) + x.amount; }); });
  const mk = Object.keys(mm).filter(k => k + '-31' >= start).sort((a, b) => mm[b] - mm[a])[0];
  if (mk) { const nm = new Date(mk + '-15T12:00:00').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }); c += cell('Mese più caro', fmtN(mm[mk], 0) + ' €', cap(nm)); }
  $('coCards').innerHTML = c;
  const tot = cur2.t;
  $('coSplit').innerHTML = tot > 0 ? [['Costi fissi', cur2.fx, 'bollo, assicurazione, revisione', 'var(--warn)'], ['Costi variabili', cur2.va, 'dipendono da come usi il mezzo: carburante, manutenzione, gomme, pedaggi…', 'var(--accent)']].map(([n, a, s, col]) =>
    '<div class="bar"><div class="bl"><span>' + n + '</span><b class="num">' + fmtN(a, 0) + ' € · ' + fmtN(a / tot * 100, 0) + '%</b></div><div class="bt"><i style="width:' + (a / tot * 100).toFixed(1) + '%;background:' + col + '"></i></div><small class="hint">' + s + '</small></div>').join('') : '';
  $('coNote').textContent = 'Mette insieme carburante e tutte le spese registrate (anche i rinnovi di bollo, assicurazione, revisione e gomme). Il confronto «rispetto a prima» usa un periodo lungo quanto quello scelto, subito precedente.';
}


/* ---------- spunti automatici ed esportazione ---------- */
let INS = [], CTX = null;
function renderSpunti(list) {
  const out = [], today = iso(new Date()), day = new Date().getDate(), fm = today.slice(0, 7) + '-01';
  const tom = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return iso(d); })();
  const pm = new Date(); pm.setDate(1); pm.setMonth(pm.getMonth() - 1);
  const pmFirst = iso(pm), pmEnd = (() => { const e = new Date(pm.getFullYear(), pm.getMonth(), Math.min(day, new Date(pm.getFullYear(), pm.getMonth() + 1, 0).getDate()) + 1); return iso(e) > fm ? fm : iso(e); })();
  const cm = sumRange(list, fm, tom), pv = sumRange(list, pmFirst, pmEnd);
  if (cm.t > 0 && pv.t > 0) {
    const d = (cm.t - pv.t) / pv.t * 100;
    if (Math.abs(d) >= 5) out.push([d > 0 ? 'bad' : 'good', d > 0 ? '▲' : '▼', 'Questo mese hai speso il <b>' + fmtN(Math.abs(d), 0) + '% in ' + (d > 0 ? 'più' : 'meno') + '</b> dello stesso periodo del mese scorso (' + fmtN(cm.t, 0) + ' € contro ' + fmtN(pv.t, 0) + ' €).']);
    else out.push(['', '=', 'La spesa di questo mese è in linea con quella del mese scorso (' + fmtN(cm.t, 0) + ' €).']);
  }
  if (list.length === 1) {
    const st = fillStats(list[0]), pts = st.sorted.filter(x => st.res.has(x.id)).map(x => st.res.get(x.id).cons);
    if (pts.length >= 5) {
      const rec = pts.slice(-3).reduce((a, x) => a + x, 0) / 3, old = pts.slice(0, -3).reduce((a, x) => a + x, 0) / (pts.length - 3), d = (rec - old) / old * 100;
      if (Math.abs(d) >= 5) out.push([d > 0 ? 'bad' : 'good', d > 0 ? '▲' : '▼', 'Il consumo recente è <b>' + (d > 0 ? 'salito' : 'sceso') + ' del ' + fmtN(Math.abs(d), 0) + '%</b>: ' + fmtN(rec, 1) + ' l/100 km negli ultimi tre pieni contro ' + fmtN(old, 1) + ' di prima.' + (d > 0 ? ' Controlla la pressione delle gomme.' : '')]);
    }
  }
  const fills = [].concat(...list.map(v => v.fills)), cnt = {}; fills.forEach(x => { cnt[x.fuel] = (cnt[x.fuel] || 0) + 1; });
  const fuel = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0], days = Object.keys(HIST || {}).sort();
  if (fuel && days.length > 7) {
    const key = fuel + '1', region = myRegion(), ds = days.filter(d => HIST[d][key] && (HIST[d][key][region] != null || HIST[d][key].ALL != null));
    const val = d => HIST[d][key][region] != null ? HIST[d][key][region] : HIST[d][key].ALL;
    if (ds.length > 7) {
      const last = ds[ds.length - 1], t7 = new Date(last + 'T12:00:00'); t7.setDate(t7.getDate() - 7);
      let ref = null; ds.forEach(d => { if (d <= iso(t7)) ref = d; });
      const where = HIST[last][key][region] != null ? region : 'Italia', nm = FN[fuel].toLowerCase();
      if (ref) {
        const d = (val(last) - val(ref)) * 100;
        if (Math.abs(d) >= 0.5) out.push([d > 0 ? 'bad' : 'good', d > 0 ? '▲' : '▼', 'In ' + esc(where) + ' la ' + nm + ' self è ' + (d > 0 ? '<b>salita' : '<b>scesa') + ' di ' + fmtN(Math.abs(d), 1) + ' cent</b> in una settimana (ora ' + fmtN(val(last), 3) + ' €/L).']);
      }
      if (ds.length >= 14 && val(last) <= Math.min(...ds.map(val)) + 0.0005) out.push(['good', '★', 'La ' + nm + ' in ' + esc(where) + ' è <b>ai minimi</b> da quando teniamo lo storico (dal ' + fmtDate(ds[0]).slice(0, 5) + '). Buon momento per fare il pieno.']);
    }
    const my = fills.filter(x => x.fuel === fuel && x.liters > 0).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map(x => { const a = mktAvg(fuel, 1, x.date); return a ? { p: x.total / x.liters, m: a.v, l: x.liters } : null; }).filter(Boolean);
    if (my.length >= 2) {
      const L = my.reduce((a, x) => a + x.l, 0), d = my.reduce((a, x) => a + (x.p - x.m) * x.l, 0) / L * 100;
      if (Math.abs(d) >= 0.5) out.push([d > 0 ? 'bad' : 'good', d > 0 ? '▲' : '▼', 'Negli ultimi ' + my.length + ' rifornimenti hai pagato in media <b>' + fmtN(Math.abs(d), 1) + ' cent/L ' + (d > 0 ? 'in più' : 'in meno') + '</b> della media di zona.' + (d > 0 ? ' Con Pompa Giusta puoi cercare un distributore più conveniente.' : '')]);
    }
  }
  if (STN_BEST) { const d = (STN_BEST.best.p - STN_BEST.avgRest) * 100; if (d <= -1) out.push(['good', '★', 'Il distributore <b>' + esc(STN_BEST.best.name) + '</b> ti costa in media <b>' + fmtN(-d, 1) + ' cent/L in meno</b> degli altri dove hai fatto il pieno.']); }
  const al = alerts(); if (al.length) out.push(['warn', '!', plural(al.length, 'scadenza richiede', 'scadenze richiedono') + ' attenzione: ' + esc(cap(al[0].t)) + (al.length > 1 ? ' e altre.' : '.')]);
  INS = out.map(x => x[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&'));
  $('insList').innerHTML = out.length ? out.map(([c, i, t]) => '<li class="' + c + '"><i>' + i + '</i><span>' + t + '</span></li>').join('') : '<li><i>·</i><span>Per ora non ho spunti: registra qualche rifornimento in più e ne troverai.</span></li>';
}

/* ---------- esportazione: Excel, PDF, immagine (tutto sul telefono) ---------- */
function buildReport() {
  const list = CTX.list, from = CTX.from, S = list.map(v => vehStat(v, from));
  const sum = k => S.reduce((a, x) => a + x[k], 0), fuel = sum('fuel'), other = sum('other'), total = fuel + other, lt = sum('lt'), il = sum('il'), id = sum('id'), n = sum('n');
  const ws = S.filter(x => x.span > 0), span = ws.reduce((a, x) => a + x.span, 0), sc = ws.reduce((a, x) => a + x.total, 0);
  const cards = [['Spesa totale', fmtN(total, 2) + ' €'], ['Carburante', fmtN(fuel, 2) + ' €'], ['Altre spese', fmtN(other, 2) + ' €'], ['Costo al km', span > 0 ? fmtN(sc / span, 3) + ' €' : '—'],
    ['Consumo medio', id > 0 ? fmtN(il / id * 100, 1) + ' l/100 km' : '—'], ['Prezzo medio', lt > 0 ? fmtN(fuel / lt, 3) + ' €/L' : '—'], ['Litri', lt > 0 ? fmtN(lt, 1) : '—'], ['Rifornimenti', String(n)]];
  const cats = []; if (fuel > 0) cats.push(['Carburante', fuel]);
  CATS.forEach(([k, nm]) => { const a = S.reduce((s2, x) => s2 + (x.cats[k] || 0), 0); if (a > 0) cats.push([nm, a]); });
  cats.sort((a, b) => b[1] - a[1]);
  const rows = [];
  list.forEach(v => {
    v.fills.filter(x => x.date >= from).forEach(x => rows.push({ d: x.date, v: vName(v), t: 'Rifornimento', c: FN[x.fuel] || x.fuel, a: x.total, l: x.liters, p: x.total / x.liters, km: x.km, n: x.note || '', s: x.sn || '' }));
    v.expenses.filter(x => x.date >= from).forEach(x => rows.push({ d: x.date, v: vName(v), t: 'Spesa', c: CATN[x.cat] || x.cat, a: x.amount, l: null, p: null, km: x.km, n: x.note || '' }));
  });
  rows.sort((a, b) => a.d.localeCompare(b.d));
  const per = STP === 'all' ? 'Tutto lo storico' : STP === '30' ? 'Ultimi 30 giorni' : 'Ultimi 12 mesi';
  return { title: 'Car Hub · Riepilogo', sub: list.map(vName).join(', ') + ' · ' + per + ' · ' + fmtDate(iso(new Date())), cards, cats, total, ins: INS.slice(), rows };
}
function saveBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
/* --- Excel (.xlsx scritto a mano: un archivio zip senza compressione) --- */
const CRCT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRCT[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zip(files) {
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
  const u16 = v => [v & 255, v >> 8 & 255], u32 = v => [v & 255, v >> 8 & 255, v >> 16 & 255, v >>> 24 & 255];
  files.forEach(([name, text]) => {
    const nb = enc.encode(name), db = enc.encode(text), crc = crc32(db);
    const lh = new Uint8Array([0x50, 0x4b, 3, 4, 20, 0, 0, 8, 0, 0, 0, 0, 33, 0, ...u32(crc), ...u32(db.length), ...u32(db.length), ...u16(nb.length), 0, 0]);
    parts.push(lh, nb, db);
    cen.push(new Uint8Array([0x50, 0x4b, 1, 2, 20, 0, 20, 0, 0, 8, 0, 0, 0, 0, 33, 0, ...u32(crc), ...u32(db.length), ...u32(db.length), ...u16(nb.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(off)]), nb);
    off += lh.length + nb.length + db.length;
  });
  const cl = cen.reduce((a, x) => a + x.length, 0);
  return new Blob(parts.concat(cen, [new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(cl), ...u32(off), 0, 0])]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
const xe = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const colL = i => String.fromCharCode(65 + i);
function sheetXml(rows, widths) {
  let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>' + widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols><sheetData>';
  rows.forEach((r, ri) => {
    x += '<row r="' + (ri + 1) + '">';
    r.forEach((c, ci) => {
      if (c == null || c === '') return;
      const ref = colL(ci) + (ri + 1), o = typeof c === 'object' ? c : { v: c };
      if (typeof o.v === 'number') x += '<c r="' + ref + '"' + (o.s ? ' s="' + o.s + '"' : '') + '><v>' + o.v + '</v></c>';
      else x += '<c r="' + ref + '" t="inlineStr"' + (o.s ? ' s="' + o.s + '"' : '') + '><is><t xml:space="preserve">' + xe(o.v) + '</t></is></c>';
    });
    x += '</row>';
  });
  return x + '</sheetData></worksheet>';
}
function exportXlsx(R) {
  const serial = s => Math.round((new Date(s + 'T12:00:00Z') - Date.UTC(1899, 11, 30, 12)) / 86400000);
  const B = 1, DT = 2, MO = 3, PR = 4;
  const sum = [[{ v: R.title, s: B }], [R.sub], [], [{ v: 'Voce', s: B }, { v: 'Valore', s: B }]].concat(R.cards.map(c => [c[0], c[1]]));
  sum.push([], [{ v: 'Come si divide la spesa', s: B }, { v: 'Importo (€)', s: B }, { v: '%', s: B }]);
  R.cats.forEach(c => sum.push([c[0], { v: Math.round(c[1] * 100) / 100, s: MO }, Math.round(c[1] / R.total * 1000) / 10]));
  if (R.ins.length) { sum.push([], [{ v: 'Cosa noto', s: B }]); R.ins.forEach(t => sum.push([t])); }
  const dat = [['Data', 'Mezzo', 'Tipo', 'Categoria', 'Distributore', 'Importo (€)', 'Litri', 'Prezzo (€/L)', 'Km', 'Nota'].map(v => ({ v, s: B }))];
  R.rows.forEach(r => dat.push([{ v: serial(r.d), s: DT }, r.v, r.t, r.c, r.s, { v: Math.round(r.a * 100) / 100, s: MO }, r.l, r.p == null ? null : { v: Math.round(r.p * 1000) / 1000, s: PR }, r.km, r.n]));
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const files = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook ' + ns + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Riepilogo" sheetId="1" r:id="rId1"/><sheet name="Dati" sheetId="2" r:id="rId2"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet ' + ns + '><numFmts count="1"><numFmt numFmtId="164" formatCode="0.000"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>'],
    ['xl/worksheets/sheet1.xml', sheetXml(sum, [34, 22, 10])],
    ['xl/worksheets/sheet2.xml', sheetXml(dat, [12, 16, 14, 26, 34, 12, 9, 12, 10, 30])]
  ];
  saveBlob(zip(files), 'car-hub-riepilogo-' + iso(new Date()) + '.xlsx');
}
/* --- PDF (scritto a mano, testo in Helvetica e Courier) --- */
function exportPdf(R) {
  const enc = s => { let o = ''; for (const ch of String(s)) { const c = ch.codePointAt(0); o += ch === '€' ? '\x80' : c < 256 ? ch : ch === '·' ? '\xb7' : '?'; } return o.replace(/[\\()]/g, m => '\\' + m); };
  const pages = []; let cur = null, y = 0;
  const np = () => { cur = []; pages.push(cur); y = 800; };
  const txt = (f, sz, x, s) => { cur.push('BT /' + f + ' ' + sz + ' Tf ' + x + ' ' + y.toFixed(1) + ' Td (' + enc(s) + ') Tj ET'); };
  const nl = h => { y -= h; if (y < 50) np(); };
  const wrap = (s, w) => { const out = []; let l = ''; s.split(' ').forEach(wd => { if ((l + ' ' + wd).trim().length > w) { out.push(l); l = wd; } else l = (l + ' ' + wd).trim(); }); if (l) out.push(l); return out; };
  np(); txt('F2', 20, 50, R.title); nl(20);
  wrap(R.sub, 95).forEach(l => { txt('F1', 10, 50, l); nl(14); }); nl(8);
  R.cards.forEach(c => { txt('F1', 11, 50, c[0]); txt('F2', 11, 220, c[1]); nl(16); }); nl(8);
  if (R.cats.length) { txt('F2', 13, 50, 'Come si divide la spesa'); nl(18); R.cats.forEach(c => { txt('F1', 11, 50, c[0]); txt('F2', 11, 220, fmtN(c[1], 2) + ' €  (' + fmtN(c[1] / R.total * 100, 0) + '%)'); nl(15); }); nl(8); }
  if (R.ins.length) { txt('F2', 13, 50, 'Cosa noto'); nl(18); R.ins.forEach(t => { wrap('- ' + t, 92).forEach(l => { txt('F1', 10, 50, l); nl(13); }); nl(3); }); nl(8); }
  if (R.rows.length) {
    const hdr = () => { txt('F3', 8, 50, pad2('Data', 11) + pad2('Mezzo', 11) + pad2('Voce', 28) + padl('Importo', 10) + padl('Litri', 8) + padl('Km', 9)); nl(12); };
    const pad2 = (s, w) => String(s).slice(0, w - 1).padEnd(w), padl = (s, w) => String(s).slice(0, w).padStart(w);
    if (y < 120) np(); txt('F2', 13, 50, 'Registro'); nl(16); hdr();
    R.rows.forEach(r => { if (y < 62) { np(); hdr(); } txt('F3', 8, 50, pad2(fmtDate(r.d), 11) + pad2(r.v, 11) + pad2(r.c, 28) + padl(fmtN(r.a, 2), 10) + padl(r.l == null ? '' : fmtN(r.l, 2), 8) + padl(r.km == null ? '' : fmtN(r.km, 0), 9)); nl(11); });
  }
  const objs = [];
  const add = s => { objs.push(s); return objs.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>'); add(''); // pagine al posto 2
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
  const kids = [];
  pages.forEach((p, i) => {
    p.push('BT /F1 8 Tf 50 30 Td (' + enc('Car Hub · pagina ' + (i + 1) + ' di ' + pages.length) + ') Tj ET');
    const body = p.join('\n'), cid = add('<< /Length ' + body.length + ' >>\nstream\n' + body + '\nendstream');
    kids.push(add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ' + cid + ' 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> >>'));
  });
  objs[1] = '<< /Type /Pages /Kids [' + kids.map(k => k + ' 0 R').join(' ') + '] /Count ' + kids.length + ' >>';
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const xr = out.length;
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xr + '\n%%EOF';
  const u = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) u[i] = out.charCodeAt(i) & 255;
  saveBlob(new Blob([u], { type: 'application/pdf' }), 'car-hub-riepilogo-' + iso(new Date()) + '.pdf');
}
/* --- immagine (PNG) --- */
function exportPng(R) {
  const W = 1080, P = 56, c = document.createElement('canvas'), ctx = c.getContext('2d'), F = 'Archivo, system-ui, sans-serif';
  const acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4f8ff7';
  const wrapC = (s, w, font) => { ctx.font = font; const out = []; let l = ''; s.split(' ').forEach(wd => { const t = l ? l + ' ' + wd : wd; if (ctx.measureText(t).width > w && l) { out.push(l); l = wd; } else l = t; }); if (l) out.push(l); return out; };
  const insL = R.ins.slice(0, 5).map(t => wrapC(t, W - 2 * P - 40, '500 28px ' + F));
  const catN = Math.min(5, R.cats.length);
  const H = 190 + Math.ceil(R.cards.length / 2) * 130 + (catN ? 90 + catN * 62 : 0) + (insL.length ? 90 + insL.reduce((a, l) => a + l.length * 38 + 22, 0) : 0) + 90;
  c.width = W; c.height = H;
  ctx.fillStyle = '#0a1226'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = acc; ctx.fillRect(0, 0, W, 10);
  ctx.fillStyle = '#fff'; ctx.font = '700 52px ' + F; ctx.fillText('Car Hub · Riepilogo', P, 100);
  ctx.fillStyle = '#9fb0cf'; ctx.font = '500 26px ' + F; ctx.fillText(R.sub.length > 62 ? R.sub.slice(0, 61) + '…' : R.sub, P, 146);
  let y = 190; const cw = (W - 2 * P - 24) / 2;
  R.cards.forEach((cd, i) => {
    const x = P + (i % 2) * (cw + 24), yy = y + Math.floor(i / 2) * 130;
    ctx.fillStyle = '#121c36'; ctx.beginPath(); ctx.roundRect(x, yy, cw, 112, 22); ctx.fill();
    ctx.fillStyle = '#9fb0cf'; ctx.font = '500 24px ' + F; ctx.fillText(cd[0], x + 24, yy + 40);
    ctx.fillStyle = '#fff'; ctx.font = '700 38px ' + F; ctx.fillText(cd[1], x + 24, yy + 86);
  });
  y += Math.ceil(R.cards.length / 2) * 130 + 20;
  if (catN) {
    ctx.fillStyle = acc; ctx.font = '700 26px ' + F; ctx.fillText('COME SI DIVIDE LA SPESA', P, y + 30); y += 56;
    const mx = R.cats[0][1];
    R.cats.slice(0, catN).forEach(([nm, a]) => {
      ctx.fillStyle = '#fff'; ctx.font = '500 26px ' + F; ctx.fillText(nm, P, y + 22);
      ctx.textAlign = 'right'; ctx.fillText(fmtN(a, 0) + ' €  ·  ' + fmtN(a / R.total * 100, 0) + '%', W - P, y + 22); ctx.textAlign = 'left';
      ctx.fillStyle = '#1b2748'; ctx.beginPath(); ctx.roundRect(P, y + 34, W - 2 * P, 10, 5); ctx.fill();
      ctx.fillStyle = acc; ctx.beginPath(); ctx.roundRect(P, y + 34, Math.max(10, (W - 2 * P) * a / mx), 10, 5); ctx.fill(); y += 62;
    });
    y += 24;
  }
  if (insL.length) {
    ctx.fillStyle = acc; ctx.font = '700 26px ' + F; ctx.fillText('COSA NOTO', P, y + 30); y += 62;
    insL.forEach(ls => { ctx.fillStyle = acc; ctx.fillText('•', P, y + 4); ctx.fillStyle = '#e6edf9'; ctx.font = '500 28px ' + F; ls.forEach((l, i) => { ctx.fillText(l, P + 40, y + 4 + i * 38); }); y += ls.length * 38 + 22; });
  }
  ctx.fillStyle = '#6b7da3'; ctx.font = '500 22px ' + F; ctx.fillText('Car Hub · i dati restano sul tuo telefono', P, H - 40);
  c.toBlob(b => saveBlob(b, 'car-hub-riepilogo-' + iso(new Date()) + '.png'), 'image/png');
}
function doExport(kind) {
  const m = $('exMsg');
  try {
    if (!CTX) return;
    const R = buildReport();
    if (kind === 'xlsx') exportXlsx(R); else if (kind === 'pdf') exportPdf(R); else exportPng(R);
    m.className = 'msg'; m.textContent = 'File creato: lo trovi nei download del telefono.';
  } catch (e) { m.className = 'msg err'; m.textContent = 'Non riesco a creare il file: ' + (e.message || e); }
}


/* ---------- lampadine e ricambi ---------- */
const PARTS = {
  auto: [['Lampadine', [['low', 'Anabbaglianti', 'Es. H7'], ['high', 'Abbaglianti', 'Es. H7'], ['pos', 'Luci di posizione', 'Es. W5W'], ['fi', 'Frecce anteriori', 'Es. PY21W'], ['fr', 'Frecce posteriori', 'Es. PY21W'], ['stop', 'Stop e luci posteriori', 'Es. P21/5W'],
    ['rev', 'Retromarcia', 'Es. P21W'], ['fog', 'Retronebbia', 'Es. P21W'], ['ffog', 'Fendinebbia', 'Es. H11'], ['plate', 'Targa', 'Es. C5W'], ['int', 'Luci interne', 'Es. C5W']]],
    ['Ricambi', [['oilf', 'Filtro olio', 'Codice'], ['airf', 'Filtro aria', 'Codice'], ['cabf', 'Filtro abitacolo', 'Codice'], ['fuelf', 'Filtro carburante', 'Codice'], ['plugs', 'Candele', 'Codice'], ['wip', 'Spazzole tergicristallo', 'Misure'], ['padf', 'Pastiglie davanti', 'Codice'], ['padr', 'Pastiglie dietro', 'Codice'], ['bat', 'Batteria', 'Es. 12V 45Ah']]]],
  moto: [['Lampadine', [['low', 'Anabbagliante', 'Es. H4'], ['high', 'Abbagliante', 'Es. H4'], ['pos', 'Luce di posizione', 'Es. W5W'], ['fi', 'Frecce anteriori', 'Es. RY10W'], ['fr', 'Frecce posteriori', 'Es. RY10W'], ['stop', 'Stop e luce posteriore', 'Es. P21/5W'], ['plate', 'Targa', 'Es. W5W']]],
    ['Ricambi', [['oilf', 'Filtro olio', 'Codice'], ['airf', 'Filtro aria', 'Codice'], ['plugs', 'Candela', 'Codice'], ['padf', 'Pastiglie davanti', 'Codice'], ['padr', 'Pastiglie dietro', 'Codice'], ['chain', 'Kit catena', 'Codice'], ['bat', 'Batteria', 'Es. 12V 10Ah']]]]
};
const partLabel = (v, k) => { for (const [, rows] of PARTS[v.type === 'moto' ? 'moto' : 'auto']) { const r = rows.find(x => x[0] === k); if (r) return r[1]; } return k; };
function renderParts() {
  const v = cur(); v.parts = v.parts || {};
  $('partsBox').innerHTML = PARTS[v.type === 'moto' ? 'moto' : 'auto'].map(([t, rows]) => '<h4 class="ph">' + t + '</h4>' + rows.map(([k, l, ph]) => {
    const p = v.parts[k] || {};
    return '<div class="prow"><span>' + l + '</span><input type="text" data-part="' + k + '" maxlength="30" placeholder="' + ph + '" value="' + esc(p.code || '') + '" autocomplete="off"><label class="chk"><input type="checkbox" data-buy="' + k + '"' + (p.buy ? ' checked' : '') + '><i>Da comprare</i></label></div>';
  }).join('')).join('');
  const s = $('partsSearch'), q = [(v.info || {}).model, (v.info || {}).year].filter(Boolean).join(' ');
  s.hidden = !(v.info || {}).model; if (q) s.href = 'https://www.google.com/search?q=' + encodeURIComponent('lampadine ' + q + ' tipo lampade anabbaglianti abbaglianti posizione retromarcia');
  renderBuy();
}
function renderBuy() {
  const v = cur(), items = Object.keys(v.parts || {}).filter(k => v.parts[k].buy);
  $('buyBox').hidden = !items.length;
  $('buyList').innerHTML = items.map(k => '<li>' + esc(partLabel(v, k)) + (v.parts[k].code ? ': <b>' + esc(v.parts[k].code) + '</b>' : '') + '</li>').join('');
}
function buyCopy() {
  const v = cur(), items = Object.keys(v.parts || {}).filter(k => v.parts[k].buy), m = $('buyMsg');
  const text = 'Da comprare per ' + vName(v) + (((v.info || {}).model) ? ' (' + v.info.model + ')' : '') + ':\n' + items.map(k => '- ' + partLabel(v, k) + (v.parts[k].code ? ': ' + v.parts[k].code : '')).join('\n');
  m.className = 'msg';
  if (navigator.share) navigator.share({ text }).then(() => { m.textContent = ''; }, () => { m.textContent = ''; });
  else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => { m.textContent = 'Lista copiata.'; }, () => { m.textContent = text; });
  else m.textContent = text;
}
function lastCost(v, k) {
  const cat = RENEWCAT[k], from = fromDate('365'), ex = v.expenses.filter(x => x.cat === cat).sort((a, b) => b.date.localeCompare(a.date));
  if (!ex.length) return '<p class="kmline">Nessuna spesa registrata: usa «Rinnovata» oppure aggiungila in «Spese dell\'auto».</p>';
  const y = ex.filter(x => x.date >= from).reduce((a, x) => a + x.amount, 0);
  return '<p class="kmline">Ultima spesa: <b>' + fmtN(ex[0].amount, 2) + ' €</b> il ' + fmtDate(ex[0].date) + ' · ultimi 12 mesi: ' + fmtN(y, 2) + ' €</p>';
}


/* ---------- distributori di Pompa Giusta nel diario ---------- */
let fSt = null, STN = null, STNP = null;
const stNorm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function loadStations() {
  if (STNP) return STNP;
  STNP = fetch('data/meta.json', { cache: 'no-store' }).then(r => r.json()).then(m => fetch('data/pompe.json?v=' + encodeURIComponent(m.v))).then(r => r.json())
    .then(d => { STN = (d.s || []).map(r => ({ id: r.i, brand: r.b || 'Altro', name: r.n || '', addr: r.a || '', comune: r.c || '', prov: r.p, p: r.x || {} })); STN.forEach(s => { s.k = stNorm(s.brand + ' ' + s.name + ' ' + s.addr + ' ' + s.comune); }); return STN; })
    .catch(() => { STNP = null; return null; });
  return STNP;
}
const stLabel = s => s.brand + ' · ' + (s.addr ? s.addr + ', ' : '') + s.comune;
function renderStChip() {
  $('fStName').hidden = !fSt; $('btnStClear').hidden = !fSt; $('fStName').textContent = fSt ? fSt.name : '';
  $('btnPickSt').textContent = fSt ? 'Cambia' : 'Scegli il distributore';
}
function stSearch() {
  const q = stNorm($('stQ').value).trim(), box = $('stRes'), hint = $('stHint');
  if (!STN) { box.innerHTML = ''; hint.textContent = 'Carico i distributori…'; return; }
  let prov = ''; try { prov = (JSON.parse(localStorage.getItem('pg.prefs') || '{}')).prov || ''; } catch (e) { /* niente */ }
  let favs = []; try { const n = (JSON.parse(localStorage.getItem('pg.user') || '{}')).notes || {}; favs = Object.keys(n).filter(id => n[id].fav); } catch (e) { /* niente */ }
  let res;
  if (!q) { res = STN.filter(s => favs.includes(s.id)); hint.textContent = res.length ? 'I tuoi preferiti. Scrivi per cercarne altri' + (prov ? ' in provincia di ' + (PROVL.find(x => x[0] === prov) || [0, prov])[1] : '') + '.' : 'Scrivi la marca, la via o il comune.'; }
  else {
    const words = q.split(/\s+/);
    res = STN.filter(s => words.every(w => s.k.includes(w))); const inP = res.filter(s => !prov || s.prov === prov);
    res = (inP.length ? inP : res).slice().sort((a, b) => (favs.includes(b.id) ? 1 : 0) - (favs.includes(a.id) ? 1 : 0));
    hint.textContent = res.length ? (res.length > 30 ? 'Primi 30 risultati: scrivi di più per restringere.' : plural(res.length, 'risultato', 'risultati') + '.') : 'Nessun distributore trovato.';
  }
  box.innerHTML = res.slice(0, 30).map(s => '<button type="button" class="stit" data-id="' + esc(s.id) + '"><b>' + esc(s.brand) + '</b><span>' + esc((s.addr ? s.addr + ', ' : '') + s.comune) + '</span></button>').join('');
}
function openStPicker() {
  $('dlgSt').hidden = false; $('stQ').value = ''; stSearch(); $('stQ').focus();
  loadStations().then(r => { if (!r) { $('stHint').textContent = 'Non riesco a caricare i distributori: controlla la connessione.'; return; } loadMarket(); stSearch(); });
}
function stats_byStation(list, from, fuel) {
  const m = new Map();
  list.forEach(v => v.fills.forEach(x => {
    if (x.date < from || !(x.sn || x.sid) || x.fuel !== fuel || !(x.liters > 0)) return;
    const k = x.sid || x.sn, o = m.get(k) || { name: x.sn || k, n: 0, l: 0, c: 0 };
    o.n++; o.l += x.liters; o.c += x.total; if (x.sn) o.name = x.sn; m.set(k, o);
  }));
  return [...m.values()].map(o => Object.assign(o, { p: o.c / o.l })).sort((a, b) => a.p - b.p);
}
function renderStationStats(list, from) {
  const box = $('stStn'), fills = [].concat(...list.map(v => v.fills)), cnt = {};
  fills.forEach(x => { if (x.sn || x.sid) cnt[x.fuel] = (cnt[x.fuel] || 0) + 1; });
  const fuel = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
  if (!fuel) { box.hidden = true; return; }
  const rows = stats_byStation(list, from, fuel);
  box.hidden = false;
  const allL = fills.filter(x => x.date >= from && x.fuel === fuel && x.liters > 0), avg = allL.reduce((a, x) => a + x.total, 0) / allL.reduce((a, x) => a + x.liters, 0);
  $('stStnList').innerHTML = rows.map(r => { const d = (r.p - avg) * 100; return '<div class="vrow"><div class="vi"><b>' + esc(r.name) + '</b><small>' + plural(r.n, 'rifornimento', 'rifornimenti') + ' · ' + fmtN(r.l, 0) + ' litri</small></div><div style="text-align:right"><b class="num">' + fmtN(r.p, 3) + ' €/L</b><br><small style="color:var(' + (d <= -0.05 ? '--good' : d >= 0.05 ? '--bad' : '--muted') + ')">' + (Math.abs(d) < 0.05 ? 'come la tua media' : fmtN(Math.abs(d), 1) + ' cent ' + (d > 0 ? 'in più' : 'in meno')) + '</small></div></div>'; }).join('');
  $('stStnNote').textContent = 'Solo ' + FN[fuel].toLowerCase() + ', prezzo medio che hai pagato in ogni distributore e differenza dalla tua media (' + fmtN(avg, 3) + ' €/L). Registra il distributore nel diario per vederli qui.' + (rows.length < 2 ? ' Servono almeno due distributori diversi per un confronto.' : '');
  STN_BEST = rows.length >= 2 ? { best: rows[0], avgRest: (allL.reduce((a, x) => a + x.total, 0) - rows[0].c) / (allL.reduce((a, x) => a + x.liters, 0) - rows[0].l), fuel } : null;
}
let STN_BEST = null;

/* ---------- eventi ---------- */
function wire() {
  window.addEventListener('hashchange', route);
  $('btnBack').addEventListener('click', () => { if (history.length > 1) history.back(); else location.hash = '#menu'; });
  $('vName').addEventListener('change', e => { cur().name = e.target.value.trim(); save(); renderMezzi(); });
  $('vPlate').addEventListener('change', e => { cur().plate = e.target.value.trim().toUpperCase(); save(); renderMezzi(); });
  $('vKm').addEventListener('change', e => { const n = parseInt(e.target.value, 10); cur().km = n >= 0 ? n : null; save(); renderMezzi(); });
  $('vType').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; cur().type = b.dataset.t; save(); renderMezzi(); });
  document.querySelectorAll('[data-info]').forEach(i => i.addEventListener('change', e => { const v = cur(); v.info = v.info || {}; v.info[e.target.dataset.info] = e.target.value.trim(); save(); }));
  document.querySelectorAll('[data-phone]').forEach(i => i.addEventListener('change', e => { const v = cur(); v.phones = v.phones || {}; v.phones[e.target.dataset.phone] = e.target.value.trim(); save(); }));
  $('vehList').addEventListener('click', e => { const b = e.target.closest('.vitem'); if (!b) return; D.active = b.dataset.vid; save(); renderMezzi(); });
  document.addEventListener('change', e => {
    if (!e.target.matches || !e.target.matches('select[data-vsel]')) return;
    if (e.target.value === '*') { STALL = true; renderStat(); return; }
    STALL = false; D.active = e.target.value; save(); route();
  });
  $('btnPark').addEventListener('click', parkSave);
  $('parkNote').addEventListener('change', e => { const v = cur(); if (v.park) { v.park.note = e.target.value.trim(); save(); } });
  $('parkPic').addEventListener('change', e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f || !cur().park) return;
    shrink(f, d => { const m = $('parkMsg'); if (!d) { m.className = 'msg err'; m.textContent = 'Non riesco a leggere la foto.'; return; } cur().park.photo = d; save(); m.className = 'msg'; m.textContent = 'Foto salvata.'; renderStrada(); });
  });
  $('btnParkDel').addEventListener('click', () => askDel('Cancellare la posizione?', 'La posizione e la foto del parcheggio verranno cancellate.', () => { delete cur().park; save(); $('parkMsg').textContent = ''; renderStrada(); }));
  $('sostaBtns').addEventListener('click', e => { const b = e.target.closest('button[data-min]'); if (!b) return; cur().sosta = Date.now() + parseInt(b.dataset.min, 10) * 60000; save(); renderSosta(); });
  $('btnSostaOff').addEventListener('click', () => { delete cur().sosta; save(); renderSosta(); });
  ['tKm', 'tPers', 'tCons', 'tPrice', 'tToll', 'tRound'].forEach(i => $(i).addEventListener('input', tripCalc));
  $('tPrice').addEventListener('input', () => { tPriceTouched = true; });
  $('mkF').addEventListener('change', e => { MKF = e.target.value; renderMarket(); });
  $('mkM').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; MKM = +b.dataset.m; renderMarket(); });
  $('exBtns').addEventListener('click', e => { const b = e.target.closest('button[data-x]'); if (b) doExport(b.dataset.x); });
  $('partsBox').addEventListener('input', e => {
    const t = e.target, v = cur(); v.parts = v.parts || {};
    if (t.dataset.part) { (v.parts[t.dataset.part] = v.parts[t.dataset.part] || {}).code = t.value.trim(); save(); renderBuy(); }
  });
  $('partsBox').addEventListener('change', e => {
    const t = e.target, v = cur(); v.parts = v.parts || {};
    if (t.dataset.buy) { (v.parts[t.dataset.buy] = v.parts[t.dataset.buy] || {}).buy = t.checked; save(); renderBuy(); }
  });
  $('btnBuyCopy').addEventListener('click', buyCopy);
  document.querySelectorAll('[data-info="model"],[data-info="year"]').forEach(i => i.addEventListener('change', () => renderParts()));
  $('btnPickSt').addEventListener('click', openStPicker);
  $('btnStClear').addEventListener('click', () => { fSt = null; renderStChip(); });
  $('btnStNo').addEventListener('click', () => { $('dlgSt').hidden = true; });
  $('dlgSt').addEventListener('click', e => { if (e.target === $('dlgSt')) $('dlgSt').hidden = true; });
  $('stQ').addEventListener('input', stSearch);
  $('stRes').addEventListener('click', e => { const b = e.target.closest('.stit'); if (!b) return; const s = (STN || []).find(x => x.id === b.dataset.id); if (!s) return; const pr = s.p[$('fFuel').value + '1'] != null ? s.p[$('fFuel').value + '1'] : s.p[$('fFuel').value + '0']; fSt = { id: s.id, name: stLabel(s), price: pr }; renderStChip(); fillPrice(); $('dlgSt').hidden = true; });
  $('btnShareLoc').addEventListener('click', shareLoc);
  $('btnAddVeh').addEventListener('click', () => {
    const x = newVehicle('', D.vehicles.some(y => y.type === 'auto') && !D.vehicles.some(y => y.type === 'moto') ? 'moto' : 'auto');
    D.vehicles.push(x); D.active = x.id; save(); renderMezzi(); $('vName').focus();
  });
  const dlgDel = $('dlgDel'), closeDel = () => { dlgDel.hidden = true; delFn = null; };
  $('btnDelVeh').addEventListener('click', () => {
    if (D.vehicles.length < 2) return;
    const v = D.vehicles.find(x => x.id === D.active);
    askDel('Eliminare questo mezzo?', '«' + vName(v) + '» verrà eliminato con le sue scadenze e il suo diario dei rifornimenti. Non si può annullare.', () => {
      if (D.vehicles.length < 2) return;
      D.vehicles = D.vehicles.filter(x => x.id !== D.active); D.active = D.vehicles[0].id; save(); renderMezzi();
    });
  });
  $('btnDelNo').addEventListener('click', closeDel);
  dlgDel.addEventListener('click', e => { if (e.target === dlgDel) closeDel(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !dlgDel.hidden) closeDel(); });
  $('btnDelOk').addEventListener('click', () => { const f = delFn; closeDel(); if (f) f(); });
  $('fillForm').addEventListener('submit', saveFill);
  $('btnFillCancel').addEventListener('click', () => { resetForm(); });
  ['fL', 'fTot', 'fFuel', 'fDate'].forEach(i => $(i).addEventListener('input', fillPrice));
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
      if (!j || j.app !== 'garage-backup' || typeof j.data !== 'object') throw new Error('Questo non è un file di backup di Car Hub.');
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


// Numero di versione in fondo al menu
(function () { var e = document.getElementById('appVer'); if (e && window.appVersionLabel) e.textContent = window.appVersionLabel(); })();
