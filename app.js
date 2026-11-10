/* Pompa Giusta: interfaccia. Le funzioni di calcolo stanno in lib.js (PG). */
(function () {
'use strict';
const PG = window.PG;
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const FUELS = { B: 'Benzina', D: 'Gasolio', G: 'GPL', M: 'Metano' };
const SV = {
  LAV: 'Lavaggio', LAVA: 'Lavaggio automatico', LAVS: 'Lavaggio self', ARIA: 'Aria / gonfiaggio',
  VAC: 'Aspirapolvere', BAR: 'Bar', SHOP: 'Negozio', WC: 'WC', EV: 'Ricarica elettrica',
  EVF: 'Ricarica rapida', OFF: 'Officina', OLIO: 'Cambio olio / tagliandi', GOM: 'Gomme', H24: 'Aperto 24h'
};
const SV_ORDER = ['H24', 'LAV', 'LAVA', 'LAVS', 'ARIA', 'VAC', 'BAR', 'SHOP', 'WC', 'EV', 'EVF', 'OFF', 'OLIO', 'GOM'];
const GROUP = { LAV: ['LAV', 'LAVA', 'LAVS'], EV: ['EV', 'EVF'] };
const DETAIL_CODES = ['LAV', 'ARIA', 'VAC', 'BAR', 'SHOP', 'WC', 'EV', 'OFF', 'OLIO', 'GOM', 'H24'];
const FILTERS = [
  ['LAV', 'Lavaggio', ['LAV', 'LAVA', 'LAVS']], ['ARIA', 'Gonfiaggio', ['ARIA']],
  ['BAR', 'Bar / negozio', ['BAR', 'SHOP']], ['EV', 'Ricarica elettrica', ['EV', 'EVF']],
  ['OFF', 'Officina / tagliandi', ['OFF', 'OLIO']], ['WC', 'WC', ['WC']], ['H24', 'Aperto 24h', ['H24']]
];

const S = {
  stations: [], byId: new Map(), avg: {}, hist: {}, meta: null, manual: false, date: null,
  tab: 'zona', f: 'B', m: 1, prov: null, comune: '', brand: '', tipo: 'all', svf: [], fav: false,
  litri: 40, consumo: 6.5, limit: 40, open: null,
  near: { pos: null, radius: 5, sort: 'conv', limit: 30 },
  route: { res: null, limit: 30, detour: 2 },
  map: null, layer: null
};
const U = { home: '', work: '', notes: {}, geo: {} };
const O = { quick: true, hero: true, verdict: true, charts: true, ticker: true, news: true, favs: true };
let SPEED = 'normal';
const SPEEDS = { slow: 32, normal: 52, fast: 84 };
const RADII = [1, 2, 5, 10, 20, 30, 50], DETOURS = [0.5, 1, 2, 3, 5, 10];

/* ---------- memoria sul telefono ---------- */
function lsGet(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* memoria piena o bloccata */ } }
function loadPrefs() {
  const p = lsGet('pg.prefs', {});
  if (FUELS[p.f]) S.f = p.f;
  if (p.m === 0 || p.m === 1) S.m = p.m;
  if (p.prov) S.prov = p.prov;
  S.comune = p.comune || ''; S.brand = p.brand || '';
  if (p.tipo) S.tipo = p.tipo;
  if (Array.isArray(p.svf)) S.svf = p.svf.filter(c => FILTERS.some(f => f[0] === c));
  if (p.litri > 0) S.litri = p.litri;
  if (p.consumo > 0) S.consumo = p.consumo;
  if (['zona', 'vicino', 'percorso'].includes(p.tab)) S.tab = p.tab;
  if (p.radius) S.near.radius = p.radius;
  if (p.sort) S.near.sort = p.sort;
  if (p.detour) S.route.detour = p.detour;
  const u = lsGet('pg.user', {});
  U.home = u.home || ''; U.work = u.work || ''; U.notes = u.notes || {};
  U.geo = lsGet('pg.geo', {});
}
function savePrefs() {
  lsSet('pg.prefs', { f: S.f, m: S.m, prov: S.prov, comune: S.comune, brand: S.brand, tipo: S.tipo, svf: S.svf,
    litri: S.litri, consumo: S.consumo, tab: S.tab, radius: S.near.radius, sort: S.near.sort, detour: S.route.detour });
}
function loadOpts() { const o = lsGet('pg.opts', {}); Object.keys(O).forEach(k => { if (o[k] === false) O[k] = false; }); if (SPEEDS[o.speed]) SPEED = o.speed; }
const saveOpts = () => lsSet('pg.opts', Object.assign({}, O, { speed: SPEED }));
function applyOpts() {
  Object.keys(O).forEach(k => document.documentElement.classList.toggle('h-' + k, !O[k]));
  document.querySelectorAll('input[data-o]').forEach(c => { c.checked = !!O[c.dataset.o]; });
  document.querySelectorAll('#o_speed button').forEach(b => b.classList.toggle('on', b.dataset.sp === SPEED));
  document.documentElement.style.setProperty('--tsp', SPEEDS[SPEED]);
}
function saveUser() { lsSet('pg.user', { home: U.home, work: U.work, notes: U.notes }); }

/* ---------- dati ---------- */
async function getJSON(url, opt) {
  const r = await fetch(url, opt);
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}
function expand(r) {
  return { id: r.i, brand: r.b || 'Altro', name: r.n, addr: r.a || '', comune: r.c || '', prov: r.p, hw: !!r.h,
    lat: r.la == null ? null : r.la, lon: r.lo == null ? null : r.lo, p: r.x, d: r.d || {}, s: r.s || [] };
}
async function loadProvinces() { PG.setProvinces(await getJSON('../province.json')); }
async function loadAll() {
  await loadProvinces();
  try { S.hist = await getJSON('../data/history.json'); } catch (e) { S.hist = {}; }
  const meta = await getJSON('../data/meta.json', { cache: 'no-store' });
  const d = await getJSON('../data/pompe.json?v=' + encodeURIComponent(meta.v));
  S.meta = meta;
  try { const nw = await getJSON('../data/news.json?v=' + encodeURIComponent(meta.v)); S.news = Array.isArray(nw.items) ? nw.items.filter(i => i && i.t && i.u) : []; } catch (e) { S.news = []; }
  setStations(d.s.map(expand), d.date, false);
}
function setStations(st, date, manual) {
  S.stations = st; S.byId = new Map(st.map(s => [s.id, s]));
  S.date = date; S.manual = !!manual; S.avg = PG.computeAvg(st);
  if (!manual) snapAllFavs(); else FH = lsGet('pg.favhist', {});
  const pc = {};
  st.forEach(s => { pc[s.prov] = (pc[s.prov] || 0) + 1; });
  if (!S.prov || !pc[S.prov]) {
    S.prov = Object.keys(pc).sort((a, b) => pc[b] - pc[a])[0] || null; S.comune = ''; S.brand = '';
  }
  buildProvSelect(pc); syncControls(); renderAll();
}

/* ---------- servizi e note personali ---------- */
function effSv(s) {
  const n = U.notes[s.id] || {};
  const set = new Set(s.s);
  (n.add || []).forEach(c => set.add(c));
  (n.rem || []).forEach(c => set.delete(c));
  return set;
}
function passSv(s) {
  if (!S.svf.length) return true;
  const set = effSv(s);
  return S.svf.every(code => FILTERS.find(f => f[0] === code)[2].some(c => set.has(c)));
}
const isFav = id => !!(U.notes[id] && U.notes[id].fav);
const passFav = s => !S.fav || isFav(s.id);
function cleanNote(id) {
  const n = U.notes[id]; if (!n) return;
  if (n.add && !n.add.length) delete n.add;
  if (n.rem && !n.rem.length) delete n.rem;
  if (!n.add && !n.rem && !n.fav) delete U.notes[id];
}
function setNote(id, code, on) {
  const s = S.byId.get(id); if (!s) return;
  const n = U.notes[id] || (U.notes[id] = {});
  const g = GROUP[code] || [code];
  n.add = (n.add || []).filter(c => !g.includes(c));
  n.rem = (n.rem || []).filter(c => !g.includes(c));
  const detected = g.some(c => s.s.includes(c));
  if (on && !detected) n.add.push(code);
  if (!on && detected) n.rem.push(...g);
  cleanNote(id); saveUser();
}
function toggleFav(id) {
  const n = U.notes[id] || (U.notes[id] = {});
  if (n.fav) delete n.fav; else n.fav = true;
  cleanNote(id); saveUser();
  if (n.fav) snapFav(id);
}

/* ---------- preferiti: andamento salvato sul telefono ---------- */
const FAVKEEP = 90;
let FH = {};
function snapFav(id) {
  const s = S.byId.get(id); if (!s || S.manual || !S.date) return;
  const h = FH[id] || (FH[id] = {});
  Object.keys(s.p).forEach(k => {
    const a = h[k] || (h[k] = []);
    if (a.length && a[a.length - 1][0] === S.date) a[a.length - 1][1] = s.p[k];
    else a.push([S.date, s.p[k]]);
    if (a.length > FAVKEEP) a.splice(0, a.length - FAVKEEP);
  });
  lsSet('pg.favhist', FH);
}
function snapAllFavs() {
  FH = lsGet('pg.favhist', {});
  Object.keys(U.notes).forEach(id => { if (U.notes[id].fav) snapFav(id); });
  Object.keys(FH).forEach(id => { if (!(U.notes[id] && U.notes[id].fav)) delete FH[id]; });
  lsSet('pg.favhist', FH);
}
function favInfo(id) {
  const s = S.byId.get(id); if (!s) return null;
  const k = key(), a = (FH[id] && FH[id][k]) || [];
  const cur = s.p[k];
  const prev = a.length ? a.filter(x => x[0] < S.date).pop() : null;
  return { s, k, cur, a, delta: cur != null && prev ? cur - prev[1] : null, since: prev ? prev[0] : null };
}
function spark(a) {
  if (a.length < 3) return '';
  const v = a.map(x => x[1]), mn = Math.min(...v), mx = Math.max(...v), W = 84, H = 26, r = (mx - mn) || 0.001;
  const pts = v.map((y, i) => (i * (W - 4) / (v.length - 1) + 2).toFixed(1) + ',' + (H - 3 - (y - mn) / r * (H - 6)).toFixed(1)).join(' ');
  return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>';
}
function renderFavs() {
  const card = $('favCard');
  const ids = Object.keys(U.notes).filter(id => U.notes[id].fav && S.byId.has(id));
  if (!ids.length || !S.stations.length) { card.hidden = true; return; }
  const items = ids.map(favInfo).sort((a, b) => (a.cur == null) - (b.cur == null) || a.cur - b.cur);
  card.hidden = false; $('favCount').textContent = String(items.length);
  $('favBody').innerHTML = items.map(f => {
    const d = f.delta, tone = d == null || Math.abs(d) < 0.0005 ? 'flat' : d > 0 ? 'up' : 'down';
    const dl = f.cur == null ? 'non disponibile per questo carburante'
      : d == null ? 'segnato oggi: seguo il prezzo da ora'
      : tone === 'flat' ? 'invariato dal ' + fmtDay(f.since)
      : PG.fmtC(d) + ' dal ' + fmtDay(f.since);
    return '<li data-fid="' + esc(f.s.id) + '" tabindex="0" role="button">' + brandBadge(f.s.brand) +
      '<div class="fi"><b>' + esc(f.s.name) + '</b><small>' + esc(f.s.comune) + ' (' + esc(f.s.prov) + ')</small>' +
      '<span class="fd ' + tone + '">' + esc(dl) + '</span></div>' +
      '<div class="fp ' + tone + '">' + (f.cur != null ? '<b class="num">' + PG.fmtP(f.cur) + '</b>' : '<b>—</b>') + spark(f.a) + '</div></li>';
  }).join('');
}
function openFav(id) {
  const s = S.byId.get(id); if (!s) return;
  S.prov = s.prov; S.comune = ''; S.brand = ''; S.tipo = 'all'; S.svf = []; S.fav = true; S.open = id; S.limit = 40;
  refresh();
  const r = document.querySelector('.row[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
  if (r) r.scrollIntoView({ block: 'center' });
}

/* ---------- calcoli comuni ---------- */
const key = () => S.f + S.m;
function avgFor(region) {
  const a = S.avg[key()]; if (!a) return null;
  return a.r[region] != null ? a.r[region] : a.ALL;
}
function sortItems(items, mode) {
  if (mode === 'price') items.sort((x, y) => x.price - y.price || x.cost - y.cost);
  else if (mode === 'dist') items.sort((x, y) => x.d - y.d);
  else items.sort((x, y) => x.cost - y.cost);
}

/* ---------- elementi della pagina ---------- */
function svChips(set) {
  const out = [];
  SV_ORDER.forEach(c => {
    if (!set.has(c)) return;
    if (c === 'LAV' && (set.has('LAVA') || set.has('LAVS'))) return;
    if (c === 'EV' && set.has('EVF')) return;
    out.push(SV[c]);
  });
  return out.length ? '<div class="sv">' + out.map(x => '<i>' + esc(x) + '</i>').join('') + '</div>' : '';
}
function detailHTML(s, set) {
  const boxes = DETAIL_CODES.map(c => {
    const g = GROUP[c] || [c];
    const on = g.some(x => set.has(x));
    return '<label><input type="checkbox" data-sv="' + c + '" data-id="' + esc(s.id) + '"' + (on ? ' checked' : '') + '> ' + esc(SV[c]) + '</label>';
  }).join('');
  const nav = s.lat != null
    ? '<a class="btn small" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + s.lat + ',' + s.lon + '">Portami qui</a>'
    : '<a class="btn small" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([s.addr, s.comune, s.prov].filter(Boolean).join(', ')) + '">Cerca su Maps</a>';
  return '<div class="detail"><div class="svgrid">' + boxes + '</div>' +
    '<p class="hint">Servizi da OpenStreetMap. Se ne manca uno che sai esserci, spuntalo: lo ricordo solo su questo telefono.</p>' +
    '<div class="acts">' + nav + '<button type="button" class="btn small ghost" data-act="fav" data-id="' + esc(s.id) + '">' +
    (isFav(s.id) ? '★ Nei preferiti' : '☆ Aggiungi ai preferiti') + '</button></div></div>';
}
function emptyMsg(where, pool, hint) {
  const base = 'Nessun distributore con ' + FUELS[S.f].toLowerCase() + ' (' + (S.m ? 'self' : 'servito') + ') ' + where;
  if (!S.svf.length) return base + '. ' + hint;
  const names = S.svf.map(c => FILTERS.find(f => f[0] === c)[1]).join(' + ');
  const known = pool.some(s => s.s && s.s.length);
  return base + ' che abbia: ' + names + '. ' + (known
    ? 'Qui OpenStreetMap non ha segnato questo servizio, ma il distributore potrebbe averlo: togli il filtro per vederli tutti.'
    : 'Per questa zona i dati sui servizi non sono ancora disponibili: togli il filtro per vedere tutti i distributori.');
}
/* Distintivo colorato della bandiera: sigla su colore tipico, non il logo ufficiale */
const BRANDS = [['eni','Eni','#ffd400','#111'],['agip','Eni','#ffd400','#111'],['q8','Q8','#0a3f94','#fff'],['kuwait','Q8','#0a3f94','#fff'],
  ['esso','Es','#1c4f9e','#fff'],['tamoil','Ta','#d7261e','#fff'],['api','Ip','#1d5fb4','#ffd400'],['ip','Ip','#1d5fb4','#ffd400'],
  ['shell','Sh','#ffd100','#d4151b'],['total','To','#e2231a','#fff'],['erg','Er','#0a7a3d','#fff'],['repsol','Re','#f58220','#fff'],
  ['bianca','PB','#6b7977','#fff'],['pompe','PB','#6b7977','#fff'],['beyfin','Be','#c0392b','#fff'],['costantin','Co','#8e44ad','#fff'],
  ['italiana','IP','#1d5fb4','#ffd400'],['saras','Sa','#0e7490','#fff'],['self','SI','#6b7977','#fff']];
function brandBadge(name) {
  const n = String(name || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
  const w = n.split(/ +/);
  const m = BRANDS.find(b => w.indexOf(b[0]) >= 0) || BRANDS.find(b => b[0].length > 2 && n.indexOf(b[0]) >= 0);
  const t = m ? m[1] : (String(name || '?').trim().slice(0, 2) || '?');
  return '<i class="bd" style="background:' + (m ? m[2] : '#44514f') + ';color:' + (m ? m[3] : '#fff') + '" title="' + esc(name) + '">' + esc(t) + '</i>';
}
function rowHTML(s, o) {
  const k = key(), p = s.p[k];
  const d = o.avg != null ? p - o.avg : null;
  const odd = d != null && (d <= -0.3 || d >= 0.5); // scarto fuori dal normale: puo' essere un errore del gestore
  const cls = d == null || odd ? 'warn' : d <= -0.0095 ? 'good' : d >= 0.0095 ? 'bad' : 'warn';
  const lab = odd ? (d < 0 ? 'Molto sotto la media: da verificare' : 'Molto sopra la media: da verificare')
    : cls === 'good' ? 'Sotto la media' : cls === 'bad' ? 'Sopra la media' : 'In linea con la media';
  const set = effSv(s), open = S.open === s.id;
  const age = s.d && s.d[k] != null && S.date ? s.d[k] : null;
  const when = age == null ? '' : PG.priceDate(S.date, age);
  const delta = d != null
    ? '<div class="delta ' + cls + '"><strong>' + PG.fmtC(d) + '</strong><span>' + lab + '</span><em>' +
      (d * S.litri < 0 ? '−' : d * S.litri > 0 ? '+' : '') + PG.fmtE(Math.abs(d * S.litri)) + ' sul pieno</em></div>' : '';
  return '<li class="row' + (open ? ' open' : '') + '" data-id="' + esc(s.id) + '">' +
    '<div class="main" tabindex="0" role="button" aria-expanded="' + open + '">' +
    '<div><span class="rank">N. ' + o.rank + ' di ' + o.total + (isFav(s.id) ? ' · ★' : '') + '</span>' +
    '<div class="lcd"><span>' + PG.fmtP(p) + '</span><small>€/L</small></div>' +
    (when ? '<span class="when' + (age >= 4 ? ' old' : '') + '">Prezzo del ' + when + '</span>' : '') + '</div>' +
    '<div class="info"><b>' + brandBadge(s.brand) + '<span>' + esc(s.name) + '</span></b>' +
    '<span class="l">' + esc(s.brand) + (s.comune ? ' · ' + esc(s.comune) : '') + (s.hw ? ' · autostrada' : '') + '</span>' +
    (s.addr ? '<span class="l">' + esc(s.addr) + '</span>' : '') +
    (o.extra ? '<span class="extra">' + o.extra + '</span>' : '') + svChips(set) + '</div>' + delta + '</div>' +
    (open ? detailHTML(s, set) : '') + '</li>';
}

/* ---------- grafici ---------- */
function histo(prices, avg, selP) {
  if (prices.length < 4) return '<p class="hint">Servono almeno 4 impianti in provincia per disegnare il grafico.</p>';
  const a = prices.slice().sort((x, y) => x - y);
  const lo = a[Math.floor(a.length * 0.01)], hi = a[Math.ceil(a.length * 0.99) - 1];
  const n = Math.min(24, Math.max(6, Math.round(Math.sqrt(a.length))));
  const w = (hi - lo) || 0.01, bins = Array(n).fill(0);
  a.forEach(p => { if (p < lo || p > hi) return; bins[Math.min(n - 1, Math.floor((p - lo) / w * n))]++; });
  const W = 640, H = 230, L = 8, R = 8, T = 30, B = 36, mx = Math.max.apply(null, bins), bw = (W - L - R) / n, ch = H - T - B;
  const X = v => L + Math.max(0, Math.min(1, (v - lo) / w)) * (W - L - R);
  const selBin = selP != null ? Math.min(n - 1, Math.max(0, Math.floor((selP - lo) / w * n))) : -1;
  let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Istogramma dei prezzi in provincia">';
  bins.forEach((c, i) => {
    const h = ch * c / mx;
    s += '<rect class="bar' + (i === selBin ? ' hi' : '') + '" x="' + (L + i * bw + 1).toFixed(1) + '" y="' + (T + ch - h).toFixed(1) +
      '" width="' + Math.max(2, bw - 5).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2"/>';
  });
  s += '<line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + (T + ch) + '" y2="' + (T + ch) + '"/>';
  if (avg != null) {
    const x = X(avg);
    s += '<line class="avgline" x1="' + x + '" x2="' + x + '" y1="' + (T - 8) + '" y2="' + (T + ch) + '"/><text class="lbl strong" x="' + x +
      '" y="12" text-anchor="' + (x > W * 0.7 ? 'end' : x < W * 0.3 ? 'start' : 'middle') + '">media regione ' + PG.fmtP(avg) + '</text>';
  }
  if (selP != null) {
    const x = X(selP);
    s += '<path class="mark" d="M' + (x - 6) + ' ' + (T + ch + 9) + ' L' + (x + 6) + ' ' + (T + ch + 9) + ' L' + x + ' ' + (T + ch + 1) +
      ' Z"/><text class="lbl strong" x="' + x + '" y="' + (H - 4) + '" text-anchor="' + (x > W * 0.8 ? 'end' : x < W * 0.2 ? 'start' : 'middle') + '">' + PG.fmtP(selP) + '</text>';
  }
  s += '<text class="lbl" x="' + L + '" y="' + (H - 4) + '">' + PG.fmtP(lo) + '</text><text class="lbl" x="' + (W - R) + '" y="' + (H - 4) + '" text-anchor="end">' + PG.fmtP(hi) + '</text>';
  return s + '</svg>';
}
function trend(region) {
  const k = key();
  const ds = Object.keys(S.hist).sort().filter(d => S.hist[d] && S.hist[d][k]);
  if (ds.length < 2) return '<p class="hint">Qui comparirà l\'andamento: il grafico si costruisce da solo, un punto ogni giorno. Servono almeno due giorni di dati.</p>';
  const pts = ds.map(d => ({ d, r: S.hist[d][k][region], n: S.hist[d][k].ALL }));
  const vals = [];
  pts.forEach(p => { if (p.r != null) vals.push(p.r); if (p.n != null) vals.push(p.n); });
  let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  const pad = Math.max(0.01, (hi - lo) * 0.2); lo -= pad; hi += pad;
  const W = 420, H = 190, L = 10, R = 52, T = 14, B = 30;
  const X = i => L + (i / (ds.length - 1)) * (W - L - R), Y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const line = (f, cls) => {
    const d = pts.map((p, i) => p[f] != null ? X(i).toFixed(1) + ',' + Y(p[f]).toFixed(1) : null).filter(Boolean);
    return d.length > 1 ? '<polyline class="' + cls + '" points="' + d.join(' ') + '"/>' : '';
  };
  let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Andamento delle medie">';
  s += '<line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '"/>' + line('n', 'l-nat') + line('r', 'l-reg');
  const last = pts[pts.length - 1], lx = X(pts.length - 1);
  if (last.r != null) s += '<circle class="dot" cx="' + lx + '" cy="' + Y(last.r) + '" r="4"/><text class="lbl strong" x="' + (lx + 8) + '" y="' + (Y(last.r) + 4) + '">' + PG.fmtP(last.r) + '</text>';
  if (last.n != null) s += '<text class="lbl" x="' + (lx + 8) + '" y="' + (Y(last.n) + (last.r != null && Math.abs(Y(last.r) - Y(last.n)) < 12 ? 14 : 4)) + '">' + PG.fmtP(last.n) + '</text>';
  s += '<text class="lbl" x="' + L + '" y="' + (H - 10) + '">' + PG.fmtD(ds[0]).slice(0, 5) + '</text><text class="lbl" x="' + (W - R) + '" y="' + (H - 10) + '" text-anchor="end">' + PG.fmtD(ds[ds.length - 1]).slice(0, 5) + '</text></svg>';
  return s + '<p class="hint"><b style="color:var(--accent)">——</b> ' + esc(region) + ' &nbsp; <b>- - -</b> Italia</p>';
}

/* ---------- vista Zona ---------- */
function renderZona() {
  if (!S.stations.length) return;
  const k = key(), region = PG.region(S.prov), pvName = PG.provName(S.prov), avgR = avgFor(region);
  const inProv = S.stations.filter(s => s.prov === S.prov && s.p[k] != null);
  const provRoad = inProv.filter(s => !s.hw);
  const avgP = provRoad.length ? provRoad.reduce((t, s) => t + s.p[k], 0) / provRoad.length : null;
  const list = inProv.filter(s => (!S.comune || s.comune === S.comune) && (!S.brand || s.brand === S.brand) &&
    (S.tipo === 'all' || (S.tipo === 'hw') === s.hw) && passSv(s) && passFav(s));
  list.sort((a, b) => a.p[k] - b.p[k]);

  const mn = list.length ? list[0].p[k] : null, mx = list.length ? list[list.length - 1].p[k] : null;
  const dlt = mn != null && avgR != null ? mn - avgR : null;
  const sub = (l, v) => '<div><small>' + l + '</small><b class="num">' + (v != null ? PG.fmtP(v) : '—') + '</b></div>';
  $('summary').innerHTML = '<div class="hero"><small class="kick">Il più economico in elenco</small>' +
    '<div class="big num">' + (mn != null ? PG.fmtP(mn) : '—') + '<span>€/L</span></div>' +
    (dlt != null ? '<div class="dl ' + (dlt <= -0.0095 ? 'good' : dlt >= 0.0095 ? 'bad' : 'warn') + '">' + PG.fmtC(dlt) + ' sulla media regionale</div>' : '') +
    '<div class="two">' + sub('Media ' + esc(region), avgR) + sub('Media ' + esc(pvName), avgP) + '</div></div>';

  const L = S.litri;
  if (list.length && avgR != null) {
    const sv = (avgR - mn) * L, ex = (mx - avgR) * L;
    $('verdictText').innerHTML = 'Per <b>' + L.toLocaleString('it-IT') + ' litri</b> di ' + FUELS[S.f].toLowerCase() + ', il più economico dell\'elenco costa <b class="num">' +
      PG.fmtE(mn * L) + '</b>: ' + (sv >= 0 ? '<b>' + PG.fmtE(sv) + ' in meno</b>' : '<b>' + PG.fmtE(-sv) + ' in più</b>') + ' rispetto alla media di ' + esc(region) +
      '. Il più caro costa ' + (ex >= 0 ? PG.fmtE(ex) + ' in più' : PG.fmtE(-ex) + ' in meno') + '.';
  } else $('verdictText').textContent = 'Scegli un carburante e una zona con distributori per vedere quanto puoi risparmiare.';

  const shown = list.slice(0, S.limit);
  $('list').innerHTML = shown.length
    ? shown.map((s, i) => rowHTML(s, { rank: i + 1, total: list.length, avg: avgR })).join('')
    : '<li class="empty">' + esc(emptyMsg('per questi filtri', S.stations.filter(s => s.prov === S.prov), 'Prova a cambiare modalità o a togliere un filtro.')) + '</li>';
  $('btnMore').hidden = list.length <= S.limit;

  const sel = S.open ? S.byId.get(S.open) : null;
  const selP = sel && sel.p[k] != null && sel.prov === S.prov ? sel.p[k] : null;
  $('histo').innerHTML = histo(provRoad.map(s => s.p[k]), avgR, selP);
  $('histoHint').textContent = provRoad.length ? 'Ogni colonna è un gruppo di distributori con prezzi simili in ' + pvName + ' (' + provRoad.length + ' fuori autostrada). Tocca un distributore in elenco per vedere dove cade.' : '';
  $('trend').innerHTML = trend(region);
}

/* ---------- vista Vicino a me ---------- */
function renderNear() {
  const box = $('nearList'), sum = $('nearSum');
  if (!S.near.pos) {
    box.innerHTML = '<li class="empty">Tocca «Usa la mia posizione» per vedere i distributori attorno a te.</li>';
    sum.hidden = true; $('btnMoreNear').hidden = true; return;
  }
  const k = key(), { lat, lon } = S.near.pos;
  const items = PG.near(S.stations.filter(s => passSv(s) && passFav(s)), k, lat, lon, S.near.radius);
  items.forEach(it => { it.det = PG.detour(it.d); it.price = it.s.p[k]; it.cost = PG.cost(it.price, S.litri, S.consumo, it.det); });
  if (!items.length) {
    const pool = PG.near(S.stations.filter(passFav), k, lat, lon, S.near.radius).map(it => it.s);
    box.innerHTML = '<li class="empty">' + esc(emptyMsg('entro ' + S.near.radius + ' km', pool, 'Prova ad allargare il raggio.')) + '</li>';
    sum.hidden = true; $('btnMoreNear').hidden = true; return;
  }
  sortItems(items, S.near.sort);
  const best = items.slice().sort((x, y) => x.cost - y.cost)[0];
  const closest = items.slice().sort((x, y) => x.d - y.d)[0];
  sum.hidden = false;
  sum.innerHTML = 'Entro ' + S.near.radius + ' km ci sono <b>' + items.length + '</b> distributori. Il più conveniente, viaggio compreso, è <b>' + esc(best.s.name) +
    '</b> a ' + PG.fmtKm(best.d) + ': pieno da <b class="num">' + PG.fmtE(best.cost) + '</b>.' +
    (closest !== best ? ' Il più vicino è a ' + PG.fmtKm(closest.d) + ' e costa ' + PG.fmtE(closest.cost) + '.' : '');
  const shown = items.slice(0, S.near.limit);
  box.innerHTML = shown.map((it, i) => rowHTML(it.s, {
    rank: i + 1, total: items.length, avg: avgFor(PG.region(it.s.prov)),
    extra: 'A ' + PG.fmtKm(it.d) + ' da te · pieno con viaggio: <b class="num">' + PG.fmtE(it.cost) + '</b>'
  })).join('');
  $('btnMoreNear').hidden = items.length <= S.near.limit;
}
function askPosition() {
  const m = $('nearMsg'); m.className = 'msg';
  if (!navigator.geolocation) { m.textContent = 'Questo browser non permette di leggere la posizione.'; m.className = 'msg err'; return; }
  m.textContent = 'Cerco la tua posizione…';
  navigator.geolocation.getCurrentPosition(pos => {
    S.near.pos = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    m.textContent = ''; renderNear();
  }, err => {
    m.textContent = err && err.code === 1 ? 'Posizione non consentita. Puoi abilitarla dalle impostazioni del browser per questo sito.' : 'Non riesco a leggere la posizione. Riprova all\'aperto o con il GPS acceso.';
    m.className = 'msg err';
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
}

/* ---------- vista Percorso ---------- */
function netError(e) {
  const t = String(e && e.message || e);
  return /Failed to fetch|NetworkError|Load failed/i.test(t) ? 'Non riesco a collegarmi ai servizi di mappe. Controlla la connessione e riprova.' : t;
}
async function geocode(q) {
  q = q.trim();
  if (!q) throw new Error('Scrivi un indirizzo di partenza e uno di arrivo.');
  const ck = q.toLowerCase();
  if (U.geo[ck]) return { g: U.geo[ck], cached: true };
  const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=it&accept-language=it&q=' + encodeURIComponent(q));
  if (!r.ok) throw new Error('Il servizio di ricerca indirizzi non risponde (' + r.status + ').');
  const j = await r.json();
  if (!j.length) throw new Error('Non trovo «' + q + '». Prova ad aggiungere il comune.');
  const g = [+j[0].lat, +j[0].lon, j[0].display_name];
  const keys = Object.keys(U.geo);
  if (keys.length > 40) delete U.geo[keys[0]];
  U.geo[ck] = g; lsSet('pg.geo', U.geo);
  return { g, cached: false };
}
async function osrm(a, b) {
  const u = 'https://router.project-osrm.org/route/v1/driving/' + a[1] + ',' + a[0] + ';' + b[1] + ',' + b[0] + '?overview=full&geometries=geojson';
  const r = await fetch(u);
  if (!r.ok) throw new Error('Il servizio di percorsi non risponde (' + r.status + ').');
  const j = await r.json();
  if (j.code !== 'Ok' || !j.routes || !j.routes.length) throw new Error('Non trovo un percorso in auto tra i due indirizzi.');
  return j.routes[0];
}
async function runRoute() {
  const rm = $('routeMsg'); rm.className = 'msg';
  if (!S.stations.length) { rm.textContent = 'I prezzi non sono ancora caricati.'; rm.className = 'msg err'; return; }
  $('btnRoute').disabled = true;
  try {
    rm.textContent = 'Cerco gli indirizzi…';
    const a = await geocode($('inFrom').value);
    if (!a.cached) await sleep(1100);
    const b = await geocode($('inTo').value);
    rm.textContent = 'Calcolo il percorso…';
    const route = await osrm(a.g, b.g);
    const rs = PG.resample(route.geometry.coordinates, 0.2);
    S.route.res = { a: a.g, b: b.g, pts: rs.pts, total: rs.total, dur: route.duration, coords: route.geometry.coordinates };
    S.route.limit = 30; rm.textContent = '';
    renderRoute(true);
  } catch (e) {
    rm.textContent = netError(e); rm.className = 'msg err';
  } finally { $('btnRoute').disabled = false; }
}
function renderRoute(fit) {
  const box = $('routeList'), sum = $('routeSum'), R = S.route.res;
  if (!R) {
    box.innerHTML = '<li class="empty">Scrivi partenza e arrivo, poi tocca «Cerca sul percorso».</li>';
    sum.hidden = true; $('map').hidden = true; $('btnMoreRoute').hidden = true; return;
  }
  const k = key();
  const items = PG.corridor(S.stations.filter(s => passSv(s) && passFav(s)), k, R.pts, S.route.detour);
  items.forEach(it => { it.det = PG.detour(it.d); it.price = it.s.p[k]; it.cost = PG.cost(it.price, S.litri, S.consumo, it.det); });
  items.sort((x, y) => x.cost - y.cost);
  const tripTxt = 'Percorso di <b>' + PG.fmtKm(R.total) + '</b>, circa ' + Math.round(R.dur / 60) + ' minuti. ';
  if (!items.length) {
    sum.hidden = false;
    sum.innerHTML = tripTxt + esc(emptyMsg('entro ' + S.route.detour + ' km dal percorso', [], 'Prova ad allargare la deviazione.')).replace('Per questa zona i dati sui servizi non sono ancora disponibili: togli il filtro per vedere tutti i distributori.', 'Il servizio può non essere segnato su OpenStreetMap: togli il filtro per vederli tutti.');
    box.innerHTML = ''; $('btnMoreRoute').hidden = true; drawMap([], fit); return;
  }
  const avgP = items.reduce((t, it) => t + it.price, 0) / items.length;
  const best = items[0], saving = S.litri * avgP - best.cost;
  sum.hidden = false;
  sum.innerHTML = tripTxt + 'Sul tragitto ci sono <b>' + items.length + '</b> distributori. Il più conveniente è <b>' + esc(best.s.name) + '</b> (' + esc(best.s.comune) +
    '): pieno da <b class="num">' + PG.fmtE(best.cost) + '</b> con la deviazione, ' +
    (saving >= 0 ? '<b>' + PG.fmtE(saving) + ' in meno</b>' : '<b>' + PG.fmtE(-saving) + ' in più</b>') + ' della media dei distributori sul percorso.';
  const shown = items.slice(0, S.route.limit);
  box.innerHTML = shown.map((it, i) => rowHTML(it.s, {
    rank: i + 1, total: items.length, avg: avgFor(PG.region(it.s.prov)),
    extra: 'Al km ' + Math.round(it.km) + ' del percorso · deviazione stimata ' + (it.det ? PG.fmtKm(it.det) : 'nessuna') + ' · pieno: <b class="num">' + PG.fmtE(it.cost) + '</b>'
  })).join('');
  $('btnMoreRoute').hidden = items.length <= S.route.limit;
  drawMap(items, fit);
}
function drawMap(items, fit) {
  const el = $('map'), R = S.route.res;
  if (!window.L || !R) { el.hidden = true; return; }
  el.hidden = false;
  if (!S.map) {
    S.map = L.map(el);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(S.map);
    S.layer = L.layerGroup().addTo(S.map);
  }
  S.layer.clearLayers();
  const line = L.polyline(R.coords.map(c => [c[1], c[0]]), { color: '#0e5c55', weight: 5, opacity: 0.85 }).addTo(S.layer);
  const pin = (pt, txt) => L.circleMarker(pt, { radius: 7, color: '#fff', weight: 2, fillColor: '#14201f', fillOpacity: 1 }).addTo(S.layer).bindPopup(txt);
  pin(R.a, 'Partenza'); pin(R.b, 'Arrivo');
  const shown = items.slice(0, 60), prices = shown.map(it => it.price).sort((x, y) => x - y);
  const t1 = prices[Math.floor(prices.length / 3)], t2 = prices[Math.floor(prices.length * 2 / 3)];
  shown.forEach(it => {
    const col = it.price <= t1 ? '#2e9e5f' : it.price <= t2 ? '#d9a21b' : '#cf4a3d';
    L.circleMarker([it.s.lat, it.s.lon], { radius: 8, weight: 2, color: '#fff', fillColor: col, fillOpacity: 0.95 }).addTo(S.layer)
      .bindPopup('<b>' + esc(it.s.name) + '</b><br>' + PG.fmtP(it.price) + ' €/L · deviazione ' + (it.det ? PG.fmtKm(it.det) : 'nessuna'));
  });
  if (fit) S.map.fitBounds(line.getBounds(), { padding: [20, 20] });
  setTimeout(() => S.map.invalidateSize(), 60);
}
function updateRouteButtons() {
  $('btnHomeWork').disabled = !(U.home && U.work);
  $('btnWorkHome').disabled = !(U.home && U.work);
  $('btnSaveHome').textContent = U.home ? 'Aggiorna Casa' : 'Salva partenza come Casa';
  $('btnSaveWork').textContent = U.work ? 'Aggiorna Lavoro' : 'Salva arrivo come Lavoro';
}

/* ---------- controlli ---------- */
function buildProvSelect(pc) {
  pc = pc || {};
  if (!Object.keys(pc).length) S.stations.forEach(s => { pc[s.prov] = (pc[s.prov] || 0) + 1; });
  const opts = Object.keys(pc).map(c => ({ c, n: PG.provName(c) })).sort((a, b) => a.n.localeCompare(b.n, 'it'));
  $('selProv').innerHTML = opts.map(o => '<option value="' + esc(o.c) + '">' + esc(o.n) + ' (' + esc(o.c) + ')</option>').join('');
  S.provList = opts;
}
function buildOptGeo() {
  const list = S.provList || [];
  if (!list.length) return;
  const regs = Array.from(new Set(list.map(o => PG.region(o.c)))).sort((a, b) => a.localeCompare(b, 'it'));
  const reg = PG.region(S.prov);
  $('o_reg').innerHTML = regs.map(r => '<option value="' + esc(r) + '">' + esc(r) + '</option>').join('');
  $('o_reg').value = reg;
  $('o_prov').innerHTML = list.filter(o => PG.region(o.c) === reg).map(o => '<option value="' + esc(o.c) + '">' + esc(o.n) + ' (' + esc(o.c) + ')</option>').join('');
  $('o_prov').value = S.prov;
  $('o_comune').innerHTML = $('selComune').innerHTML; $('o_comune').value = S.comune;
}
function buildComuneBrand() {
  const inProv = S.stations.filter(s => s.prov === S.prov);
  const cc = {}, bc = {};
  inProv.forEach(s => { cc[s.comune] = (cc[s.comune] || 0) + 1; bc[s.brand] = (bc[s.brand] || 0) + 1; });
  const cs = Object.keys(cc).sort((a, b) => a.localeCompare(b, 'it'));
  $('selComune').innerHTML = '<option value="">Tutta la provincia</option>' + cs.map(c => '<option value="' + esc(c) + '">' + esc(c) + ' (' + cc[c] + ')</option>').join('');
  if (!cc[S.comune]) S.comune = '';
  $('selComune').value = S.comune;
  const bs = Object.keys(bc).sort((a, b) => bc[b] - bc[a]);
  $('selBrand').innerHTML = '<option value="">Tutte le bandiere</option>' + bs.map(b => '<option value="' + esc(b) + '">' + esc(b) + ' (' + bc[b] + ')</option>').join('');
  if (!bc[S.brand]) S.brand = '';
  $('selBrand').value = S.brand;
}
function drawChipsSv() {
  const h = FILTERS.map(f => '<button type="button" data-svf="' + f[0] + '" class="' + (S.svf.includes(f[0]) ? 'on' : '') + '" aria-pressed="' + S.svf.includes(f[0]) + '">' + esc(f[1]) + '</button>').join('');
  $('chipsSv').innerHTML = h; $('chipsSv2').innerHTML = h;
}
function syncControls() {
  const has = k => S.stations.some(s => s.p[k] != null);
  if (S.stations.length && !has(S.f + S.m)) {
    if (has(S.f + (1 - S.m))) S.m = 1 - S.m;
    else { const f = Object.keys(FUELS).find(c => has(c + '1') || has(c + '0')); if (f) { S.f = f; S.m = has(f + '1') ? 1 : 0; } }
  }
  document.querySelectorAll('#segFuel button, #o_fuel button').forEach(b => {
    b.classList.toggle('on', b.dataset.f === S.f);
    b.disabled = S.stations.length > 0 && !(has(b.dataset.f + '1') || has(b.dataset.f + '0'));
  });
  document.querySelectorAll('#segMode button, #o_mode button').forEach(b => {
    b.classList.toggle('on', +b.dataset.m === S.m);
    b.disabled = S.stations.length > 0 && !has(S.f + b.dataset.m);
  });
  if (S.prov) $('selProv').value = S.prov;
  if (S.stations.length) buildComuneBrand();
  $('selTipo').value = S.tipo;
  $('litri').value = S.litri; $('consumo').value = S.consumo;
  ['selRadius', 'o_radius'].forEach(i => { $(i).value = String(S.near.radius); });
  ['selDetour', 'o_detour'].forEach(i => { $(i).value = String(S.route.detour); });
  $('selSort').value = S.near.sort;
  buildOptGeo();
  $('btnFav').classList.toggle('on', S.fav);
  drawChipsSv(); updateRouteButtons();
}
function updateChip() {
  const c = $('chipData');
  if (!S.stations.length) return;
  const days = Math.round((Date.now() - new Date(S.date + 'T12:00:00').getTime()) / 864e5);
  c.className = 'chip' + (days > 2 ? ' warn' : '');
  c.textContent = (S.manual ? 'File caricati a mano · ' : '') + 'Prezzi del ' + PG.fmtD(S.date) + ' · ' + S.stations.length.toLocaleString('it-IT') + ' impianti' + (days > 2 ? ' · non aggiornati' : '');
  const fonte = S.meta && S.meta.fonte === 'osservaprezzi' ? 'Osservaprezzi carburanti del Ministero' : 'dati aperti del Ministero (Prezzi alle 8)';
  $('optData').textContent = c.textContent + '. Fonte: ' + (S.manual ? 'file caricati da te' : fonte) + '. Servizi, mappe e percorsi: OpenStreetMap e contributori.';
}
function renderActive() {
  if (S.tab === 'zona') renderZona(); else if (S.tab === 'vicino') renderNear(); else renderRoute(false);
}
function renderAll() { updateChip(); renderActive(); renderNews(); renderFavs(); }
function setTab(t) {
  S.tab = t; savePrefs();
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $('viewZona').hidden = t !== 'zona'; $('viewVicino').hidden = t !== 'vicino'; $('viewPercorso').hidden = t !== 'percorso';
  renderActive();
  if (t === 'percorso' && S.map) setTimeout(() => S.map.invalidateSize(), 60);
}
function refresh() { savePrefs(); syncControls(); renderActive(); renderNews(); renderFavs(); }


/* ---------- aspetto: modo e colore ---------- */
const ACCENTS = [['blu', 'Blu notte'], ['arancio', 'Arancio'], ['militare', 'Verde militare'], ['bosco', 'Camo bosco'],
  ['deserto', 'Camo deserto'], ['neve', 'Camo neve'], ['rosso', 'Rosso'], ['menta', 'Menta']];
const SWATCH = { blu: '#4c8df6', arancio: '#fb7a1e', militare: '#9bb35a', rosso: '#ff5a64', menta: '#4fc3b5' };
let THEME = { mode: 'auto', accent: 'blu' };
function loadTheme() {
  try { const t = JSON.parse(localStorage.getItem('pg.theme') || '{}'); if (['auto', 'light', 'dark'].includes(t.mode)) THEME.mode = t.mode;
    if (t.accent === 'viola') t.accent = 'neve'; /* il viola è stato sostituito dal camo neve */
    if (ACCENTS.some(x => x[0] === t.accent)) THEME.accent = t.accent; } catch (e) { /* senza memoria locale resta il predefinito */ }
}
function applyTheme() {
  const dark = THEME.mode === 'auto' ? !(window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches) : THEME.mode === 'dark';
  const r = document.documentElement; r.dataset.theme = dark ? 'dark' : 'light'; r.dataset.accent = THEME.accent;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.body).getPropertyValue('--bg').trim() || meta.content;
  document.querySelectorAll('#segThemeMode button').forEach(b => b.classList.toggle('on', b.dataset.tm === THEME.mode));
  document.querySelectorAll('#swatches button').forEach(b => b.classList.toggle('on', b.dataset.ac === THEME.accent));
}
function saveTheme() { try { localStorage.setItem('pg.theme', JSON.stringify(THEME)); } catch (e) { /* non fa niente */ } }
function wireTheme() {
  $('swatches').innerHTML = ACCENTS.map(([k, n]) => '<button type="button" data-ac="' + k + '"><i class="' + (SWATCH[k] ? '' : 'c-' + k) +
    '"' + (SWATCH[k] ? ' style="background:' + SWATCH[k] + '"' : '') + '></i>' + esc(n) + '</button>').join('');
  $('segThemeMode').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; THEME.mode = b.dataset.tm; saveTheme(); applyTheme(); });
  $('swatches').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; THEME.accent = b.dataset.ac; saveTheme(); applyTheme(); });
  if (window.matchMedia) matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (THEME.mode === 'auto') applyTheme(); });
  applyTheme();
}


/* ---------- novità: variazioni calcolate sui prezzi + titoli dei giornali ---------- */
let lastTicker = '', lastCard = '';
const fmtDay = d => d.slice(8, 10) + '/' + d.slice(5, 7);
function calcNews() {
  const out = [], region = PG.region(S.prov), mode = S.m ? 'self' : 'servito';
  if (O.favs) Object.keys(U.notes).filter(id => U.notes[id].fav).forEach(id => {
    const f = favInfo(id);
    if (f && f.delta != null && Math.abs(f.delta) >= 0.0045)
      out.push({ tone: f.delta > 0 ? 'up' : 'down', t: 'Il tuo preferito ' + f.s.name + ' (' + f.s.comune + '): ' + PG.fmtC(f.delta) + ' dal ' + fmtDay(f.since) + ' · ' + FUELS[S.f].toLowerCase() + ' ' + mode });
  });
  ['B', 'D'].forEach(f => {
    const k = f + S.m;
    const ds = Object.keys(S.hist).sort().filter(d => S.hist[d] && S.hist[d][k] && S.hist[d][k][region] != null);
    if (ds.length < 2) return;
    const val = d => S.hist[d][k][region];
    const last = ds[ds.length - 1], v = val(last), prev = ds[ds.length - 2];
    const name = FUELS[f] + ' ' + mode + ' · ' + region;
    const d1 = v - val(prev), ST = 0.0005;
    if (Math.abs(d1) < ST) out.push({ tone: 'flat', t: name + ': prezzo stabile (' + PG.fmtP(v) + ' €/L) rispetto al ' + fmtDay(prev) });
    else out.push({ tone: d1 > 0 ? 'up' : 'down', t: name + ': ' + PG.fmtC(d1) + ' rispetto al ' + fmtDay(prev) + ' (ora ' + PG.fmtP(v) + ' €/L)' });
    const t0 = new Date(last + 'T12:00:00').getTime() - 7 * 864e5;
    const wk = ds.filter(d => new Date(d + 'T12:00:00').getTime() >= t0 - 864e5 * 0.5);
    const old = ds.filter(d => new Date(d + 'T12:00:00').getTime() <= t0).pop();
    if (old) {
      const d7 = v - val(old);
      if (Math.abs(d7) >= ST) out.push({ tone: d7 > 0 ? 'up' : 'down', t: name + ': ' + PG.fmtC(d7) + ' in 7 giorni' });
    }
    if (wk.length >= 4) {
      const vs = wk.map(val), mn = Math.min(...vs), mx = Math.max(...vs);
      if (mx - mn >= ST) {
        if (v <= mn + 1e-9) out.push({ tone: 'down', t: name + ': ai minimi della settimana' });
        else if (v >= mx - 1e-9) out.push({ tone: 'up', t: name + ': ai massimi della settimana' });
      }
    }
    if (f === S.f) {
      const it = S.hist[last][k].ALL;
      if (it != null && Math.abs(v - it) >= 0.0095) out.push({ tone: v > it ? 'up' : 'down', t: region + ' è ' + PG.fmtC(Math.abs(v - it)).replace(/^[+−]/, '') + (v > it ? ' sopra' : ' sotto') + ' la media italiana (' + FUELS[f].toLowerCase() + ')' });
    }
  });
  return out;
}
const safeUrl = u => /^https?:\/\//i.test(u) ? u : '#';
function renderNews() {
  const calc = S.stations.length ? calcNews() : [], ext = S.news || [];
  const ic = { up: '▲', down: '▼', flat: '●' };
  // fascia scorrevole
  const parts = calc.map(n => '<span class="ti ' + n.tone + '"><i>' + ic[n.tone] + '</i>' + esc(n.t) + '</span>')
    .concat(ext.map(n => '<a class="ti ext" href="' + esc(safeUrl(n.u)) + '" target="_blank" rel="noopener noreferrer"><i>●</i>' + esc(n.t) + (n.s ? ' <em>' + esc(n.s) + '</em>' : '') + '</a>'));
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const html = parts.join('<span class="sep">|</span>');
  const sig = html + SPEED + reduced;
  const tk = $('ticker');
  if (!parts.length) { tk.hidden = true; lastTicker = ''; }
  else if (sig !== lastTicker) {
    lastTicker = sig; tk.hidden = false;
    const tr = $('ttrack');
    tr.style.animation = 'none';
    tr.innerHTML = reduced ? html : html + '<span class="sep">|</span>' + html + '<span class="sep">|</span>';
    tr.classList.toggle('static', !!reduced);
    if (!reduced) {
      const half = tr.scrollWidth / 2 || 600;
      tr.style.setProperty('--td', Math.max(20, half / SPEEDS[SPEED]) + 's');
      void tr.offsetWidth; tr.style.animation = '';
    }
  }
  // scheda elenco
  const card = $('newsCard');
  const cs = JSON.stringify([calc, ext]);
  if (!calc.length && !ext.length) { card.hidden = true; lastCard = ''; return; }
  if (cs === lastCard) return;
  lastCard = cs; card.hidden = false;
  $('newsCount').textContent = String(calc.length + ext.length);
  $('newsBody').innerHTML =
    (calc.length ? '<h4>Dai nostri prezzi</h4><ul class="nl">' + calc.map(n => '<li class="' + n.tone + '"><i>' + ic[n.tone] + '</i>' + esc(n.t) + '</li>').join('') + '</ul>' : '') +
    (ext.length ? '<h4>Dai giornali</h4><ul class="nl ext">' + ext.map(n => '<li><a href="' + esc(safeUrl(n.u)) + '" target="_blank" rel="noopener noreferrer">' + esc(n.t) + '</a><small>' + esc(n.s || '') + (n.s ? ' · ' : '') + esc(fmtDay(String(n.d).slice(0, 10))) + '</small></li>').join('') + '</ul>' : '') +
    '<p class="hint">Le variazioni sono calcolate sulle medie dei prezzi qui sotto, ogni giorno. I titoli arrivano da Google News: si aprono sul sito del giornale.</p>';
}

/* ---------- pagina Opzioni ---------- */
let fromHub = false; /* Opzioni aperte dalla rotella di Car Hub: alla chiusura si torna al menu */
let optScroll = 0;
function openOpt() {
  if (!$('optPanel').hidden) return;
  optScroll = window.scrollY;
  syncControls(); applyTheme(); applyOpts();
  $('optPanel').hidden = false; document.documentElement.classList.add('optmode');
  try { history.pushState({ opt: 1 }, ''); } catch (e) { /* senza cronologia si chiude col pulsante */ }
  window.scrollTo(0, 0);
}
function closeOpt() {
  if ($('optPanel').hidden) return;
  $('optPanel').hidden = true; document.documentElement.classList.remove('optmode');
  renderActive();
  if (S.tab === 'percorso' && S.map) setTimeout(() => S.map.invalidateSize(), 60);
  window.scrollTo(0, optScroll);
  if (fromHub) location.replace('../');
}

/* ---------- caricamento manuale di riserva ---------- */
async function readText(f) {
  const buf = await f.arrayBuffer();
  let s = new TextDecoder('utf-8').decode(buf);
  if (s.indexOf(String.fromCharCode(65533)) >= 0) s = new TextDecoder('windows-1252').decode(buf);
  return s;
}
async function ingest(files) {
  const m = $('msg'); m.className = 'msg'; m.textContent = 'Leggo i file…';
  try {
    if (!PG.prov('RM')) await loadProvinces();
    let anag = null, pr = null;
    for (const f of files) {
      const t = PG.parseTable(await readText(f));
      if (t.col('prezzo') >= 0 && t.col('isself') >= 0) pr = PG.buildPrices(t);
      else if (t.col('comune') >= 0) anag = PG.buildAnag(t);
      else throw new Error('Il file «' + f.name + '» non è né un\'anagrafica né un file di prezzi.');
    }
    if (!anag || !pr) throw new Error('Servono entrambi i file: «Prezzi alle 8» e «Anagrafica impianti».');
    const st = anag.map(a => Object.assign({}, a, { p: pr.map[a.id] })).filter(s => s.p);
    if (!st.length) throw new Error('Nessun prezzo corrisponde agli impianti: controlla di aver scaricato i file giusti.');
    setStations(st, pr.date, true);
    m.textContent = 'Fatto: ' + st.length.toLocaleString('it-IT') + ' impianti con prezzi del ' + PG.fmtD(pr.date) + '.';
  } catch (e) { m.textContent = e.message || 'Non riesco a leggere i file.'; m.className = 'msg err'; }
}

/* ---------- eventi ---------- */
function wire() {
  $('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setTab(b.dataset.tab); });
  const onFuel = e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    S.f = b.dataset.f;
    const has = m => S.stations.some(s => s.p[S.f + m] != null);
    S.m = (S.f === 'B' || S.f === 'D') ? (has(1) ? 1 : 0) : (has(0) ? 0 : 1);
    S.limit = 40; S.near.limit = 30; S.route.limit = 30; refresh();
  };
  const onMode = e => { const b = e.target.closest('button'); if (!b || b.disabled) return; S.m = +b.dataset.m; S.limit = 40; refresh(); };
  const onProv = e => { S.prov = e.target.value; S.comune = ''; S.brand = ''; S.limit = 40; S.open = null; refresh(); };
  const onComune = e => { S.comune = e.target.value; S.limit = 40; refresh(); };
  $('segFuel').addEventListener('click', onFuel); $('o_fuel').addEventListener('click', onFuel);
  $('segMode').addEventListener('click', onMode); $('o_mode').addEventListener('click', onMode);
  $('selProv').addEventListener('change', onProv); $('o_prov').addEventListener('change', onProv);
  $('selComune').addEventListener('change', onComune); $('o_comune').addEventListener('change', onComune);
  $('o_reg').addEventListener('change', e => {
    const first = (S.provList || []).find(o => PG.region(o.c) === e.target.value);
    if (first) onProv({ target: { value: first.c } });
  });
  $('selBrand').addEventListener('change', e => { S.brand = e.target.value; S.limit = 40; refresh(); });
  $('selTipo').addEventListener('change', e => { S.tipo = e.target.value; S.limit = 40; refresh(); });
  $('btnFav').addEventListener('click', () => { S.fav = !S.fav; refresh(); });
  const onSv = e => {
    const b = e.target.closest('button'); if (!b) return;
    const c = b.dataset.svf;
    S.svf = S.svf.includes(c) ? S.svf.filter(x => x !== c) : S.svf.concat(c);
    refresh();
  };
  $('chipsSv').addEventListener('click', onSv); $('chipsSv2').addEventListener('click', onSv);
  $('litri').addEventListener('input', e => { const v = parseFloat(e.target.value); S.litri = v > 0 ? Math.min(v, 200) : 40; savePrefs(); renderActive(); });
  $('consumo').addEventListener('input', e => { const v = parseFloat(String(e.target.value).replace(',', '.')); S.consumo = v > 0 ? Math.min(v, 40) : 6.5; savePrefs(); renderActive(); });
  $('btnMore').addEventListener('click', () => { S.limit += 40; renderActive(); });
  $('btnMoreNear').addEventListener('click', () => { S.near.limit += 30; renderActive(); });
  $('btnMoreRoute').addEventListener('click', () => { S.route.limit += 30; renderActive(); });

  $('btnGeo').addEventListener('click', askPosition);
  const onRadius = e => { S.near.radius = +e.target.value; S.near.limit = 30; refresh(); };
  $('selRadius').addEventListener('change', onRadius); $('o_radius').addEventListener('change', onRadius);
  $('selSort').addEventListener('change', e => { S.near.sort = e.target.value; savePrefs(); renderNear(); });

  $('btnRoute').addEventListener('click', runRoute);
  const onDetour = e => { S.route.detour = +e.target.value; S.route.limit = 30; savePrefs(); syncControls(); renderRoute(false); };
  $('selDetour').addEventListener('change', onDetour); $('o_detour').addEventListener('change', onDetour);
  $('btnSaveHome').addEventListener('click', () => { const v = $('inFrom').value.trim(); if (!v) return; U.home = v; saveUser(); updateRouteButtons(); });
  $('btnSaveWork').addEventListener('click', () => { const v = $('inTo').value.trim(); if (!v) return; U.work = v; saveUser(); updateRouteButtons(); });
  $('btnHomeWork').addEventListener('click', () => { $('inFrom').value = U.home; $('inTo').value = U.work; runRoute(); });
  $('btnWorkHome').addEventListener('click', () => { $('inFrom').value = U.work; $('inTo').value = U.home; runRoute(); });

  document.addEventListener('click', e => {
    const a = e.target.closest('[data-act]');
    if (a && a.dataset.act === 'fav') { toggleFav(a.dataset.id); renderActive(); renderNews(); renderFavs(); return; }
    const fv = e.target.closest('#favBody li'); if (fv) { openFav(fv.dataset.fid); return; }
    const m = e.target.closest('.main');
    if (m) { const id = m.closest('.row').dataset.id; S.open = S.open === id ? null : id; renderActive(); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeOpt();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('#favBody li')) { e.preventDefault(); openFav(e.target.closest('#favBody li').dataset.fid); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('main')) {
      e.preventDefault(); const id = e.target.closest('.row').dataset.id; S.open = S.open === id ? null : id; renderActive();
      const r = document.querySelector('.row[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"] .main'); if (r) r.focus();
    }
  });
  document.addEventListener('change', e => {
    const c = e.target.closest('input[data-sv]');
    if (c) { setNote(c.dataset.id, c.dataset.sv, c.checked); renderActive(); }
  });

  const clock = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); const c = $('tclock'); if (c) c.textContent = 'Notizie · ' + z(d.getHours()) + ':' + z(d.getMinutes()); };
  clock(); setInterval(clock, 20000);
  const tv = $('ttrack');
  ['pointerdown', 'touchstart'].forEach(n => $('ticker').addEventListener(n, () => tv.classList.add('paused'), { passive: true }));
  ['pointerup', 'pointercancel', 'touchend', 'touchcancel'].forEach(n => $('ticker').addEventListener(n, () => setTimeout(() => tv.classList.remove('paused'), 2500), { passive: true }));
  $('btnOpt').addEventListener('click', openOpt);
  $('btnCloseOpt').addEventListener('click', () => { if (history.state && history.state.opt) history.back(); else closeOpt(); });
  window.addEventListener('popstate', () => { if (!$('optPanel').hidden) closeOpt(); });
  document.querySelectorAll('input[data-o]').forEach(c => c.addEventListener('change', () => {
    O[c.dataset.o] = c.checked; saveOpts(); applyOpts();
  }));
  $('o_speed').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; SPEED = b.dataset.sp; saveOpts(); applyOpts(); lastTicker = ''; renderNews(); });
  let rs = 0;
  $('btnReset').addEventListener('click', () => {
    const b = $('btnReset');
    if (!rs) { rs = setTimeout(() => { rs = 0; b.textContent = 'Ripristina le impostazioni iniziali'; }, 4000); b.textContent = 'Tocca ancora per confermare'; return; }
    clearTimeout(rs); rs = 0;
    ['pg.prefs', 'pg.theme', 'pg.opts'].forEach(k => { try { localStorage.removeItem(k); } catch (er) { /* niente */ } });
    location.reload();
  });
  $('files').addEventListener('change', e => { if (e.target.files.length) ingest(Array.from(e.target.files)); e.target.value = ''; });
  const dz = $('drop');
  ['dragenter', 'dragover'].forEach(n => dz.addEventListener(n, e => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(n => dz.addEventListener(n, e => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => { const f = Array.from(e.dataTransfer.files || []); if (f.length) ingest(f); });
}

/* ---------- avvio ---------- */
(async function start() {
  loadTheme(); loadPrefs(); loadOpts();
  $('selRadius').innerHTML = $('o_radius').innerHTML = RADII.map(r => '<option value="' + r + '">' + r + ' km</option>').join('');
  $('selDetour').innerHTML = $('o_detour').innerHTML = DETOURS.map(d => '<option value="' + d + '">' + (d < 1 ? (d * 1000) + ' m' : d + ' km') + ' dal percorso</option>').join('');
  $('o_detour').innerHTML = DETOURS.map(d => '<option value="' + d + '">' + (d < 1 ? (d * 1000) + ' m' : d + ' km') + '</option>').join('');
  wire(); wireTheme(); applyOpts(); syncControls(); setTab(S.tab);
  if (location.hash === '#opzioni') { fromHub = true; try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ok */ } openOpt(); }
  try { await loadAll(); }
  catch (e) {
    const c = $('chipData'); c.className = 'chip warn'; c.textContent = 'Prezzi non disponibili';
    $('list').innerHTML = '<li class="empty">I prezzi del giorno non sono ancora disponibili. Riprova fra poco, oppure caricali a mano da Opzioni.</li>';
  }
})();
})();


// Versione e controllo aggiornamenti (Opzioni > Car Hub)
(function () {
  var l = document.getElementById('verLine'), b = document.getElementById('btnUpd'), m = document.getElementById('updMsg');
  if (l && window.appVersionLabel) l.textContent = window.appVersionLabel();
  if (b) b.addEventListener('click', function () { window.appCheckUpdate('../', m, b); });
})();
