# Auth / login startpage — implementáció

A web UI elé kerülő auth réteg: belépő (Start), bejelentkező (Login) és
regisztrációs (Register) képernyő, a dashboard pedig bejelentkezés nélkül nem
nyílik meg. Két módban működik:

- **Server mód** (ajánlott): a `server/` Node szolgáltatás adja a valódi,
  szerveroldali sessiont (SQLite + scrypt + HttpOnly cookie), és a védett
  oldalakat is ő gate-eli. Részletek: [`server/README.md`](../server/README.md).
- **Statikus demó** (fallback): nincs backend, a session kliensoldali, csak
  UX-kapu.

Terv: [`docs/auth-startpage-plan.md`](auth-startpage-plan.md) (v2, `web-ui-init`),
backend terv: [`docs/auth-backend-plan.md`](auth-backend-plan.md).

---

## ⚠️ Biztonsági nyilatkozat

**Statikus demó** (pl. `python3 -m http.server` a `web/public`-on): a session
kliensoldali, ezért **nem biztonsági kontroll**, csak demo/UX kapu:

- bárki megnyithatja az `index.html`-t letiltott JavaScripttel;
- a `localStorage` / `sessionStorage` kézzel szerkeszthető;
- a session csak e-mailt, nevet és időbélyegeket tartalmaz (jelszót soha).

**Server mód** (`server/`, `lidar-auth.service`): a valódi kapu a szerveroldali,
HttpOnly `lidar_session` cookie és az SQLite session tábla. A jelszó scrypt
hash-ként tárolódik, a token csak SHA-256 hash-ként, rate limit és CSRF
ellenőrzés védi a POST-okat. A kliensoldali session ilyenkor csak UX-hint.

TLS továbbra sincs: a service megbízható LAN-ra készült. HTTPS-hez reverse proxy
(Nginx) és `COOKIE_SECURE=1` kell.

---

## Fájlok

```text
web/public/
├── auth.html                     # a három nézet egy fájlban (hash routing)
├── index.html                    # Map Selection főképernyő + inline demo guard
├── workspace.html                # Sensor Workspace dashboard + guard + Sign out + térkép-kontextus
├── assets/auth-sensor-preview.svg  # statikus LiDAR preview (Figma export)
├── assets/icons/*.svg            # a főképernyő Figma ikonjai
└── src/
    ├── style.css                 # tokenek (--accent-ink), sign-out, noscript banner
    ├── auth.css                  # auth layout + form komponensek
    ├── maps.css                  # Map Selection layout
    ├── maps-data.js              # demo térképkönyvtár (geometria + metaadat)
    ├── map-storage.js            # a `lidar.map` közös olvasó/író helperje (map selection + workspace)
    ├── maps.js                   # kiválasztás, keresés, szűrés, renderelés
    ├── workspace-map.js          # a kiválasztott térkép a workspace page-context sávban
    ├── session.js                # window.Session storage helperek + backend detektálás
    ├── auth.js                   # router, validáció, server/demo ág
    └── app.js                    # demo mód visszaolvasás + sign out

server/                           # zero-dependency Node auth service + static host
├── server.js                     # belépési pont
├── app.js                        # API router + static gate
├── lib/                          # config, db, users, passwords, sessions,
│                                 # cookies, validate, ratelimit, security, static, http, log
├── bin/users.js                  # admin CLI (add, list, passwd, remove, backup)
└── test/                         # node:test unit + API tesztek

deploy/
├── systemd/lidar-auth.service    # a Node service unitja (8080)
├── systemd/webui.service         # statikus demó fallback (python, 8080)
├── lidar-auth.env.example        # /etc/lidar-auth.env minta
└── lidar-auth-users.sh           # admin CLI wrapper a Pi-n
```

Nincs build és nincs npm dependency: a frontend statikusan tölthető, a backend
csak a Node beépített moduljait használja (`node:http`, `node:sqlite`,
`node:crypto`), Node >= 22.16 alatt.

Helyi futtatás szerver móddal:

```bash
cd lidar-robot/server
AUTH_PORT=8787 node server.js
# http://127.0.0.1:8787/auth.html#/auth
```

---

## Route-ok

| Hash | Nézet | Megjegyzés |
| :--- | :--- | :--- |
| `#/auth` (vagy üres hash) | Start | alapértelmezett; `history.replaceState` normalizálja |
| `#/auth/login` | Login | deep linkelhető, refresh-safe |
| `#/auth/register` | Register | deep linkelhető, refresh-safe |
| bármi más | Start | fallback + `replaceState` `#/auth`-ra |

- A router `hashchange`-re és betöltéskor fut; a nézetváltás `hidden`
  attribútummal történik (2 intro + 3 panel).
- Nézetváltás után a látható panel `<h2>`-je kap fókuszt (`tabindex="-1"`),
  a `document.title` és a header/page-context/footer szövegek a view configból
  frissülnek.
- Belépés/regisztráció után `location.replace("index.html")`, hogy a Back ne
  vigyen vissza az űrlapra. Az `index.html` a **Map Selection** főképernyő; a
  dashboard onnan nyílik (`workspace.html`).

---

## Session séma

```js
// localStorage["lidar.session"] VAGY sessionStorage["lidar.session"]
{
  "v": 1,
  "email": "alex.morgan@robotics.io",
  "name": "Alex Morgan",        // login: az email local-partja
  "createdAt": 1730000000000,
  "expiresAt": 1730604800000,   // remember: +7 nap; egyébként +24 óra
  "remember": true
}
```

A storage kulcsai:

| Kulcs | Tartalom |
| :--- | :--- |
| `lidar.session` | session objektum (a fenti séma) |
| `lidar.demoMode` | `"1"` (demo/mock) vagy `"0"` (live) |

- **Remember me be:** `localStorage`, 7 nap.
- **Remember me ki:** `sessionStorage`, tab élettartam, legfeljebb 24 óra.
- `getSession()` mindkét storage-ból olvas, a lejártat törli, és ha mindkettőben
  van érvényes, a **későbbi `expiresAt`-űt** adja vissza.
- `setSession()` a cél storage-ba ír, a másikból töröl.
- `clearSession()` mindkettőt törli.
- Storage hozzáférés mindenhol `try/catch`-ben; ha a böngésző tiltja (privát mód),
  a `setSession()` `false`-t ad, és az űrlap látható hibát mutat:
  „Your browser blocked storage. Allow site data or leave private mode to sign in.”

### Session API (`window.Session`)

| Függvény | Leírás |
| :--- | :--- |
| `getSession()` | érvényes lokális session vagy `null` |
| `setSession(data, remember)` | írás; `false` storage hiba esetén |
| `clearSession()` | mindkét storage törlése |
| `isAuthenticated()` | `!!getSession()` |
| `requireAuth()` | nincs session → `location.replace("auth.html#/auth")` |
| `getDemoMode()` / `setDemoMode(v)` | demo mód, default `true` |

### Server mód (a `server/` service-szel)

A mód detektálása: a `session.js` csak akkor hívja a `GET /api/auth/health`-et,
ha a `lidar_backend=1` marker cookie jelen van, és csak akkor vált server módra,
ha a válasz `service === "lidar-auth"`. Marker nélkül a statikus demó marad.

| Cookie | HttpOnly | Tartalom |
| :--- | :---: | :--- |
| `lidar_session` | igen | nyers session token (32 byte base64url); a DB csak SHA-256 hash-t tárol |
| `lidar_auth` | nem | `1` hint, hogy a frontend guard tudja: van server session |
| `lidar_backend` | nem | `1` marker, 1 nap; minden válaszon frissül |

Session hossz: remember be → 7 nap (cookie `Max-Age` + DB), ki → 24 óra és
böngésző-session cookie. A lejárat **abszolút**, nincs sliding; felhasználónként
legfeljebb 10 session, a legrégebbi kiesik. A DB session rekord a token
SHA-256 hash-jét tárolja, a nyers token csak a cookie-ban van.

API (minden válasz JSON, `no-store`):

| Metódus | Útvonal | Leírás |
| :--- | :--- | :--- |
| `GET`/`HEAD` | `/api/auth/health` | `{service:"lidar-auth",status:"ok",version,time}` |
| `POST` | `/api/auth/register` | `{name,email,password,consent}` → `201 {user}` |
| `POST` | `/api/auth/login` | `{email,password,remember}` → `200 {user}` |
| `GET`/`HEAD` | `/api/auth/session` | `{authenticated,user?,expiresAt?}` |
| `POST` | `/api/auth/logout` | idempotens `200 {ok:true}` |

Hibakódok, amiket a UI kezel: `400 validation_error` (mezőhibák), `401 invalid_credentials`, `403 registration_disabled`, `403 forbidden_origin`, `409 email_taken`, `413 payload_too_large`, `415 unsupported_media_type`, `429 rate_limited` + `Retry-After`, `500 internal_error`.

A védett oldalakat (`/`, `/index.html`, `/workspace.html`) a **szerver** gate-eli:
session nélkül `302 /auth.html#/auth`. Az `auth.html` session + `lidar_auth` hint
mellett `302 /`-re irányít. A statikus fájlok (`/src/*`, `/assets/*`, `/js/*`,
`/mock/*`) nyilvánosak. Részletek: [`server/README.md`](../server/README.md).

---

## Dashboard guard (`index.html`, `workspace.html`)

A `<head>`-ben futó, önálló inline script a body festése előtt ellenőrzi a
sessiont, és érvénytelen/lejárt session esetén `auth.html#/auth`-ra irányít.
Ugyanez a guard fut a főképernyőn (`index.html`) és a dashboardon
(`workspace.html`) is.

- A kapu a `localStorage` / `sessionStorage` session; a guard UX, nem
  biztonsági kontroll.
- A guard **szándékosan nem függ** a `session.js`-től (ha az 404, akkor is működik),
  ezért a séma duplikált: a kulcs/séma változásakor **mindkét helyet** frissíteni kell.
- A kritikus CSS inline: `html.auth-pending body { visibility: hidden; }`, hogy ne
  villanjon fel a dashboard. A `<noscript>` látható marad
  (`html.auth-pending noscript { visibility: visible; }`), és egy bannert mutat.
- Érvényes session esetén az `auth.html` a `<head>`-ben azonnal `index.html`-re
  irányít (nincs login-villanás).

---

## Interakciók

### Login

| Mező | Szabály | Hibaüzenet |
| :--- | :--- | :--- |
| Email | nem üres, érvényes formátum | `Enter your email address.` / `Enter a valid email address.` |
| Password | nem üres | `Enter your password.` |

Backend nélkül (statikus demó) **nincs „hibás jelszó” állapot**: bármely
érvényes formátumú email + bármilyen nem üres jelszó belép. A demo jelleget a
footer `DEMO SESSION` sora és a panel alatti megjegyzés kommunikálja.

Server módban a `POST /api/auth/login` válasza dönt: `200` → belépés,
`401 invalid_credentials` → „Invalid email or password.”, `429` → a `Retry-After`
alapján „Too many attempts. Try again in N seconds.”, `400` → mezőhibák. Ha a
`lidar_backend` marker megvan, de a health check nem válaszol, a UI
`SERVICE_ERROR`-t mutat, és **nem** esik vissza demó loginra (biztonsági döntés).

### Register

| Mező | Szabály | Hibaüzenet |
| :--- | :--- | :--- |
| Full name | trim után ≥ 2 karakter | `Enter your name.` |
| Email | érvényes formátum | `Enter your email address.` / `Enter a valid email address.` |
| Password | ≥ 12 karakter, ≥ 1 szám, ≥ 1 szimbólum | `Use at least 12 characters, including a number and a symbol.` |
| Confirm | egyezik | `Re-enter your password.` / `Passwords do not match.` |
| Consent | kötelező | `Accept the Terms of Service and Privacy Policy to continue.` |

Sikeres regisztráció után azonnali belépés (`localStorage`, 7 nap).

> A consent checkbox a **demóban alapból bejelölve** van, mert a Figma minta a
> kitöltött állapotot mutatja. Éles bevezetésnél alapból **kikapcsolt** legyen.

### Jelszó-erősség (4 szegmens)

| Pont | Szegmens | Felirat | Szín |
| :--- | :--- | :--- | :--- |
| 0 | 0 | – (rejtett) | `--border` |
| 1 | 1 | `WEAK` | `--amber` |
| 2 | 2 | `FAIR` | `--amber` |
| 3 | 3 | `GOOD` | `--accent` |
| 4 | 4 | `STRONG` | `--accent` |

A vizuális szegmensek `aria-hidden`-ek, a felirat `role="status"` +
`aria-live="polite"`. A meter nem blokkolja a gépelést; a beküldést a fenti
szabály ellenőrzi.

### Stub elemek

- `Forgot password?`: fókuszálható `aria-disabled` button; kattintásra
  „Password recovery is not available in this demo.” üzenet.
- `Terms of Service` / `Privacy Policy`: `aria-disabled` link stub; kattintásra
  „Not available in this demo”, és **nem** kapcsolja a checkboxot (a linkek a
  `<label>`-en kívül vannak).

### Kijelentkezés

A dashboard headerében ghost `Sign out` gomb: `Session.clearSession()` +
hint törlés, majd `Session.logout()` (server módban `POST /api/auth/logout`,
401 esetén is sikeresnek tekintve), végül `auth.html#/auth`. Megerősítő
dialógus nincs. A demo mód (`lidar.demoMode`) kijelentkezéskor **megmarad**.

---

## Reszponzív viselkedés

| Viewport | Layout | Preview | Capabilities |
| :--- | :--- | :--- | :--- |
| ≥ 1440 px | 600 / 104 / 480, `padding: 24px 128px 48px` | látható | látható |
| 1200–1439 px | `minmax(0,600px)` / 64 / 480, padding 48 | arányosan skálázódik | látható |
| 1024–1199 px | `minmax(0,1fr)` / 48 / 480 | elrejtve | látható |
| ≤ 1023 px | egy oszlop, max 480, hero a form fölött, `min-height: 0` | elrejtve | elrejtve |
| ≤ 620 px | egy oszlop, panel padding 24, headline 32 px, hero description rejtve | elrejtve | elrejtve |

A `min-height: 800px` csak ≥1024 px-en érvényes.

---

## Asset újragenerálás

**Preview SVG** (`assets/auth-sensor-preview.svg`):

1. Figma fájl: <https://www.figma.com/design/9FySk0KrG1FfdGGjWj8nPN/Untitled?node-id=26-3>
2. Exportáld a `Sample sensor preview` → `Illustrative point cloud` viewportot
   (`29:3407`, Login) SVG-ként, 600 × 350 méretben.
3. `svgo --multipass` (a méret ~58 KB → ~35 KB).
4. A `.figma-images/` csak lokális referencia (gitignore), a repóba csak a
   kész asset kerül.

**Ikonok:** a `auth.html` tetején inline `<symbol>` sprite-ban vannak
(`<use href="#i-...">`, `stroke="currentColor"`, 1 px stroke, round cap).
A path-ok a Figma vektor-node-okból származnak; minden mérethez külön symbol
tartozik (pl. `i-radar-24`, `i-radar-18`, `i-radar-14`).

Az `eye` ikon az `eye-off` path slash nélküli változata (az utolsó subpath
elhagyásával), ezért nincs külön asset.

**Figma temporary URL nem maradhat a kódban** (`figma.com/api/mcp/asset/...`).

---

## Ismert korlátok / nyitott pontok

- A statikus demó session megkerülhető; server módban a szerveroldali gate véd
  (lásd a biztonsági nyilatkozatot).
- A 9–11 px-es label-ek kicsik; a `--text-dim` a legkisebb kontraszt (AA-n átmegy).
- A `Forgot password?` stub; a jelszó-reset jelenleg admin CLI
  (`bin/users.js passwd`), e-mail alapú reset nincs.
- Nincs profil / fióktörlés UI, nincs 2FA/OAuth/meghívás; a fiókokat a CLI kezeli.
- A `rosbridge` (9090) és a Node-RED (1880) nincs a session mögé téve.
- A consent pre-checked a demóban (élesben unchecked).
- `axe-core` egyetlen `region` (moderate) jelzést ad: a `page-context` sor
  (breadcrumb + Documentation link) landmarkon kívül van, mert a terv
  `<header>` / `<main>` / `<footer>` vázat ír elő. Ha kell, egy
  `<section aria-label="Page context">` wrapperrel megszüntethető.
- A Figma nem tartalmaz mobil layoutot: a breakpointok design-döntések.
- 390 × 844 px-en a hero a form fölött van (terv szerint), ezért a `Log in` gomb
  a fold aljára esik; 320 px-en görgetéssel érhető el.
