"""Fonte di riserva: il sito pubblico "Osservaprezzi carburanti" del Ministero (carburanti.mise.gov.it).

Serve quando i file aperti del MIMIT non sono raggiungibili da GitHub. Il sito risponde con i prezzi
attuali degli impianti entro un raggio dato da un punto: copro l'Italia con tanti cerchi, partendo dagli
impianti gia' noti (indirizzo, comune, provincia e coordinate li prendo dall'ultima pubblicazione).
"""
import json
import math
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

API = 'https://carburanti.mise.gov.it/ospzApi'
PAGES_DATA = 'https://manara74.github.io/Car-Hub/data/pompe.json'
UA = 'Mozilla/5.0 (compatible; PompaGiusta/1.0; app gratuita, uso personale)'
RAGGIO = 20          # km di ogni cerchio (il massimo del sito)
TETTO = 900          # se un cerchio restituisce tanti impianti puo' essere troncato: lo divido
THREADS = 3
FUEL_KEY = {'benzina': 'B', 'gasolio': 'D', 'gpl': 'G', 'metano': 'M'}
MAX_AGE_DAYS = 8


def _http(url, data=None, tries=4, timeout=60):
    last = None
    for a in range(tries):
        try:
            h = {'User-Agent': UA, 'Accept': 'application/json'}
            if data is not None:
                h['Content-Type'] = 'application/json'
                data = data if isinstance(data, bytes) else json.dumps(data).encode()
            req = urllib.request.Request(url, data=data, headers=h)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode('utf-8'))
        except (urllib.error.URLError, TimeoutError, ConnectionError, ValueError) as e:
            last = e
            time.sleep(3 * (a + 1))
    raise RuntimeError('%s: %s' % (url, last))


def post_zone(lat, lng, km):
    d = _http(API + '/search/zone', {'points': [{'lat': lat, 'lng': lng}], 'fuelType': '',
                                     'priceOrder': 'asc', 'radius': km})
    if not d.get('success', True):
        raise RuntimeError('risposta senza successo')
    return d.get('results') or []


def get_registry(sid):
    return _http('%s/registry/servicearea/%s' % (API, sid), tries=3)


def km(a_lat, a_lon, b_lat, b_lon):
    p = math.pi / 180
    x = (b_lon - a_lon) * p * math.cos((a_lat + b_lat) / 2 * p)
    y = (b_lat - a_lat) * p
    return 6371 * math.hypot(x, y)


def load_base(local=None):
    """Impianti noti: l'ultima pubblicazione (o un file locale per le prove)."""
    if local:
        return json.load(open(local, encoding='utf-8'))['s']
    return _http(PAGES_DATA, tries=4, timeout=120)['s']


def cover(points, r=RAGGIO):
    """Centri dei cerchi che coprono tutti i punti (copertura greedy con griglia)."""
    cell = {}
    for i, (la, lo) in enumerate(points):
        cell.setdefault((int(la * 4), int(lo * 4)), []).append(i)
    done = [False] * len(points)
    centres = []
    for i, (la, lo) in sorted(enumerate(points), key=lambda t: (t[1][0], t[1][1])):
        if done[i]:
            continue
        centres.append((la, lo))
        cx, cy = int(la * 4), int(lo * 4)
        for dx in range(-2, 3):
            for dy in range(-2, 3):
                for j in cell.get((cx + dx, cy + dy), ()):
                    if not done[j] and km(la, lo, *points[j]) <= r:
                        done[j] = True
    return centres


def parse_prices(rec, today):
    """Dai combustibili di un impianto ai nostri prezzi (chiave = lettera + self) e ai giorni di eta'."""
    x = {}
    for f in rec.get('fuels') or []:
        k = FUEL_KEY.get(str(f.get('name', '')).strip().lower())
        try:
            pr = float(f.get('price'))
        except (TypeError, ValueError):
            continue
        if not k or not (0.4 < pr < 5):
            continue
        key = '%s%d' % (k, 1 if f.get('isSelf') else 0)
        if key not in x or pr < x[key]:
            x[key] = round(pr, 3)
    age = None
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', str(rec.get('insertDate') or ''))
    if m:
        age = max(0, (today - datetime(int(m[1]), int(m[2]), int(m[3])).date()).days)
    return x, age


def new_station(sid, z, prov, title, brand_title):
    """Impianto non presente nella base: indirizzo, comune e provincia dal registro del sito."""
    try:
        r = get_registry(sid)
    except RuntimeError:
        return None
    addr = str(r.get('address') or '')
    m = re.search(r'(?:-|,)\s*\d{5}\s+(.+?)\s*\((\w{2})\)\s*$', addr)
    if not m:
        return None
    code = prov.sigla(m[2])
    if code not in prov.by_code:
        return None
    loc = z.get('location') or {}
    la, lo = loc.get('lat'), loc.get('lng')
    if la is None or lo is None or not (35 < la < 48 and 6 < lo < 19):
        la = lo = None
    street = re.sub(r'\s*-\s*\d{5}.*$', '', addr).strip()
    return {'i': str(sid), 'b': brand_title(z.get('brand')) or 'Altro',
            'n': str(r.get('nomeImpianto') or r.get('name') or z.get('name') or ('Impianto ' + str(sid))),
            'a': street, 'c': title(m[1]), 'p': code, 'la': la, 'lo': lo,
            'h': 1 if re.search(r'autostrad|\bA\d{1,2}\b', addr + ' ' + str(z.get('name') or ''), re.I) else 0}


def collect(prov, title, brand_title, base_file=None, now=None, max_new=300):
    """Restituisce (impianti con prezzi, data dei prezzi, prezzi scartati perche' vecchi, note)."""
    now = now or datetime.now(timezone(timedelta(hours=1)))
    today = now.date()
    base = {s['i']: s for s in load_base(base_file)}
    pts = [(s['la'], s['lo']) for s in base.values() if s.get('la') is not None and s.get('lo') is not None]
    if len(pts) < 5000:
        raise RuntimeError('Base impianti troppo piccola (%d): non posso coprire il territorio.' % len(pts))
    centres = cover(pts)
    print('osservaprezzi: %d cerchi da %d km per %d impianti noti' % (len(centres), RAGGIO, len(pts)), flush=True)

    found, fails, lock = {}, [], threading.Lock()

    def query(c, r, depth=0):
        try:
            res = post_zone(c[0], c[1], r)
        except RuntimeError as e:
            with lock:
                fails.append(str(e))
            return
        with lock:
            for z in res:
                found[str(z['id'])] = z
        if len(res) >= TETTO and depth < 2:   # forse troncato: rifaccio con cerchi piu' piccoli
            d = r / 2 / 111.0
            for dx, dy in ((d, d), (d, -d), (-d, d), (-d, -d)):
                query((c[0] + dy, c[1] + dx / max(0.2, math.cos(math.radians(c[0])))), r / 2 + 1, depth + 1)

    with ThreadPoolExecutor(THREADS) as ex:
        list(ex.map(lambda c: query(c, RAGGIO), centres))
    print('osservaprezzi: %d impianti trovati, %d richieste fallite' % (len(found), len(fails)), flush=True)
    if len(fails) > max(5, len(centres) // 20):
        raise RuntimeError('Troppe richieste fallite (%d su %d): non pubblico dati incompleti.' % (len(fails), len(centres)))

    out, stale, nuovi = [], 0, 0
    for sid, z in found.items():
        x, age = parse_prices(z, today)
        if not x:
            continue
        if age is not None and age > MAX_AGE_DAYS:
            stale += 1
            continue
        rec = base.get(sid)
        if rec is None:
            if nuovi >= max_new:
                continue
            rec = new_station(sid, z, prov, title, brand_title)
            if rec is None:
                continue
            nuovi += 1
        rec = {k: v for k, v in rec.items() if k not in ('x', 'd', 's')}
        rec['x'] = x
        if age is not None:
            rec['d'] = {k: age for k in x}
        out.append(rec)
    return out, today.strftime('%Y-%m-%d'), stale, {'cerchi': len(centres), 'trovati': len(found),
                                                   'falliti': len(fails), 'nuovi': nuovi}
