# web/ — web UI

A **kiszolgált** web root a `public/`. A `../server/` Node service szolgálja ki
(auth gate-pel együtt) a `:8080`-on; statikus hosztinggal csak a demo mód megy.

| Útvonal | Mi ez |
| :-- | :-- |
| `public/auth.html` | start / login / register képernyők, hash route: `#/auth`, `#/auth/login`, `#/auth/register` |
| `public/index.html` | bejelentkezés utáni főképernyő: térképválasztás |
| `public/workspace.html` | sensor workspace (élő `/scan` canvas) + a kiválasztott térkép a page-context sávban |
| `public/src/session.js` | `window.Session`: szerver-mód ↔ demo mód, `lidar_auth` / `lidar_backend` hint, `logout()` |
| `public/src/auth.js`, `auth.css` | auth képernyők logikája és stílusa |
| `public/src/maps.js`, `maps-data.js`, `maps.css` | térképkönyvtár, szűrés/rendezés, kiválasztás (`lidar.map`) |
| `public/src/map-storage.js` | `window.MapStorage`: a `lidar.map` közös olvasó/író helperje (térképválasztó + workspace) |
| `public/src/workspace-map.js` | a kiválasztott térkép megjelenítése a workspace page-context sávban |
| `public/src/app.js`, `scan-points.js`, `style.css` | workspace: rosbridge kapcsolat, `/scan` rajzolás |
| `public/js/roslib.min.js` | ROSLIB (vendored, nincs build lépés) |
| `public/assets/` | SVG ikonok, auth illusztrációk |
| `src/` | **elavult 2 soros stub** — nem hivatkozik rá semmi, ne fejlessz ide |
| `mock/` | üres; a demó adat a `public/src/scan-points.js` és `maps-data.js` fájlokban van |

## Helyi futtatás

```bash
cd ../server
AUTH_PORT=8787 AUTH_DB_PATH=/tmp/lidar-dev/auth.db node server.js
# http://127.0.0.1:8787/auth.html#/auth
```

Nincs build, nincs npm dependency, nincs bundler: a böngésző a fájlokat közvetlenül
kapja. Ha új fájlt adsz a `public/`-hoz, ellenőrizd a gate-et is: a `lib/static.js`
csak a `/src/`, `/assets/`, `/js/`, `/mock/` prefixeket engedi nyilvánosan, a `/`,
`/index.html` és `/workspace.html` session mögött van.
