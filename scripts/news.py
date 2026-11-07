"""Titoli di notizie sul carburante per la fascia scorrevole di Pompa Giusta.

Legge un feed RSS pubblico (Google News, ricerca in italiano), tiene solo titolo, testata,
data e collegamento (mai il testo degli articoli) e scrive data/news.json.
Se la rete non risponde lascia il file precedente: la fascia non resta mai senza titoli per un guasto.
"""
import json, os, re, sys, urllib.request, urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'news.json')
QUERIES = ['prezzi carburanti benzina gasolio', 'accise carburanti', 'rincari benzina gasolio self']
GIORNI = 10
MAX_TITOLI = 12
PAROLE = re.compile(r'carburant|benzin|gasolio|diesel|accis|self|rifornimento|pieno|gpl|metano|distributor', re.I)


def scarica(q):
    url = 'https://news.google.com/rss/search?' + urllib.parse.urlencode(
        {'q': q + ' when:7d', 'hl': 'it', 'gl': 'IT', 'ceid': 'IT:it'})
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (PompaGiusta news)'})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read()


def leggi(xml_bytes, adesso):
    """Estrae i titoli da un feed RSS. Funzione pura, provata in locale con un esempio."""
    out = []
    root = ET.fromstring(xml_bytes)
    for it in root.iter('item'):
        titolo = (it.findtext('title') or '').strip()
        link = (it.findtext('link') or '').strip()
        fonte_el = it.find('source')
        fonte = (fonte_el.text or '').strip() if fonte_el is not None else ''
        if fonte and titolo.endswith(' - ' + fonte):
            titolo = titolo[:-(len(fonte) + 3)].strip()
        elif ' - ' in titolo and not fonte:
            titolo, fonte = titolo.rsplit(' - ', 1)
        try:
            quando = parsedate_to_datetime(it.findtext('pubDate') or '')
            if quando.tzinfo is None:
                quando = quando.replace(tzinfo=timezone.utc)
        except Exception:
            continue
        if not titolo or not link.startswith(('http://', 'https://')):
            continue
        if not PAROLE.search(titolo):
            continue
        if adesso - quando > timedelta(days=GIORNI) or quando > adesso + timedelta(hours=2):
            continue
        out.append({'t': titolo[:160], 's': fonte[:40], 'u': link, 'd': quando.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%MZ')})
    return out


def unisci(liste):
    visti, out = set(), []
    for it in sorted((x for l in liste for x in l), key=lambda x: x['d'], reverse=True):
        k = re.sub(r'[^a-z0-9]', '', it['t'].lower())[:50]
        if k in visti:
            continue
        visti.add(k)
        out.append(it)
    return out[:MAX_TITOLI]


def main():
    adesso = datetime.now(timezone.utc)
    liste, errori = [], 0
    for q in QUERIES:
        try:
            liste.append(leggi(scarica(q), adesso))
        except Exception as e:  # rete, feed cambiato, XML rotto: si va avanti con le altre ricerche
            errori += 1
            print('Ricerca «%s» non riuscita: %s' % (q, e), file=sys.stderr)
    items = unisci(liste)
    if not items:
        print('Nessun titolo nuovo (%d ricerche su %d in errore): lascio il file com\'e\'.' % (errori, len(QUERIES)))
        if not os.path.exists(OUT):
            json.dump({'updated': adesso.strftime('%Y-%m-%dT%H:%MZ'), 'items': []}, open(OUT, 'w'))
        return
    json.dump({'updated': adesso.strftime('%Y-%m-%dT%H:%MZ'), 'items': items}, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
    print('Titoli salvati: %d' % len(items))


if __name__ == '__main__':
    main()
