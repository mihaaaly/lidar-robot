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

Valódi védelemhez szerveroldali megoldás kell: szerveroldali session, HttpOnly
cookie, jelszó-hash, rate limit, TLS. Ez még nem része a repónak — a UI design
befejezése után kerül sorra.

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
    ├── session.js                # window.Session storage helperek
    ├── auth.js                   # router, validáció, session írás
    └── app.js                    # demo mód visszaolvasás + sign out
```

Nincs build, nincs npm dependency: a fájlok statikusan tölthetők
(`python3 -m http.server 8080` vagy Nginx).

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

---

## Dashboard guard (`index.html`)

A `<head>`-ben futó, önálló inline script a body festése előtt ellenőrzi a
sessiont, és érvénytelen/lejárt session esetén `auth.html#/auth`-ra irányít.

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

Backend nincs, ezért **nincs „hibás jelszó” állapot**: bármely érvényes
formátumú email + bármilyen nem üres jelszó belép. A demo jelleget a footer
`DEMO SESSION` sora és a panel alatti megjegyzés kommunikálja.

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

A dashboard headerében ghost `Sign out` gomb: `Session.clearSession()` →
`auth.html#/auth`. Megerősítő dialógus nincs. A demo mód (`lidar.demoMode`)
kijelentkezéskor **megmarad**.

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
