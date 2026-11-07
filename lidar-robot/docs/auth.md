# Auth / login startpage — implementáció

A web UI elé kerülő **demo auth réteg**: belépő (Start), bejelentkező (Login) és
regisztrációs (Register) képernyő, a dashboard pedig bejelentkezés nélkül nem
nyílik meg.

Terv: [`docs/auth-startpage-plan.md`](auth-startpage-plan.md) (v2, `web-ui-init`).

---

## ⚠️ Biztonsági nyilatkozat

A **statikus demo** (a Pi-n futó `web/public`) sessionje kliensoldali, ezért
**nem biztonsági kontroll**, csak demo/UX kapu:

- bárki megnyithatja az `index.html`-t letiltott JavaScripttel;
- a `localStorage` / `sessionStorage` kézzel szerkeszthető;
- a session csak e-mailt, nevet és időbélyegeket tartalmaz (jelszót soha).

Valódi védelemhez szerveroldali megoldás kell. Ez a repóban **már megvan** a
[`server/`](../server/README.md) alatt (Node.js + SQLite + scrypt + HttpOnly
cookie + rate limit), de az a szolgáltatás **csak a fejlesztői gépen fut**, a
Raspberry Pi-re ebből a feladatból nem került ki semmi. A Pi-n továbbra is a
statikus, kliensoldali demo működik.

A részletes backend dokumentáció: [`server/README.md`](../server/README.md).

---

## Fájlok

```text
web/public/
├── auth.html                     # a három nézet egy fájlban (hash routing)
├── index.html                    # dashboard + inline demo guard + Sign out
├── assets/auth-sensor-preview.svg  # statikus LiDAR preview (Figma export)
└── src/
    ├── style.css                 # tokenek (--accent-ink), sign-out, noscript banner
    ├── auth.css                  # auth layout + form komponensek
    ├── session.js                # window.Session storage helperek + API mód
    ├── auth.js                   # router, validáció, session írás, server/demo mód
    └── app.js                    # demo mód visszaolvasás + sign out

server/                           # ÚJ, local-only backend (nem a Pi-n fut)
├── server.js                     # HTTP szerver + /api/auth/* + static gate
├── lib/                          # db, scrypt, session, rate limit, validáció
└── test/                         # node:test unit + integrációs tesztek
```

Nincs build, nincs npm dependency a fronthoz: a fájlok statikusan tölthetők
(`python3 -m http.server 8080` vagy Nginx). A backendhez Node.js >= 22.5 kell
(a beépített `node:sqlite` miatt), de külső npm csomag ahhoz sem kell.

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
  vigyen vissza az űrlapra.

---

## Session séma

### Static demo mód (Pi)

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

### Server mód (helyi backend)

A valódi session egy **HttpOnly** `lidar_session` cookie, amelyet JS nem tud
olvasni. A localStorage fenti objektuma ilyenkor csak UX-hintként íródik, hogy
a dashboard inline guardja ne villantson auth oldalt. A `lidar_auth=1`
olvasható hint cookie a redirect loop ellen véd; a `lidar_backend=1` marker
jelzi, hogy valódi API van. A szerver a `GET /` és `GET /index.html` kéréseket
session nélkül `302 → /auth.html#/auth`-ra irányítja, tehát a valódi kapu a
szerveroldalon van.

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
| `isAuthenticated()` | `!!getSession()` (server módban ez csak hint) |
| `requireAuth()` | nincs session/hint → `location.replace("auth.html#/auth")` |
| `getDemoMode()` / `setDemoMode(v)` | demo mód, default `true` |
| `hasBackend()` | `lidar_backend=1` marker cookie olvasása |
| `hasServerHint()` | `lidar_auth=1` hint cookie olvasása |
| `detectBackend()` | `GET /api/auth/health` (csak marker cookie-val; cache-elt) |
| `api(path, body, opts)` | JSON POST helper, `{ok, status, data, retryAfter}` |
| `logout()` | `POST /api/auth/logout` + hint törlés |
| `clearServerHint()` | a hint cookie kliensoldali törlése |

---

## Helyi backend (local-only)

A [`server/`](../server/README.md) egy külön, nullától írt Node.js szolgáltatás.
Nem framework, nincs npm dependency; SQLite-ot a beépített `node:sqlite`-ból,
jelszó-hasht a `node:crypto` scryptből használ.

| Metódus | Útvonal | Leírás |
| :--- | :--- | :--- |
| `GET` | `/api/auth/health` | állapot + `lidar_backend=1` marker |
| `GET` | `/api/auth/session` | `{authenticated, user, expiresAt}` |
| `POST` | `/api/auth/register` | regisztráció + azonnali 7 napos session |
| `POST` | `/api/auth/login` | jelszó ellenőrzés + remember szerinti session |
| `POST` | `/api/auth/logout` | session visszavonás + cookie törlés |

- A session token 32 random bájt; a DB-ben csak `SHA-256(token)` van.
- A jelszó scrypt (16 bájt salt, N=16384, r=8, p=1), a válaszban soha nem jelenik meg.
- HttpOnly `lidar_session` + olvasható `lidar_auth` hint + `lidar_backend` marker.
- Login IP 20/15 perc, e-mail 10/15 perc; regisztráció IP 10/óra; `429` + `Retry-After`.
- Origin ellenőrzés, `Sec-Fetch-Site` tiltás, JSON content-type, 16 KB body limit.
- A `GET /` és `/index.html` szerveroldalon védett; a statikus Pi-demo továbbra is
  a kliensoldali guardot használja.

Indítás: `cd lidar-robot/server && npm start` → `http://127.0.0.1:8787`.
Tesztek: `npm test` (16/16 zöld).

---

## Dashboard guard (`index.html`)

A `<head>`-ben futó, önálló inline script a body festése előtt ellenőrzi a
sessiont, és érvénytelen/lejárt session esetén `auth.html#/auth`-ra irányít.

- **Static demo módban** a `localStorage` / `sessionStorage` session a kapu.
- **Server módban** a valódi kapu a szerver: a Node service session cookie
  nélkül nem szolgálja ki az `index.html`-t. Az inline guard ilyenkor a
  `lidar_auth=1` hint cookie-t is elfogadja, hogy a HttpOnly cookie miatt ne
  legyen redirect loop. A guard tehát UX, nem biztonsági kontroll.
- A guard **szándékosan nem függ** a `session.js`-től (ha az 404, akkor is működik),
  ezért a séma duplikált: a kulcs/séma változásakor **mindkét helyet** frissíteni kell.
- A kritikus CSS inline: `html.auth-pending body { visibility: hidden; }`, hogy ne
  villanjon fel a dashboard. A `<noscript>` látható marad
  (`html.auth-pending noscript { visibility: visible; }`), és egy bannert mutat.
- Érvényes session esetén az `auth.html` a `<head>`-ben azonnal `index.html`-re
  irányít (nincs login-villanás); server módban ezt a szerver `302`-je is
  megteszi, és a stale lokális session nem okoz loopot (a hint cookie dönt).

---

## Interakciók

### Login

| Mező | Szabály | Hibaüzenet |
| :--- | :--- | :--- |
| Email | nem üres, érvényes formátum | `Enter your email address.` / `Enter a valid email address.` |
| Password | nem üres | `Enter your password.` |

Backend nélküli statikus demo módban nincs „hibás jelszó” állapot: bármely
érvényes formátumú email + bármilyen nem üres jelszó belép. A demo jelleget a
footer `DEMO SESSION` sora és a panel alatti megjegyzés kommunikálja.

A helyi backend mögött (lásd [`server/README.md`](../server/README.md)) a
`POST /api/auth/login` valódi ellenőrzést végez: rossz jelszó →
`401 invalid_credentials` („Invalid email or password.”), ismeretlen e-mail →
ugyanaz a válasz, rate limit → `429` + `Retry-After`. Sikeres login után a
footer `SECURE SESSION`-t mutat.

### Register

| Mező | Szabály | Hibaüzenet |
| :--- | :--- | :--- |
| Full name | trim után ≥ 2 karakter | `Enter your name.` |
| Email | érvényes formátum | `Enter your email address.` / `Enter a valid email address.` |
| Password | ≥ 12 karakter, ≥ 1 szám, ≥ 1 szimbólum | `Use at least 12 characters, including a number and a symbol.` |
| Confirm | egyezik | `Re-enter your password.` / `Passwords do not match.` |
| Consent | kötelező | `Accept the Terms of Service and Privacy Policy to continue.` |

Sikeres regisztráció után azonnali belépés: static demo módban `localStorage`,
7 nap; a helyi backend mögött a szerver 7 napos HttpOnly sessiont állít be, és a
`localStorage` csak hint marad.

> A consent checkbox a **demóban alapból bejelölve** van, mert a Figma minta a
> kitöltött állapotot mutatja. Éles bevezetésnél alapból **kikapcsolt** legyen.
> A backend a `consent: true` mezőt szerveroldalon is megköveteli.

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

A dashboard headerében ghost `Sign out` gomb: static demo módban
`Session.clearSession()` → `auth.html#/auth`; server módban
`POST /api/auth/logout` (a HttpOnly cookie-t a szerver törli), majd lokális
session + hint törlése és `auth.html#/auth`. 3 másodperces fallback timer
biztosítja, hogy hálózati hiba esetén se ragadjon be a dashboard. Megerősítő
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

- A demo session megkerülhető (lásd a biztonsági nyilatkozatot).
- A 9–11 px-es label-ek kicsik; a `--text-dim` a legkisebb kontraszt (AA-n átmegy).
- A `Forgot password?` / Terms / Privacy stubok; valódi oldalak később.
- A consent pre-checked a demóban (élesben unchecked).
- `axe-core` egyetlen `region` (moderate) jelzést ad: a `page-context` sor
  (breadcrumb + Documentation link) landmarkon kívül van, mert a terv
  `<header>` / `<main>` / `<footer>` vázat ír elő. Ha kell, egy
  `<section aria-label="Page context">` wrapperrel megszüntethető.
- A Figma nem tartalmaz mobil layoutot: a breakpointok design-döntések.
- 390 × 844 px-en a hero a form fölött van (terv szerint), ezért a `Log in` gomb
  a fold aljára esik; 320 px-en görgetéssel érhető el.
