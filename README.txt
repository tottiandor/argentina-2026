ARGENTINA 2026 — TRIP SITE

Élő oldal: GitHub Pages (lásd a repo Settings → Pages linkjét).

Fájlok
- index.html  – oldal + stílus
- app.js      – működés (élő program, időjárás, jegyzetek, fotók, térkép, pénzváltó)
- data.js     – kézzel írt napi adatok, pakolási lista, helyek (tartalék, ha a táblázat nem elérhető)
- config.js   – az Apps Script web app URL-je
- sw.js       – offline működés / főképernyőre tehető app

Háttérszolgáltatás (Google Apps Script): a ../apps-script mappában, SETUP.md szerint.
Az nincs a publikus repóban, mert a táblázat azonosítóját tartalmazza.

Helyi futtatás
Windows: dupla kattintás: start_windows.bat, majd http://localhost:8000
Mac / Linux: ./start_mac_linux.sh, majd http://localhost:8000
Bármely rendszeren Python 3-mal: python -m http.server 8000
Leállítás: Ctrl+C a terminálablakban.
