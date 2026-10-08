// Curated trip data. The live Google Sheet (via the Apps Script backend) overrides
// events / food / stay / flight times per day; everything here is the offline fallback
// plus the hand-made bits the sheet doesn't have (headlines, photos, routes, tips).

const DAYS = [
  // Day 1 times are Budapest / Frankfurt local time (tz below), not Buenos Aires.
  { n: 1, date: '2026-10-09', dateLabel: 'OCT 9 · PÉNTEK', city: 'Úton Argentínába', loc: 'budapest', tz: 'Europe/Budapest', headline: 'Wheels up', hero: 'football',
    transport: [{ icon: '✈️', route: 'Budapest → Frankfurt', time: '14:15' }, { icon: '🌙', route: 'Frankfurt → Buenos Aires · LH510', time: '21:40 → 06:25 (okt. 10., helyi idő)', flight: 'LH510', fdate: '2026-10-09' }],
    events: [
      { time: '14:15', title: 'Indulás Budapestről', type: 'Departure', desc: 'Budapest → Frankfurt. (Az időpontok ezen a napon magyar idő szerint.)', icon: '🛫', keep: true },
      { time: '21:40', title: 'Frankfurt → Buenos Aires', type: 'Night flight', desc: 'Lufthansa LH510, éjszakai repülés (~13 ó 45 p). Érkezés szombaton 06:25-kor Ezeizába (BA idő).', icon: '🌙', keep: true }],
    notes: ['Az éjszakai járaton érdemes aludni: füldugó, szemmaszk, kényelmes ruha.', 'Buenos Aires 5 órával van lemaradva Budapesthez képest.'],
    stay: 'Éjszaka a repülőn ✈️', food: [] },
  { n: 2, date: '2026-10-10', dateLabel: 'OCT 10 · SZOMBAT', city: 'Buenos Aires', loc: 'ba', headline: 'Touchdown, then football', hero: 'ba',
    events: [
      { time: '06:25', title: 'Érkezés Buenos Airesbe (EZE)', type: 'Arrival', desc: 'LH510 landol Ezeizában (menetrend szerint), utána transzfer a szállásra.', icon: '🛬', keep: true },
      { time: 'Délelőtt', title: 'Aklimatizálódás · szállás · chill', type: 'Easy start', desc: 'Laza kezdés, a szállás elfoglalása és regenerálódás az utazás után.', icon: '☕' },
      { time: '19:00', title: 'Találkozó a meccs előtt · Biblos', type: 'Matchday meetup', icon: '🍻', keep: true, replaces: /river|estudiantes|match|meccs/i,
        desc: 'Austen, a meccsnapi házigazdánk (liverpooli, évek óta BA-ben él, maga is River-szurkoló) már 19:00 előtt ott lesz – lehet korábban érkezni. Az első sört ő fizeti! Ital, ha kell kaja, aztán együtt sétálunk át a stadionhoz (kb. 15 perc).',
        facts: [{ text: '📍 Biblos – térkép', href: 'https://maps.app.goo.gl/oyuEh1foUbVyGqib8' }, '🚶 Kb. 15 perc séta az El Monumentalig'] },
      { time: '21:30', title: 'River Plate – Estudiantes de Río Cuarto', type: 'Football · kezdőrúgás', icon: '⚽', img: 'football', keep: true,
        desc: 'El Monumental – Dél-Amerika legnagyobb stadionja. Belépés arcfelismeréssel – mindenki regisztrálva ✅',
        facts: [{ text: '🏟️ Estadio Monumental – térkép', href: 'https://www.google.com/maps/search/?api=1&query=Estadio%20Monumental%2C%20Buenos%20Aires' }, '🎟️ Jegy = arcfelismerés (kész ✅)', '📱 Elég az útlevél fotója a telefonon', '🎒 Lehetőleg táska nélkül'] }],
    notes: [
      'Az útlevélnek elég a fotója a telefonon, a fizikai útlevelet nem kell vinni.',
      'Utazz könnyen: lehetőleg ne legyen nálad táska.',
      'Piros-fehérben gyere, ha tudsz! 🔴⚪️ Kéket és sárgát NE vegyél fel – az a Boca színe.',
    ],
    stay: 'Palermo Hollywood', food: [] },
  { n: 3, date: '2026-10-11', dateLabel: 'OCT 11 · VASÁRNAP', city: 'Buenos Aires', loc: 'ba', headline: 'San Telmo Sunday', hero: 'san_telmo',
    events: [
      { time: 'Délelőtt', title: 'San Telmo · bolhapiac', type: 'Market', desc: 'Vasárnapi San Telmo-program, a bolhapiac miatt kifejezetten erre a napra időzítve.', icon: '🛍️', img: 'san_telmo' },
      { time: 'Délután', title: 'Puerto Madero', type: 'Waterfront', desc: 'Lazább délután a kikötőnegyedben.', icon: '🌆' }],
    notes: ['Puerto Madero éttermei drágábbak lehetnek.'],
    stay: 'Palermo Hollywood', food: [] },
  { n: 4, date: '2026-10-12', dateLabel: 'OCT 12 · HÉTFŐ · ÜNNEP', city: 'Buenos Aires', loc: 'ba', headline: 'Classic Buenos Aires', hero: 'ba',
    events: [
      { time: 'Délelőtt', title: 'Buenos Aires for First-Time Visitors', type: 'City tour', desc: 'Plaza de Mayo · Palacio Barolo · Casa Rosada · Congreso Nacional.', icon: '🏛️' },
      { time: 'Délután', title: 'Puerto Madero', type: 'Waterfront', desc: 'Kikötő rész, chill, kaja.', icon: '🌆' }],
    notes: ['Ünnepnap – érdemes a nyitvatartásokat indulás előtt még egyszer ellenőrizni.'],
    stay: 'Palermo Hollywood', food: [] },
  { n: 5, date: '2026-10-13', dateLabel: 'OCT 13 · KEDD', city: 'Iguazú', loc: 'iguazu', headline: 'One day in the rainforest', hero: 'iguazu',
    transport: [
      { icon: '✈️', route: 'Aeroparque (AEP) → Iguazú · JetSMART JA3148', time: '06:15 → 08:09', flight: 'JA3148', fdate: '2026-10-13' },
      { icon: '✈️', route: 'Iguazú → Aeroparque (AEP) · JetSMART JA3159', time: '20:14 → 22:14', flight: 'JA3159', fdate: '2026-10-13' }],
    events: [{ time: 'Napközben', title: 'Iguazú egynapos kirándulás', type: 'Day trip', desc: 'A konkrét vízesés-program még nincs véglegesítve.', icon: '🌿', img: 'iguazu', status: 'DETAILS COMING SOON' }],
    notes: ['Korai indulás Aeroparque-ról (AEP), nem Ezeizáról: 06:15. Előző este érdemes mindent összekészíteni.', 'A vízesésnél garantáltan elázol: poncsó + vízálló tok a telefonnak.'],
    stay: 'Buenos Aires / visszaérkezés este', food: [] },
  { n: 6, date: '2026-10-14', dateLabel: 'OCT 14 · SZERDA', city: 'Mendoza', loc: 'mendoza', headline: 'Wine country begins', hero: 'vineyard_road',
    transport: [{ icon: '✈️', route: 'Aeroparque (AEP) → Mendoza · JetSMART JA3082', time: '06:00 → 07:59', flight: 'JA3082', fdate: '2026-10-14' }],
    events: [
      { time: '13:00', title: 'Zonda · 6 fogásos menü', type: 'Lunch reservation', desc: 'Hatfogásos ebéd, foglalással.', icon: '🍽️', img: 'vineyard_wine' },
      { time: '16:00', title: 'Bodega Carmelo Patti', type: 'Wine tasting', desc: 'Délutáni borkóstoló.', icon: '🍷', img: 'grapes' }],
    notes: ['Korai repülés Aeroparque-ról (AEP): 06:00-s indulás.', 'A nap feszes: érkezés után ebéd, majd 16:00-kor borkóstoló.'],
    stay: 'Mendoza · TBC', food: ['Ebéd: Mercado Central', 'Ital: Gran Vermuteria', 'Rooftop: Gómez', 'Vacsoraötlet: Centauro', 'Vacsoraötlet: Los Toneles / Abrasado'] },
  { n: 7, date: '2026-10-15', dateLabel: 'OCT 15 · CSÜTÖRTÖK', city: 'Mendoza', loc: 'mendoza', headline: 'A slower Mendoza day', hero: 'vineyard_sunset',
    events: [
      { time: 'Reggel', title: 'Reggeli · La Vene / Monono', type: 'Breakfast idea', desc: 'Két reggeli opció.', icon: '🥐', img: 'vineyard_sunset' },
      { time: 'Napközben', title: 'Szabad program', type: 'Open day', desc: 'Ide később kerülhet borászat, városnézés vagy pihenés.', icon: '✨', status: 'OPEN', keep: true }],
    notes: ['Ez a legnyitottabb mendozai nap.'],
    stay: 'Mendoza · TBC', food: ['Reggeli: La Vene / Monono'] },
  { n: 8, date: '2026-10-16', dateLabel: 'OCT 16 · PÉNTEK', city: 'Mendoza / Aconcagua', loc: 'mendoza', loc2: 'aconcagua', headline: 'Mountain to vineyard', hero: 'aconcagua',
    events: [
      { time: '08:30', title: 'Aconcagua túra', type: 'Adventure', desc: 'Egész napos túra az Andokba. A transzfer a szállásnál vesz fel.', icon: '⛰️', img: 'aconcagua', facts: ['🚐 Pickup a szállásnál', '💵 400 000 ARS készpénz'] },
      { time: '19:00', title: 'Viamonte Sunset', type: 'Wine · Sunset', desc: 'Naplementés borászati program.', icon: '🍷', img: 'vineyard_sunset' }],
    notes: ['Az Aconcagua túrához 400 000 ARS készpénz kell.', 'Fent (~2700 m) hideg és szeles lehet: réteges ruha, sapka, napszemüveg, naptej.'],
    stay: 'Mendoza · TBC', food: [] },
  { n: 9, date: '2026-10-17', dateLabel: 'OCT 17 · SZOMBAT', city: 'Buenos Aires', loc: 'ba', headline: 'Back to BA', hero: 'ba',
    transport: [{ icon: '✈️', route: 'Mendoza → Aeroparque (AEP) · JetSMART JA3067', time: '08:22 → 10:01', flight: 'JA3067', fdate: '2026-10-17' }],
    events: [
      { time: 'Délelőtt', title: 'Állatkert · Japánkert', type: 'Green Buenos Aires', desc: 'Visszaérkezés után könnyebb városi program.', icon: '🌿' },
      { time: 'Info', title: 'A Racing-meccs vasárnap lesz', type: 'Football', desc: 'Nem ma: okt. 18., vasárnap 14:45, Avellaneda (lásd Day 10).', icon: '⚽', keep: true, replaces: /racing|independiente/i }],
    notes: ['Reggeli repülés Mendozából.'],
    stay: 'Palermo Soho', food: ['Don Julio · best steak'] },
  { n: 10, date: '2026-10-18', dateLabel: 'OCT 18 · VASÁRNAP', city: 'Buenos Aires', loc: 'ba', headline: 'Recoleta & football', hero: 'recoleta',
    events: [
      { time: '11:00', title: 'Recoleta Cemetery tour', type: 'Guided tour', desc: 'Temetőtúra Recoletában.', icon: '🏛️', img: 'recoleta' },
      { time: '14:45', title: 'Racing Club – Independiente', type: 'Football · Clásico de Avellaneda', icon: '⚽', keep: true, replaces: /racing|independiente/i,
        desc: 'Az avellanedai rangadó a Racing stadionjában (Estadio Presidente Perón, „El Cilindro”). Torneo Clausura, 13. forduló – a Liga Profesional által megerősített kezdés.',
        facts: [{ text: '🏟️ Estadio Presidente Perón, Avellaneda – térkép', href: 'https://www.google.com/maps/search/?api=1&query=Estadio%20Presidente%20Per%C3%B3n%2C%20Avellaneda' }, '🩵 Racing: égszínkék-fehér · kerüld a pirosat (Independiente)'] }],
    notes: ['A temetőbe külön jegyet kell venni.', 'Szoros délelőtt: a Recoleta-túra 11:00-kor indul, a meccs 14:45-kor kezdődik Avellanedában – a túra után érdemes rögtön indulni.'],
    stay: 'Palermo Soho', food: ['Don Julio · best steak'] },
  { n: 11, date: '2026-10-19', dateLabel: 'OCT 19 · HÉTFŐ', city: 'Buenos Aires', loc: 'ba', headline: 'Last morning in BA', hero: 'ba',
    events: [
      { time: 'Délelőtt', title: 'Buenos Aires · 12:00-ig', type: 'Last hours', desc: 'Utolsó délelőtt Buenos Airesben.', icon: '☕' },
      { time: 'Később', title: 'Indulás haza', type: 'Departure', desc: 'Irány a reptér és haza.', icon: '✈️', keep: true }],
    notes: [],
    stay: 'Palermo Soho · check-out nap', food: [] },
  { n: 12, date: '2026-10-20', dateLabel: 'OCT 20 · KEDD', city: 'Hazautazás', loc: 'budapest', headline: 'Homebound', hero: 'andes',
    events: [{ time: 'Utazás', title: 'Átszállás · Budapest', type: 'Travel home', desc: 'A hazautazás második napja.', icon: '✈️', keep: true }],
    notes: [], stay: null, food: [] },
];

const IMG = k => `img/${k}.jpg`;

// Banners at the top of the page until their deadline.
const ALERTS = [];

// Keyword → photo / icon / type for events that come from the sheet.
const EVENT_STYLE = [
  { re: /meccs|match|racing|river|boca juniors|independiente|estudiantes/i, icon: '⚽', type: 'Football' },
  { re: /aconcagua/i, icon: '⛰️', type: 'Adventure', img: 'aconcagua' },
  { re: /viamonte|sunset|naplemente/i, icon: '🍷', type: 'Wine · Sunset', img: 'vineyard_sunset' },
  { re: /bodega|borkóst|borász|wine/i, icon: '🍷', type: 'Wine tasting', img: 'grapes' },
  { re: /zonda|étterem|asado|ebéd|vacsora|reggeli/i, icon: '🍽️', type: 'Food', img: 'vineyard_wine' },
  { re: /recoleta|temető/i, icon: '🏛️', type: 'Guided tour', img: 'recoleta' },
  { re: /san te[lm]{2}o|bolha/i, icon: '🛍️', type: 'Market', img: 'san_telmo' },
  { re: /iguaz/i, icon: '🌿', type: 'Day trip', img: 'iguazu' },
  { re: /la boca/i, icon: '🎨', type: 'Tour' },
  { re: /first-time|city tour|plaza de mayo|casa rosada/i, icon: '🏛️', type: 'City tour' },
  { re: /puerto madero|kikötő/i, icon: '🌆', type: 'Waterfront' },
  { re: /állatkert|kert|garden|botanik/i, icon: '🌿', type: 'Green Buenos Aires' },
  { re: /aklimat|chill|pihen/i, icon: '☕', type: 'Easy start' },
  { re: /szállás/i, icon: '🛏️', type: 'Stay' },
  { re: /túra|tour/i, icon: '🧭', type: 'Tour' },
];

// Extra info for bookings that the sheet only names briefly (matched on name + address of a timed "Kaja" line).
const BOOKING_INFO = [
  { re: /cabrera\s*4304/i, title: 'Rooftop asado · Airbnb Experience', type: 'Vacsora · Airbnb élmény',
    desc: 'Asado-vacsora egy tetőteraszon Palermóban.', img: 'places/th_asado' },
];

// Known places → search text for a Google Maps link.
const PLACES = [
  { re: /zonda/i, q: 'Zonda Cocina de Paisaje, Mendoza' },
  { re: /carmelo patti/i, q: 'Bodega Carmelo Patti, Luján de Cuyo' },
  { re: /viamonte/i, q: 'Bodega Viamonte, Mendoza' },
  { re: /don julio/i, q: 'Parrilla Don Julio, Buenos Aires' },
  { re: /la cabrera/i, q: 'La Cabrera, José A. Cabrera 5099, Buenos Aires' },
  { re: /san te[lm]{2}o/i, q: 'Feria de San Telmo, Buenos Aires' },
  { re: /puerto madero/i, q: 'Puerto Madero, Buenos Aires' },
  { re: /la boca/i, q: 'Caminito, La Boca, Buenos Aires' },
  { re: /recoleta/i, q: 'Cementerio de la Recoleta, Buenos Aires' },
  { re: /állatkert/i, q: 'Ecoparque Buenos Aires' },
  { re: /japan|japán/i, q: 'Jardín Japonés, Buenos Aires' },
  { re: /mercado central/i, q: 'Mercado Central, Mendoza' },
  { re: /gran vermuteria/i, q: 'Gran Vermutería, Mendoza' },
  { re: /gómez/i, q: 'Gómez Rooftop, Mendoza' },
  { re: /la vene/i, q: 'La Vene, Mendoza' },
  { re: /monono/i, q: 'Monono, Mendoza' },
  { re: /centauro/i, q: 'Centauro, Mendoza' },
  { re: /los toneles/i, q: 'Los Toneles, Mendoza' },
  { re: /abrasado/i, q: 'Abrasado, Mendoza' },
  { re: /iguaz/i, q: 'Parque Nacional Iguazú' },
  { re: /river plate|monumental/i, q: 'Estadio Monumental, Buenos Aires' },
];

// Route map stops (for families at home).
const STOPS = {
  ba:        { name: 'Buenos Aires', ll: [-34.6037, -58.3816] },
  iguazu:    { name: 'Iguazú', ll: [-25.6953, -54.4367] },
  mendoza:   { name: 'Mendoza', ll: [-32.8895, -68.8458] },
  aconcagua: { name: 'Aconcagua', ll: [-32.8247, -69.9097] },
};
const ROUTE = ['ba', 'iguazu', 'ba', 'mendoza', 'aconcagua', 'mendoza', 'ba'];

const PACKING = [
  { cat: 'Papírok & pénz', items: [
    'Útlevél (min. 6 hónapig érvényes)',
    'Útlevél fotó a telefonon (a River-meccsre is ez kell) + papírmásolat',
    'Repjegyek, beszállókártyák offline is',
    'Utasbiztosítás adatai',
    '2 bankkártya, külön helyen tárolva',
    'Készpénz USD/EUR (tiszta, új bankjegyek)',
    '400 000 ARS készpénz az Aconcagua túrához',
    'Meccsjegyek / foglalások screenshotja',
  ] },
  { cat: 'Ruha', items: [
    'Réteges öltözet (BA 12–19°, Mendoza éjjel 8° körül)',
    'Meleg pulóver vagy pehelykabát az Aconcagua túrára (~2700 m)',
    'Sapka + vékony kesztyű a hegyre',
    'Könnyű, vízálló esőkabát / poncsó (BA szitálás, Iguazú vízpára)',
    'Rövidnadrág, gyorsan száradó póló Iguazúra (26° körül, párás)',
    'Kényelmes sétacipő',
    'Szandál vagy cipő, ami ázhat (Iguazú)',
    'Egy csinosabb szett a Zonda ebédhez / vacsorákhoz',
    'Piros-fehér ruha a River-meccsre – kék-sárga semmiképp (Boca)!',
  ] },
  { cat: 'Egészség', items: [
    'Naptej (az Andokban erős az UV)',
    'Napszemüveg',
    'Szúnyogriasztó (Iguazú)',
    'Ajakbalzsam (száraz, magashegyi levegő)',
    'Saját gyógyszerek + fejfájás-, hasfogó- és allergia elleni szer',
    'Sebtapasz, kézfertőtlenítő',
  ] },
  { cat: 'Tech', items: [
    'Konnektor-adapter (Argentína: I és C típus)',
    'Powerbank (csak kézipoggyászban!)',
    'Töltők, kábelek',
    'eSIM / roaming beállítva',
    'Offline Google Maps: Buenos Aires, Mendoza, Iguazú',
    'Elég tárhely a telefonon a fotókhoz',
    'Vízálló telefontok (Iguazú)',
  ] },
  { cat: 'Apróságok', items: [
    'Kis hátizsák napi programokra',
    'Kulacs',
    'Füldugó + szemmaszk a hosszú éjszakai repüléshez',
    'Kis lakat a csomagra',
    'Néhány zacskó a vizes/koszos holmikhoz',
  ] },
];
