"""Fetch the shared Google Maps list "Argentina 2026" and write maps-list.json for the site.

Runs twice a day in GitHub Actions (.github/workflows/sync-maps-list.yml). Standard library only.
Accommodation pins are dropped so the public site never shows where we sleep.
"""
import json
import re
import sys
import urllib.request

LIST_ID = '_EnPqw2SmnUyrJ6549apt122gG8AzQ'
URL = ('https://www.google.com/maps/preview/entitylist/getlist?authuser=0&hl=hu&gl=hu'
       f'&pb=!1m4!1s{LIST_ID}!2e1!3m1!1e1!2e2!3e2!4i500!16b1')
OUT = 'maps-list.json'

# Pins that are (or look like) where we stay: a "szállás"/Airbnb note or name, or a bare street address with no place name.
LODGING_NOTE = re.compile(r'sz[aá]ll[aá]s|airbn|hotel|hostel|apartman', re.I)
BARE_ADDRESS = re.compile(r'^[^\d,]+\s\d{1,5}$')


def fetch():
    req = urllib.request.Request(URL, headers={
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
        'Cookie': 'SOCS=CAI',  # skip the cookie-consent interstitial (rejects non-essential cookies)
    })
    raw = urllib.request.urlopen(req, timeout=30).read().decode('utf-8')
    return json.loads(raw.split('\n', 1)[1])


def parse(data):
    places = []
    for it in data[0][8]:
        info = it[1] or []
        name = (it[2] if len(it) > 2 else '') or ''
        note = (it[3] if len(it) > 3 else '') or ''
        addr = info[4] if len(info) > 4 and info[4] else ''
        coords = info[5] if len(info) > 5 and info[5] else None
        if not name or not coords:
            continue
        if LODGING_NOTE.search(note) or LODGING_NOTE.search(name) or (not addr and BARE_ADDRESS.match(name)):
            continue
        places.append({'name': name, 'addr': addr, 'll': [round(coords[2], 5), round(coords[3], 5)], 'note': note.strip()})
    return places


def main():
    places = parse(fetch())
    if len(places) < 5:  # something went wrong upstream: keep the previous file
        sys.exit(f'only {len(places)} places parsed, not updating')
    try:
        old = json.load(open(OUT, encoding='utf-8'))['places']
    except (OSError, ValueError, KeyError):
        old = None
    if old == places:
        print('no change')
        return
    from datetime import datetime, timezone
    json.dump({'updatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'places': places},
              open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'updated: {len(places)} places')


if __name__ == '__main__':
    main()
