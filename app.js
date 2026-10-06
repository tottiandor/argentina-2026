const API = (window.TRIP_CONFIG || {}).api || '';
const TZ = 'America/Argentina/Buenos_Aires';
const TRIP_START = new Date('2026-10-09T14:15:00+02:00'); // departure from Budapest
const TRIP_END = new Date('2026-10-20T23:59:59+02:00');
const WEATHER_LOCS = {
  ba: [-34.6037, -58.3816], iguazu: [-25.6953, -54.4367], mendoza: [-32.8895, -68.8458],
  aconcagua: [-32.8247, -69.9097], budapest: [47.4979, 19.0402],
};
const LOC_NAME = { ba: 'Buenos Aires', iguazu: 'Iguazú', mendoza: 'Mendoza', aconcagua: 'Aconcagua (Puente del Inca)', budapest: 'Budapest' };
const PHOTO_CREDITS = 'Fotók: Obelisco – Jonathan Mauer; Recoleta – Sking; San Telmo – Eugenio Hansen, OFS; Iguazú – Emesbe (CC BY-SA, Wikimedia Commons).';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const maps = q => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
const rand = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

const state = {
  current: 0,
  data: store.get('trip_data', null), // last backend response
  plan: {},
  weather: null,
  fx: store.get('trip_fx', null),
};

// ---- time helpers -------------------------------------------------------------------------

function zoned(date, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(x => [x.type, x.value]));
  return { iso: `${p.year}-${p.month}-${p.day}`, h: +p.hour, m: +p.minute, hm: `${p.hour}:${p.minute}`, min: +p.hour * 60 + +p.minute };
}
const baNow = () => zoned(new Date(), TZ);
function fmtStamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return new Intl.DateTimeFormat('hu-HU', { timeZone: TZ, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d) + ' (BA)';
}
function ago(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (!(s >= 0)) return '';
  const rtf = new Intl.RelativeTimeFormat('hu', { numeric: 'auto' });
  if (s < 60) return 'épp most';
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  return fmtStamp(iso);
}

const SLOT = { reggel: 420, 'délelőtt': 540, utazás: 600, napközben: 720, 'délután': 840, 'később': 1080, este: 1140, tbc: 1500 };
function timeKey(t) {
  const m = String(t).match(/^(\d{1,2}):(\d{2})$/);
  return m ? +m[1] * 60 + +m[2] : (SLOT[String(t).toLowerCase()] ?? 1400);
}
const isClock = t => /^\d{1,2}:\d{2}$/.test(String(t));
const fmtT = t => { const [h, m] = t.split(/[:.]/); return `${h.padStart(2, '0')}:${m}`; };

// ---- live sheet parsing -------------------------------------------------------------------

const isBlank = t => !t || /^[\s?\-–—.]*$/.test(t);

function parsePlan(rows) {
  if (!rows || !rows.length) return {};
  const head = rows[0].map(c => String(c).trim().toLowerCase());
  const col = name => head.findIndex(h => h.startsWith(name));
  const c = { morning: col('délelőtt'), afternoon: col('délután'), food: col('kaja'), stay: col('szállás'), flights: col('repjegy') };
  const out = {};
  rows.slice(1).forEach(r => {
    const di = r.findIndex(x => /^\s*\d{1,2}\.\d{1,2}\b/.test(x));
    if (di < 0) return;
    const [, mo, da] = String(r[di]).match(/(\d{1,2})\.(\d{1,2})/);
    const g = i => (i >= 0 ? String(r[i] || '').trim() : '');
    out[`2026-${mo.padStart(2, '0')}-${da.padStart(2, '0')}`] = {
      morning: g(c.morning), afternoon: g(c.afternoon), food: g(c.food), stay: g(c.stay), flights: g(c.flights),
    };
  });
  return out;
}

function styleFor(text) {
  return EVENT_STYLE.find(s => s.re.test(text)) || { icon: '✨', type: 'Program' };
}
function placeFor(text) {
  const p = PLACES.find(x => x.re.test(text));
  return p ? maps(p.q) : null;
}

function parseCell(text, slot, city) {
  if (isBlank(text)) return [];
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  let first = lines.shift();
  let status = /\?\?/.test(first) ? 'TBC' : '';
  if (/^\?+/.test(first)) { status = 'TBC'; first = first.replace(/^\?+\s*/, ''); }
  let time = slot;
  let m = first.match(/^(\d{1,2})[:.](\d{2})\b\s*/);
  if (m) {
    time = fmtT(`${m[1]}:${m[2]}`);
    first = first.slice(m[0].length);
  } else if ((m = first.match(/\b(\d{1,2}):(\d{2})\b/))) {
    time = fmtT(`${m[1]}:${m[2]}`);
    first = (first.slice(0, m.index) + first.slice(m.index + m[0].length)).replace(/\s{2,}/g, ' ').trim();
  }
  const parts = first.split(/\s+-\s+/);
  const title = parts.shift().replace(/[\s,;]+$/, '');
  const desc = parts.slice();
  const facts = [];
  lines.forEach(l => {
    const mm = l.match(/^(meet|mp|találkozó|meeting point)\s*:\s*(.+)$/i);
    if (mm) {
      const [addr, ...rest] = mm[2].split(/\s+-\s+/);
      const clean = addr.replace(/\.$/, '');
      facts.push({ text: '📍 Találkozó: ' + clean, href: maps(clean.replace(/\(.*?\)/g, '').trim() + ', ' + city) });
      desc.push(...rest);
    } else {
      desc.push(l);
    }
  });
  const all = title + ' ' + desc.join(' ');
  const st = styleFor(all);
  const place = placeFor(all);
  if (place && !facts.length) facts.push({ text: '🗺️ Térkép', href: place });
  return [{ time, title, desc: desc.join(' · '), icon: st.icon, type: st.type, img: st.img, status, facts, live: true }];
}

function parseFood(text) {
  if (isBlank(text)) return [];
  if (text.includes('@')) {
    const [what, where] = text.split('@');
    return [{ text: `${what.trim()} · ${where.split(',')[0].trim()}`, href: maps(where.trim()) }];
  }
  return text.split(/[,\n]/).map(s => s.trim()).filter(s => !isBlank(s))
    .map(s => ({ text: s.charAt(0).toUpperCase() + s.slice(1), href: placeFor(s) }));
}

const normEvent = e => ({ ...e, facts: (e.facts || []).map(f => (typeof f === 'string' ? { text: f } : f)) });

/** Curated day + live sheet row → what we render. */
function dayView(i) {
  const base = DAYS[i];
  const live = state.plan[base.date];
  const city = LOC_NAME[base.loc] || 'Buenos Aires';
  const v = { ...base, live: !!live, events: base.events.map(normEvent), food: (base.food || []).map(t => ({ text: t, href: placeFor(t) })), transport: base.transport || [] };
  if (!live) return v;
  const evs = [...parseCell(live.morning, 'Délelőtt', city), ...parseCell(live.afternoon, 'Délután', city)];
  if (evs.length) {
    v.events = evs.concat(base.events.filter(e => e.keep).map(normEvent))
      .map((e, idx) => ({ e, idx }))
      .sort((a, b) => timeKey(a.e.time) - timeKey(b.e.time) || a.idx - b.idx)
      .map(x => x.e);
  }
  const food = parseFood(live.food);
  if (food.length) v.food = food;
  if (!isBlank(live.stay)) v.stay = live.stay;
  const ranges = [...live.flights.matchAll(/(\d{1,2}[:.]\d{2})\s*-\s*(\d{1,2}[:.]\d{2})/g)];
  if (ranges.length) {
    v.transport = ranges.map((r, k) => ({ icon: '✈️', route: (base.transport || [])[k]?.route || 'Repülés', time: `${fmtT(r[1])} → ${fmtT(r[2])}` }));
  }
  return v;
}

// ---- weather ------------------------------------------------------------------------------

const WMO = {
  0: ['☀️', 'Napos'], 1: ['🌤️', 'Többnyire napos'], 2: ['⛅', 'Változóan felhős'], 3: ['☁️', 'Borult'],
  45: ['🌫️', 'Köd'], 48: ['🌫️', 'Zúzmarás köd'], 51: ['🌦️', 'Gyenge szitálás'], 53: ['🌦️', 'Szitálás'], 55: ['🌧️', 'Erős szitálás'],
  56: ['🌧️', 'Ónos szitálás'], 57: ['🌧️', 'Ónos szitálás'], 61: ['🌦️', 'Gyenge eső'], 63: ['🌧️', 'Eső'], 65: ['🌧️', 'Erős eső'],
  66: ['🌧️', 'Ónos eső'], 67: ['🌧️', 'Ónos eső'], 71: ['🌨️', 'Gyenge havazás'], 73: ['🌨️', 'Havazás'], 75: ['❄️', 'Erős havazás'],
  77: ['🌨️', 'Hószemcse'], 80: ['🌦️', 'Záporok'], 81: ['🌧️', 'Záporok'], 82: ['⛈️', 'Heves záporok'], 85: ['🌨️', 'Hózápor'],
  86: ['🌨️', 'Hózápor'], 95: ['⛈️', 'Zivatar'], 96: ['⛈️', 'Zivatar jégesővel'], 99: ['⛈️', 'Zivatar jégesővel'],
};

async function directWeather() {
  const cached = store.get('trip_wx', null);
  if (cached && Date.now() - new Date(cached.updatedAt) < 6 * 3600e3) return cached;
  try {
    const keys = Object.keys(WEATHER_LOCS);
    const res = await Promise.all(keys.map(k => fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_LOCS[k][0]}&longitude=${WEATHER_LOCS[k][1]}` +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&timezone=auto&forecast_days=16',
    ).then(r => r.json())));
    const out = { updatedAt: new Date().toISOString(), source: 'Open-Meteo', locs: {} };
    res.forEach((j, i) => {
      const d = j.daily;
      if (d) out.locs[keys[i]] = { date: d.time, code: d.weather_code, max: d.temperature_2m_max, min: d.temperature_2m_min, rain: d.precipitation_probability_max, wind: d.wind_speed_10m_max };
    });
    store.set('trip_wx', out);
    return out;
  } catch {
    return cached;
  }
}

function wxFor(loc, date) {
  const L = state.weather?.locs?.[loc];
  if (!L) return null;
  const i = L.date.indexOf(date);
  if (i < 0 || L.max[i] == null) return null;
  const [icon, text] = WMO[L.code[i]] || ['🌡️', 'Előrejelzés'];
  return { icon, text, max: Math.round(L.max[i]), min: Math.round(L.min[i]), rain: L.rain?.[i], wind: L.wind?.[i] };
}

function weatherHTML(d) {
  const w = wxFor(d.loc, d.date);
  const stamp = state.weather?.updatedAt ? `Frissítve: ${fmtStamp(state.weather.updatedAt)} · Open-Meteo` : '';
  if (!w) {
    return `<div class="weather"><div class="left"><div class="wicon">🌡️</div><div><strong>${esc(LOC_NAME[d.loc] || d.city)}</strong><small>Ehhez a naphoz még nincs előrejelzés. ${esc(stamp)}</small></div></div></div>`;
  }
  const extra = [];
  if (w.rain != null) extra.push(`☔ ${w.rain}%`);
  if (w.wind != null) extra.push(`💨 ${Math.round(w.wind)} km/h`);
  const w2 = d.loc2 && wxFor(d.loc2, d.date);
  const second = w2 ? `<small>${w2.icon} ${esc(LOC_NAME[d.loc2])}: ${w2.max}° / ${w2.min}°</small>` : '';
  return `<div class="weather"><div class="left"><div class="wicon">${w.icon}</div><div><strong>${esc(w.text)} · ${esc(LOC_NAME[d.loc] || d.city)}</strong><small>${extra.join(' · ')}</small>${second}<small>${esc(stamp)}</small></div></div><div class="temps"><span>MAX / MIN</span>${w.max}° · ${w.min}°</div></div>`;
}

// ---- dashboard (top) ----------------------------------------------------------------------

function renderDash() {
  $('#dash').innerHTML = `
    <div id="nowCard" class="now"></div>
    <div class="clocks">
      <div class="clock"><span class="label">🇦🇷 Buenos Aires</span><strong id="clkBA"></strong><small id="clkBAhint"></small></div>
      <div class="clock"><span class="label">🇭🇺 Budapest</span><strong id="clkBP"></strong><small id="clkBPhint"></small></div>
    </div>
    <div class="chips">
      <button class="chip primary" id="packToggle">🧳 Pakolási lista <span id="packCount"></span></button>
      <a class="chip" href="#notesSec">📝 Jegyzetek</a>
      <a class="chip" href="#photosAll">📸 Fotók</a>
      <a class="chip" href="#mapSec">🗺️ Útvonal</a>
      <a class="chip" href="#fxSec">💱 Pénzváltó</a>
    </div>
    <div id="packing" class="packing"></div>`;
  $('#packToggle').onclick = () => {
    const p = $('#packing');
    p.classList.toggle('open');
    if (p.classList.contains('open')) p.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  renderPacking();
  tick();
}

function tick() {
  const now = new Date();
  const ba = zoned(now, TZ), bp = zoned(now, 'Europe/Budapest');
  $('#clkBA').textContent = ba.hm;
  $('#clkBP').textContent = bp.hm;
  $('#clkBAhint').textContent = ba.h < 7 ? '😴 valószínűleg alszanak' : ba.h >= 23 ? '🌙 késő este' : '☀️ nappal';
  const diff = Math.round(((bp.h * 60 + bp.m) - (ba.h * 60 + ba.m) + 1440) % 1440 / 60);
  $('#clkBPhint').textContent = `otthon ${diff} órával előrébb`;
  renderNow(now, ba);
}

function renderNow(now, ba) {
  const el = $('#nowCard');
  if (now < TRIP_START) {
    const ms = TRIP_START - now;
    const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
    el.innerHTML = `<div class="k">Visszaszámlálás</div><h3>${d ? d + ' nap ' : ''}${h} óra ${d ? '' : m + ' perc'}</h3><p>…és indulunk: péntek, okt. 9., 14:15 Budapest → Frankfurt → Buenos Aires.</p>`;
    return;
  }
  if (now > TRIP_END) {
    el.innerHTML = '<div class="k">Az út véget ért</div><h3>Itthon vagyunk 🏠</h3><p>A fotók és a jegyzetek itt maradnak emlékbe.</p>';
    return;
  }
  const i = DAYS.findIndex(d => d.date === ba.iso);
  if (i < 0) { el.innerHTML = '<div class="k">Úton</div><h3>Argentina 2026</h3>'; return; }
  const v = dayView(i);
  if (v.tz) ba = zoned(now, v.tz); // e.g. travel day: times are in Budapest time
  const evs = v.events.map(e => ({ e, k: timeKey(e.time) })).filter(x => x.k < 1400);
  const cur = [...evs].reverse().find(x => x.k <= ba.min);
  const nexts = evs.filter(x => x.k > ba.min).slice(0, 2);
  const rows = nexts.map(x => {
    let cd = '';
    if (isClock(x.e.time)) {
      const left = x.k - ba.min;
      cd = left >= 60 ? `${Math.floor(left / 60)} ó ${left % 60} p múlva` : `${left} perc múlva`;
    }
    return `<div class="row"><b>${esc(x.e.time)}</b><span>${esc(x.e.title)}</span><em>${cd}</em></div>`;
  }).join('');
  el.innerHTML = `<div class="k">Most · Day ${v.n} · ${esc(v.city)}</div><h3>${esc(cur ? cur.e.title : v.headline)}</h3><p>${esc(cur ? (cur.e.desc || v.headline) : 'A mai program lent.')}</p>${rows || '<div class="row"><span>Mára nincs több tervezett program. 🍷</span></div>'}${i !== state.current ? `<button onclick="go(${i})">Mai program →</button>` : ''}`;
}

// ---- packing ------------------------------------------------------------------------------

function renderPacking() {
  const st = store.get('trip_packing', {});
  const all = PACKING.flatMap(c => c.items);
  const done = all.filter(t => st[t]).length;
  $('#packCount').textContent = `${done}/${all.length}`;
  $('#packing').innerHTML = `
    <div class="label">Javaslat · okt. 9–20.</div><h2>Pakolási lista</h2>
    <p class="sub">BA tavasz, párás Iguazú, hideg Andok. A pipák ezen a telefonon maradnak meg.</p>
    <div class="progress"><i style="width:${all.length ? done / all.length * 100 : 0}%"></i></div>
    ${PACKING.map(c => `<div class="pcat"><h4>${esc(c.cat)}</h4>${c.items.map(t => `<label class="pitem${st[t] ? ' done' : ''}"><input type="checkbox" data-item="${esc(t)}"${st[t] ? ' checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div>`).join('')}
    <div class="pactions">
      <button class="btn" id="packTxt">⬇ Letöltés (.txt)</button>
      <button class="btn secondary" id="packPrint">🖨 Nyomtatás / PDF</button>
      <button class="btn ghost" id="packReset">Pipák törlése</button>
    </div>`;
  $('#packing').querySelectorAll('input[data-item]').forEach(cb => cb.onchange = () => {
    const s = store.get('trip_packing', {});
    s[cb.dataset.item] = cb.checked;
    store.set('trip_packing', s);
    renderPacking();
  });
  $('#packTxt').onclick = () => {
    const s = store.get('trip_packing', {});
    const txt = 'ARGENTINA 2026 · PAKOLÁSI LISTA\n\n' + PACKING.map(c => c.cat.toUpperCase() + '\n' + c.items.map(t => `${s[t] ? '[x]' : '[ ]'} ${t}`).join('\n')).join('\n\n') + '\n';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain;charset=utf-8' }));
    a.download = 'argentina-2026-pakolasi-lista.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#packPrint').onclick = () => {
    document.body.classList.add('print-packing');
    window.print();
    setTimeout(() => document.body.classList.remove('print-packing'), 500);
  };
  $('#packReset').onclick = () => { if (confirm('Törlöd az összes pipát?')) { store.set('trip_packing', {}); renderPacking(); } };
}

// ---- day page -----------------------------------------------------------------------------

function renderNav() {
  const n = $('#daybar');
  const today = baNow().iso;
  n.innerHTML = DAYS.map((d, i) => `<button class="daybtn${i === state.current ? ' active' : ''}${d.date === today ? ' today' : ''}" onclick="go(${i})">Day ${d.n}<small>${d.date.slice(5).replace('-', '.')}</small></button>`).join('');
  requestAnimationFrame(() => n.children[state.current]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }));
}

function eventHTML(e, isNow) {
  const img = e.img ? `<img src="${IMG(e.img)}" alt="" loading="lazy">` : '';
  const facts = e.facts?.length ? `<div class="facts">${e.facts.map(f => f.href
    ? `<a class="fact" href="${esc(f.href)}" target="_blank" rel="noopener">${esc(f.text)}</a>`
    : `<div class="fact">${esc(f.text)}</div>`).join('')}</div>` : '';
  return `<article class="event${isNow ? ' is-now' : ''}"><div class="etime">${esc(e.time)}</div><span class="dot"></span><div class="event-card">${img}<div class="event-body"><div class="tag">${e.icon || '•'} ${esc(e.type || '')}</div><h3>${esc(e.title)}</h3><p>${esc(e.desc || '')}</p>${e.status ? `<span class="status">${esc(e.status)}</span>` : ''}${facts}</div></div></article>`;
}

function go(i) {
  render(i, { scroll: true });
}

function render(i, { scroll = false } = {}) {
  state.current = i;
  const d = dayView(i);
  if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  history.replaceState(null, '', '#day-' + d.n);
  renderNav();

  $('#eyebrow').textContent = `ARGENTINA 2026 · DAY ${d.n} · ${d.dateLabel}`;
  $('#heroTitle').textContent = d.city;
  $('#heroSub').textContent = d.headline;
  $('#heroImg').src = IMG(d.hero);

  // keep a half-written note across background refreshes
  const draft = { name: $('#noteName')?.value, text: $('#noteText')?.value, focus: document.activeElement?.id };

  const ba = d.tz ? zoned(new Date(), d.tz) : baNow();
  const nowIdx = d.date === baNow().iso ? (() => {
    let idx = -1;
    d.events.forEach((e, k) => { const t = timeKey(e.time); if (t < 1400 && t <= ba.min) idx = k; });
    return idx;
  })() : -1;

  const tr = d.transport?.length ? `<div class="section-title"><div class="k">Transport</div><h2>On the move</h2></div><div class="transport">${d.transport.map(t => `<div class="transport-card"><div><div class="r">${esc(t.route)}</div><div class="t">${esc(t.time)}</div></div><div class="i">${t.icon}</div></div>`).join('')}</div>` : '';
  const liveBadge = API ? (d.live
    ? `<div class="live">Élő a közös táblázatból${state.data?.plan?.fetchedAt ? ' · ' + esc(fmtStamp(state.data.plan.fetchedAt)) : ''}</div>`
    : '<div class="live off">Erre a napra nincs sor a táblázatban</div>') : '';
  const timeline = `<div class="section-title"><div class="k">Today's journey</div><h2>${esc(d.headline)}</h2>${liveBadge}</div><div class="timeline">${d.events.map((e, k) => eventHTML(e, k === nowIdx)).join('')}</div>`;
  const notes = d.notes?.length ? `<div class="section-title"><div class="k">Practical</div><h2>Good to know</h2></div><div class="notes"><ul>${d.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : '';

  const board = `<div class="section-title" id="notesSec"><div class="k">Közös napló</div><h2>Jegyzetek</h2></div>
    <div class="board" id="noteList"></div>
    ${API ? `<form class="noteform" id="noteForm">
      <input id="noteName" placeholder="Neved" maxlength="40" autocomplete="name">
      <textarea id="noteText" placeholder="Mi történt ma? Tipp, élmény, üzenet haza…" maxlength="1000"></textarea>
      <button class="btn" type="submit" id="noteSend">Jegyzet hozzáadása</button>
      <div class="hint">Bárki írhat ide, akinek megvan a link. Telegramból is megy: <b>#jegyzet</b> + szöveg.</div>
    </form>` : '<div class="hint">A közös jegyzetek a háttérszolgáltatás beállítása után működnek.</div>'}`;

  const photos = `<div class="section-title"><div class="k">A nap képekben</div><h2>Fotók</h2></div>
    <div id="dayPhotos"></div>
    <div class="photobar">${API ? `<label class="btn" for="photoInput" style="cursor:pointer">📷 Fotó feltöltése</label><input id="photoInput" type="file" accept="image/*" multiple hidden>` : ''}
      <span class="hint">${API ? 'Vagy küldd a Telegram csoportba – a képek pár percen belül itt lesznek.' : 'A fotógaléria a háttérszolgáltatás beállítása után működik.'}</span></div>`;

  const details = (d.stay || d.food?.length) ? `<div class="section-title"><div class="k">Day details</div><h2>Food & stay</h2></div><div class="grid">${d.stay ? `<div class="info-card"><div class="label">Stay</div><h3>${esc(d.stay)}</h3></div>` : ''}${d.food?.length ? `<div class="info-card"><div class="label">Food</div><h3>Planned / suggestions</h3>${d.food.map(f => `<div class="foodline">🍽️ ${f.href ? `<a href="${esc(f.href)}" target="_blank" rel="noopener">${esc(f.text)}</a>` : esc(f.text)}</div>`).join('')}</div>` : ''}</div>` : '';
  const explore = d.city.includes('Buenos Aires') ? `<button class="exploreBtn" onclick="this.nextElementSibling.classList.toggle('open')">Explore Buenos Aires · extra ötletek</button><div class="explore">${EXPLORE.map(x => `<a class="place" href="${esc(maps(x[0] + ', Buenos Aires'))}" target="_blank" rel="noopener"><b>${esc(x[0])}</b><small>${esc(x[1])}</small></a>`).join('')}</div>` : '';
  const pn = `<div class="prevnext"><button class="nav2 secondary" ${i === 0 ? 'disabled' : ''} onclick="go(${i - 1})">← Előző nap</button><button class="nav2" ${i === DAYS.length - 1 ? 'disabled' : ''} onclick="go(${i + 1})">Következő nap →</button></div>`;

  $('#content').innerHTML = weatherHTML(d) + tr + timeline + notes + board + photos + details + explore + pn;

  if (API) {
    $('#noteName').value = draft.name ?? store.get('trip_name', '');
    if (draft.text) $('#noteText').value = draft.text;
    if (draft.focus === 'noteText' || draft.focus === 'noteName') $('#' + draft.focus).focus();
    $('#noteForm').onsubmit = submitNote;
    $('#photoInput').onchange = e => uploadPhotos([...e.target.files], d.date);
  }
  renderNotes();
  renderDayPhotos();
  highlightMap();
}

// ---- notes --------------------------------------------------------------------------------

const linkify = s => esc(s).replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);

function renderNotes() {
  const el = $('#noteList');
  if (!el) return;
  const date = DAYS[state.current].date;
  const keys = store.get('trip_note_keys', {});
  const list = (state.data?.notes || []).filter(n => n.day === date).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  el.innerHTML = list.length ? list.map(n => `<div class="note"><header><b>${esc(n.name)}</b><span>${esc(ago(n.createdAt))}${n.source === 'telegram' ? ' · Telegram' : ''}</span>${keys[n.id] ? `<button data-del="${esc(n.id)}" aria-label="Törlés">törlés</button>` : ''}</header><p>${linkify(n.text)}</p></div>`).join('')
    : '<div class="empty">Még nincs jegyzet ehhez a naphoz.</div>';
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => deleteNote(b.dataset.del));
}

async function post(body) {
  const r = await fetch(API, { method: 'POST', body: JSON.stringify(body) });
  return r.json();
}

async function submitNote(e) {
  e.preventDefault();
  const name = $('#noteName').value.trim(), text = $('#noteText').value.trim();
  if (!text) return;
  store.set('trip_name', name);
  const key = rand();
  $('#noteSend').disabled = true;
  try {
    const res = await post({ action: 'addNote', day: DAYS[state.current].date, name, text, key });
    if (!res.ok) throw new Error(res.error);
    const keys = store.get('trip_note_keys', {});
    keys[res.note.id] = key;
    store.set('trip_note_keys', keys);
    state.data.notes = [...(state.data.notes || []), res.note];
    store.set('trip_data', state.data);
    $('#noteText').value = '';
    renderNotes();
    toast('Jegyzet elmentve ✓');
  } catch (err) {
    toast('Nem sikerült menteni – próbáld újra.');
  } finally {
    $('#noteSend').disabled = false;
  }
}

async function deleteNote(id) {
  if (!confirm('Törlöd ezt a jegyzetet?')) return;
  const key = store.get('trip_note_keys', {})[id];
  try {
    const res = await post({ action: 'deleteNote', id, key });
    if (!res.ok) throw new Error(res.error);
    state.data.notes = state.data.notes.filter(n => n.id !== id);
    store.set('trip_data', state.data);
    renderNotes();
  } catch {
    toast('Nem sikerült törölni.');
  }
}

// ---- photos -------------------------------------------------------------------------------

function photoSrc(p, w) {
  if (p.local) return p.local;
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(p.driveId)}&sz=w${w}`;
}
function photoImg(p, w) {
  const fb = `https://lh3.googleusercontent.com/d/${encodeURIComponent(p.driveId || '')}=w${w}`;
  return `<img src="${esc(photoSrc(p, w))}" alt="${esc(p.caption || 'Fotó')}" loading="lazy" onerror="this.onerror=null;this.src='${esc(fb)}'">`;
}
const validPhotos = () => (state.data?.photos || []).filter(p => p.local || /^[\w-]+$/.test(p.driveId || ''))
  .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

function renderDayPhotos() {
  const el = $('#dayPhotos');
  if (!el) return;
  const list = validPhotos().filter(p => p.day === DAYS[state.current].date);
  el.innerHTML = list.length
    ? `<div class="carousel">${list.map((p, k) => `<button class="slide" data-k="${k}">${photoImg(p, 1000)}<figcaption><b>${esc(p.name)}</b>${esc(p.caption || '')}</figcaption></button>`).join('')}</div>`
    : '<div class="empty">Ehhez a naphoz még nincs fotó.</div>';
  el.querySelectorAll('.slide').forEach(b => b.onclick = () => openLightbox(list, +b.dataset.k));
  renderGallery();
}

function renderGallery() {
  const el = $('#galleryBody');
  if (!el) return;
  const all = validPhotos();
  if (!all.length) { el.innerHTML = `<div class="empty">${API ? 'Még nincs feltöltött fotó. Küldjétek a Telegram csoportba vagy töltsétek fel a napoknál!' : 'A galéria a háttérszolgáltatás beállítása után működik.'}</div>`; return; }
  const byDay = {};
  all.forEach(p => (byDay[p.day] = byDay[p.day] || []).push(p));
  el.innerHTML = Object.keys(byDay).sort().map(day => {
    const d = DAYS.find(x => x.date === day);
    const label = d ? `Day ${d.n} · ${d.city}` : day;
    return `<div class="gallery-day"><h4>${esc(label)} · ${byDay[day].length} fotó</h4><div class="thumbs">${byDay[day].map((p, k) => `<button data-day="${esc(day)}" data-k="${k}">${photoImg(p, 400)}</button>`).join('')}</div></div>`;
  }).join('');
  el.querySelectorAll('.thumbs button').forEach(b => b.onclick = () => openLightbox(byDay[b.dataset.day], +b.dataset.k));
}

async function resizeImage(file, max = 2000) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return { data: c.toDataURL('image/jpeg', 0.85), w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function uploadPhotos(files, day) {
  if (!files.length) return;
  let name = store.get('trip_name', '');
  if (!name) {
    name = (prompt('Hogy hívnak? (a fotók alatt ez jelenik meg)') || '').trim();
    if (name) store.set('trip_name', name);
  }
  const caption = files.length === 1 ? (prompt('Képaláírás (nem kötelező)') || '').trim() : '';
  let ok = 0;
  for (let k = 0; k < files.length; k++) {
    toast(`Feltöltés ${k + 1}/${files.length}…`, 60000);
    try {
      const { data, w, h } = await resizeImage(files[k]);
      const res = await post({ action: 'addPhoto', day, name, caption, mime: 'image/jpeg', data, width: w, height: h });
      if (!res.ok) throw new Error(res.error);
      state.data.photos = [...(state.data.photos || []), { ...res.photo, local: data }];
      ok++;
      renderDayPhotos();
    } catch (err) {
      console.warn(err);
    }
  }
  store.set('trip_data', { ...state.data, photos: state.data.photos.map(({ local, ...p }) => p) });
  toast(ok === files.length ? `${ok} fotó feltöltve ✓` : `${ok}/${files.length} fotó feltöltve – a többi nem sikerült.`);
  $('#photoInput').value = '';
}

// lightbox
const lb = { list: [], k: 0 };
function openLightbox(list, k) {
  lb.list = list; lb.k = k;
  showLb();
  $('#lightbox').classList.add('open');
}
function showLb() {
  const p = lb.list[lb.k];
  const img = $('#lightbox img');
  img.onerror = () => { img.onerror = null; img.src = `https://lh3.googleusercontent.com/d/${p.driveId}=w2000`; };
  img.src = photoSrc(p, 2000);
  const d = DAYS.find(x => x.date === p.day);
  $('#lightbox .cap').innerHTML = `<b>${esc(p.name)}${d ? ' · Day ' + d.n : ''} · ${lb.k + 1}/${lb.list.length}</b>${esc(p.caption || '')}`;
}
function stepLb(dir) { lb.k = (lb.k + dir + lb.list.length) % lb.list.length; showLb(); }
function closeLb() { $('#lightbox').classList.remove('open'); }
function initLightbox() {
  const el = $('#lightbox');
  el.querySelector('.lbclose').onclick = closeLb;
  el.querySelector('.lbprev').onclick = () => stepLb(-1);
  el.querySelector('.lbnext').onclick = () => stepLb(1);
  el.onclick = e => { if (e.target === el) closeLb(); };
  document.addEventListener('keydown', e => {
    if (!el.classList.contains('open')) return;
    if (e.key === 'Escape') closeLb();
    if (e.key === 'ArrowLeft') stepLb(-1);
    if (e.key === 'ArrowRight') stepLb(1);
  });
  let x0 = null;
  el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', e => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) stepLb(dx < 0 ? 1 : -1);
    x0 = null;
  });
}

// ---- global sections: map, gallery, converter --------------------------------------------

function renderGlobal() {
  $('#global').innerHTML = `
    <div class="section-title" id="photosAll"><div class="k">Az egész út</div><h2>Fotógaléria</h2></div>
    <div id="galleryBody"></div>
    <div class="section-title" id="mapSec"><div class="k">Merre járunk?</div><h2>Útvonal</h2></div>
    <div id="map"></div>
    <div class="legend"><span><i style="background:#c9a95b"></i>a kiválasztott nap</span><span><i style="background:#5aa9cf"></i>állomások</span></div>
    <div class="section-title" id="fxSec"><div class="k">Toolkit</div><h2>Pénzváltó</h2></div>
    <div class="fx">
      <div class="fxrow"><input id="fxAmt" type="number" inputmode="decimal" value="10000" min="0"><select id="fxCur"><option>ARS</option><option>HUF</option><option>EUR</option><option>USD</option></select></div>
      <div class="fxout" id="fxOut"></div>
      <div class="hint" id="fxNote" style="margin-top:10px"></div>
    </div>
    <div class="credits">A program a közös Argentina 2026 táblázatból töltődik. Foglalási kódok és személyes repülési adatok nem jelennek meg. Időjárás: Open-Meteo, naponta kétszer frissítve. ${PHOTO_CREDITS} Térkép © OpenStreetMap.</div>`;
  renderGallery();
  $('#fxAmt').oninput = renderFx;
  $('#fxCur').onchange = renderFx;
  loadFx();
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); initMap(); } }, { rootMargin: '300px' });
  io.observe($('#map'));
}

let map = null, mapMarkers = {};
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
async function initMap() {
  try {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(css);
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js');
  } catch {
    $('#map').innerHTML = '<div class="empty" style="padding:20px">A térkép most nem tölthető be.</div>';
    return;
  }
  map = L.map('map', { scrollWheelZoom: false, attributionControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 12, attribution: '© OpenStreetMap',
  }).addTo(map);
  L.polyline(ROUTE.map(k => STOPS[k].ll), { color: '#5aa9cf', weight: 2.5, dashArray: '6 7', opacity: .8 }).addTo(map);
  Object.entries(STOPS).forEach(([k, s]) => {
    mapMarkers[k] = L.circleMarker(s.ll, { radius: 7, color: '#fff', weight: 2, fillColor: '#5aa9cf', fillOpacity: 1 })
      .bindTooltip(s.name, { permanent: true, direction: k === 'aconcagua' ? 'left' : 'right', offset: [k === 'aconcagua' ? -8 : 8, 0] }).addTo(map);
  });
  map.fitBounds(L.latLngBounds(Object.values(STOPS).map(s => s.ll)), { padding: [30, 30] });
  highlightMap();
}
function highlightMap() {
  if (!map) return;
  const d = DAYS[state.current];
  Object.entries(mapMarkers).forEach(([k, m]) => {
    const on = k === d.loc || k === d.loc2;
    m.setStyle({ fillColor: on ? '#c9a95b' : '#5aa9cf', radius: on ? 11 : 7 });
    if (on) m.bringToFront();
  });
}

async function loadFx() {
  if (!state.fx || Date.now() - state.fx.at > 6 * 3600e3) {
    try {
      const [er, blue] = await Promise.all([
        fetch('https://open.er-api.com/v6/latest/USD').then(r => r.json()),
        fetch('https://dolarapi.com/v1/dolares/blue').then(r => r.json()).catch(() => null),
      ]);
      state.fx = { at: Date.now(), usd: { ARS: er.rates.ARS, HUF: er.rates.HUF, EUR: er.rates.EUR, USD: 1 }, blue: blue?.venta || null };
      store.set('trip_fx', state.fx);
    } catch { /* keep cached */ }
  }
  renderFx();
}
function renderFx() {
  const out = $('#fxOut');
  if (!state.fx) { out.innerHTML = '<div><small>Árfolyam</small><b>nem elérhető</b></div>'; return; }
  const amt = parseFloat($('#fxAmt').value) || 0, from = $('#fxCur').value;
  const usd = amt / state.fx.usd[from];
  const nf = (v, cur) => new Intl.NumberFormat('hu-HU', { maximumFractionDigits: cur === 'ARS' || cur === 'HUF' ? 0 : 2 }).format(v);
  out.innerHTML = ['ARS', 'HUF', 'EUR', 'USD'].filter(c => c !== from).map(c => `<div><small>${c}</small><b>${nf(usd * state.fx.usd[c], c)}</b></div>`).join('');
  const r = state.fx.usd;
  $('#fxNote').textContent = `Hivatalos árfolyam: 1 USD = ${nf(r.ARS, 'ARS')} ARS · 1 EUR = ${nf(r.ARS / r.EUR, 'ARS')} ARS · 1000 ARS ≈ ${nf(1000 / r.ARS * r.HUF, 'HUF')} Ft${state.fx.blue ? ` · „Blue” dollár: ${nf(state.fx.blue, 'ARS')} ARS` : ''}. Készpénzcserénél eltérhet.`;
}

// ---- data loading -------------------------------------------------------------------------

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

function setOffline(on) { $('#offline').classList.toggle('show', on); }

async function refresh() {
  if (API) {
    try {
      const r = await fetch(API + '?action=all', { cache: 'no-store' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      // keep local previews of photos uploaded in this session
      const locals = Object.fromEntries((state.data?.photos || []).filter(p => p.local).map(p => [p.id, p.local]));
      j.photos = (j.photos || []).map(p => (locals[p.id] ? { ...p, local: locals[p.id] } : p));
      state.data = j;
      store.set('trip_data', { ...j, photos: j.photos.map(({ local, ...p }) => p) });
      setOffline(false);
    } catch (err) {
      console.warn('API', err);
      setOffline(!!state.data || !navigator.onLine);
    }
  }
  apply();
  if (!state.weather?.locs || !Object.keys(state.weather.locs).length) {
    state.weather = await directWeather();
  }
  render(state.current);
  renderGallery();
  $('#footerUpdated').textContent = state.data?.plan?.fetchedAt ? 'program frissítve ' + fmtStamp(state.data.plan.fetchedAt) : 'mobile itinerary';
}

function apply() {
  state.data = state.data || { notes: [], photos: [] };
  state.plan = parsePlan(state.data.plan?.rows);
  if (state.data.weather?.locs) state.weather = state.data.weather;
}

function initialDay() {
  const m = location.hash.match(/day-(\d+)/);
  if (m) { const i = DAYS.findIndex(d => d.n === +m[1]); if (i >= 0) return i; }
  const now = new Date();
  if (now < TRIP_START) return 0;
  if (now > TRIP_END) return DAYS.length - 1;
  const i = DAYS.findIndex(d => d.date === baNow().iso);
  return i >= 0 ? i : 0;
}

// ---- boot ---------------------------------------------------------------------------------

apply();
state.weather = state.weather || store.get('trip_wx', null);
renderDash();
renderGlobal();
initLightbox();
render(initialDay());
refresh();
setInterval(tick, 30000);
setInterval(() => { if (!document.hidden) refresh(); }, 3 * 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); refresh(); } });
window.addEventListener('online', () => refresh());
window.addEventListener('offline', () => setOffline(true));
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
