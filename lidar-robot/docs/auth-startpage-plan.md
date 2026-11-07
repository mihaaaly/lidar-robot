# Auth / Login startpage — implementációs terv (v2)

> **Státusz:** reviewra kész (2026-10-28). Ez a v1 felülvizsgált, javított és kiegészített változata. A v1 jóváhagyott döntéseit megtartottam; ahol a v2 pontosít vagy új döntést javasol, az külön jelölve van.
>
> **Ág:** `web-ui-init` (ez a dokumentum). Az implementáció külön ágon / forksban történik, a v2 jóváhagyása után.
>
> **Figma:** <https://www.figma.com/design/9FySk0KrG1FfdGGjWj8nPN/Untitled?node-id=26-3> — `Auth` oldal (`26:3`)
>
> **Referencia screenshotok:** `.figma-images/design-reference/auth-start.png`, `auth-login.png`, `auth-create.png` (1440 × 1000, lokális, gitignore).
>
> **Új lokális referencia assetek:** `.figma-images/auth/auth-sensor-preview.{raw,min}.svg`, `.figma-images/auth/icons/*.svg` (gitignore). Ezek csak referenciák; a repóba kerülő asset a `web/public/assets/auth-sensor-preview.svg`.

---

## 0. V2 összefoglaló — mi változott a v1-hez képest

A v1 szerkezete és alapdöntései jók. A Figma design **nem változott** a v1 óta: a három referencia PNG pixelre azonos a jelenlegi Figmával (PIL diff: 0 eltérő pixel). A v2 elsősorban a mérések és a hiányzó részletek javítása.

### 0.1 Javított tények

| # | v1 állítás | Helyes érték / döntés |
|---|---|---|
| 1 | Az auth preview 720 pont | **315 pont** (a dashboard `scan-points.js`-ében van 720) |
| 2 | A preview SVG 150–250 KB lehet | 58 241 B nyers, **35 368 B** `svgo --multipass` után; a méretkockázat megszűnt |
| 3 | Strength segment `border-radius: 100px` | **2px**; 24 × 3 px, gap 4 px |
| 4 | Capability ikon–label gap 22 px, label 12 px muted | **gap 8 px**, label **11 px `--text-dim`** |
| 5 | Secondary gomb nyíl `#EDF2F5` | **`#A8B4BD`** (a label marad `#EDF2F5`) |
| 6 | „Back to start” 13 px | **12 px** |
| 7 | Preview disclaimer 11 px dim | 11 px **muted (`#A8B4BD`)**; a flask ikon **amber** |
| 8 | Primary gomb szövege „accent” | **`#102329`** → új `--accent-ink` token |
| 9 | Start panel form intro „center” | Csak az **eyebrow** középre; a title/description **balra** igazított, teljes szélességű |
| 10 | Tracking nincs megadva | eyebrow 1.3 px, section code 1.2 px, footer label 0.7 px, headline −1.5 px, panel title −0.8 px |
| 11 | Ikon stroke 1.6 px | Az auth ikonok **1 px** stroke, round cap |
| 12 | Reszponzív 1200–1439 px: 600 + 104 + 480 + 128 padding | **Nem fér ki** (1440 kellene). 1200–1439 px-en kisebb padding/gap és flexibilis bal oszlop kell. |
| 13 | 1024–1199 px: bal oszlop 1fr, preview marad | A bal oszlop ~392 px, a fix 600 px preview **túlcsordul**. A preview-et **≤1199 px-en el kell rejteni**. |
| 14 | Preview csak ≤1023 px-en rejtve | **≤1199 px-en** rejtve; 1200–1439 px-en arányosan skálázódik |
| 15 | `min-height: 800px` minden nézetben | Mobilon (≤1023 px) **el kell hagyni**, különben felesleges üres hely / görgetés |
| 16 | Index guard `visibility:hidden` + `<noscript>` | A `<noscript>` is eltűnik a hidden body miatt. **`html.auth-pending noscript { visibility: visible; }`** kell. |
| 17 | Ha van session, az auth oldal betölt | Igen, de a v1 nem írta le: **érvényes session esetén `auth.html` → `index.html`** korai redirect. |
| 18 | Auth mode toggle ír, de a badge fix „Demo” | Ha a toggle Live állásba kerül, a badge legyen **„Live mode · Connects after sign-in”**; ne hazudjon demo állapotot. |
| 19 | `getSession` csak olvas | Ha mindkét storage-ban van session, a **későbbi lejáratút** válasszuk; `setSession` törölje a másikat. |
| 20 | „Forgot password?” `tabindex="-1"` | Így billentyűzettel elérhetetlen. Legyen **fókuszálható, `aria-disabled` stub**, látható visszajelzéssel. |
| 21 | Eye ikon fallback csak színváltás | Az `eye` ikon az `eye-off` path utolsó (slash) subpathjának elhagyásával **pontosan azonos stílusban** előállítható. |
| 22 | Terms/Privacy linkek célja nincs megadva | Demo stub; a link ne kapcsolja a checkboxot. Külön döntés a lentiek szerint. |
| 23 | A `session.js` csak a body végén töltődik | Az auth oldalon a **headben** töltve korai redirect lehetséges; az index guard továbbra is önálló inline script. |

### 0.2 Változatlan / átvett v1 döntések

- Csak a Login/Register nézeten van mode-toggle; a Starton nincs (Figma szerint).
- A kijelentkezés a dashboard headerében, ghost gombbal történik; nincs megerősítő dialógus.
- A „Forgot password?” nem vezet új képernyőre (demo stub).
- A hibaszín `--amber`; nincs új piros token.
- A documentation / getting started cél a GitHub README, új lapon.
- A preview statikus SVG export, nem élő JS render.
- Regisztráció után azonnali belépés (`index.html`).
- „Remember me” be: `localStorage`, 7 nap; ki: `sessionStorage`, tab élettartam (max. 24 óra).
- A `.brand-title` 18 px-re emelése; a dashboardot ellenőrizni kell.
- Nincs backend, nincs valódi jelszótárolás; a session kliensoldali demo-kapu.

### 0.3 Hogyan ellenőriztem

- `get_metadata` a három frame-re (`29:2928`, `29:3369`, `29:3823`) és a jobb oszlopokra.
- `get_design_context` a panelekre, headerekre, footerekre, preview-ra; a Tailwind-osztályokból kiolvasott pontos színek/méretek.
- Read-only `use_figma` (Plugin API) a tipográfia, tracking, icon `strokeWeight` és a checkbox/strength/button részletek ellenőrzésére.
- `get_screenshot` 1440 px-en, PIL pixel-diff a lokális referenciákkal: **0 eltérő pixel**.
- A preview SVG export letöltése és `svgo --multipass` mérése.

---

## 1. Cél és hatókör

A web UI elé egy **demo auth réteg** kerül, a Figmában megtervezett három képernyővel:

| # | Figma frame | Node ID | Route | Szerep |
|---|---|---|---|---|
| 1 | `LiDAR · Start` | `29:2928` | `auth.html#/auth` | Belépő: branding + „Welcome back” panel, `Log in` / `Create account` |
| 2 | `LiDAR · Log in` | `29:3369` | `auth.html#/auth/login` | Bejelentkező űrlap |
| 3 | `LiDAR · Create account` | `29:3823` | `auth.html#/auth/register` | Regisztrációs űrlap + jelszó-erősség |

**Ebben a szeletben:**

- a három képernyő pixelre pontos, reszponzív implementációja;
- kliensoldali hash-alapú routing a három nézet között;
- demo session `localStorage` / `sessionStorage`-ban (nincs valódi backend);
- a meglévő dashboard (`index.html`) védése: bejelentkezés nélkül `auth.html`-re irányít;
- kijelentkezés a dashboardról;
- a demo/live mód megőrzése az auth és a dashboard között.

**Nem része:**

- valódi felhasználókezelés, jelszó-tárolás, token, Node-RED auth endpoint;
- elfelejtett jelszó / e-mail visszaállítás (nincs design);
- Terms of Service / Privacy Policy oldalak (stub linkek);
- a dashboard egyéb funkcióinak módosítása;
- a Figma fájl frissítése a hiányzó állapotokkal (error, eye, sign-out, mobil) — külön feladat.

> ⚠️ **Biztonsági nyilatkozat:** a kliensoldali session **nem biztonsági kontroll**, csak demo/UX kapu. Bárki megnyithatja az `index.html`-t a session megkerülésével, olvashatja a `localStorage`-ot, vagy letilthatja a JS-t. Ezt a `docs/auth.md`-ben, a README-ben és a kódkommentekben is jelezni kell. Ha később valódi védelem kell: Nginx `auth_request` + Node-RED (vagy külön auth szolgáltatás), szerveroldali session, HttpOnly cookie, jelszó-hash, rate limit, TLS. Ez nem ennek a szeletnek a feladata.

---

## 2. Kiinduló állapot

### 2.1 Meglévő fájlok

```
lidar-robot/web/public/
├── index.html                 # meglévő dashboard, vanilla ES5
├── assets/radar-scan.svg      # meglévő dashboard asset
├── js/roslib.min.js           # csak a dashboardhoz
└── src/
    ├── style.css              # 917 sor, teljes tokenkészlet + dashboard + globális focus/reduced-motion
    ├── app.js                 # IIFE, var, setMode(), radar render
    └── scan-points.js         # 720 statikus pont (dashboard)
```

- Kiszolgálás: `python3 -m http.server 8080` (`deploy/systemd/webui.service`) vagy Nginx; **nincs SPA rewrite**, ezért hash routing.
- Betűtípusok: Inter + IBM Plex Mono Google Fonts `<link>`-kel; offline Pi-n fallback font (meglévő viselkedés).
- Nincs framework, nincs build, nincs npm.

### 2.2 Újrahasznosítható elemek

- `style.css` tokenek: `--bg`, `--panel`, `--panel-raised`, `--chart`, `--border`, `--text`, `--text-muted`, `--text-dim`, `--accent`, `--accent-deep`, `--amber`, `--amber-deep`, `--font-ui`, `--font-mono`.
- `.app-header`, `.brand`, `.brand-mark`, `.brand-copy`, `.brand-title`, `.brand-subtitle`, `.header-controls`, `.mode-control`, `.switch`, `.switch-knob`, `.connection-badge`, `.status-dot`, `.mono`.
- `.status-left`, `.status-label`, `.status-copy`, `.status-right` (a footer belső elemei).
- `:focus-visible` (accent, 2 px, offset 2 px) és a globális `prefers-reduced-motion` blokk.
- A dashboard `.btn`-je 46 px; az auth gombok 48 px-esek, ezért **ne** használjuk a `.btn`-t az authon.

### 2.3 Ellenőrzött apró eltérések (nem ennek a szeletnek a feladata)

- `.brand-title` a kódban 17 px + `0.015em` tracking; a Figmában **18 px, tracking 0**. A v1 döntés szerint 18 px-re emeljük; a trackinget is nullázzuk, és a dashboardot ellenőrizzük.
- A dashboard `.mode-control` / `.connection-badge` font-weight 500; az auth Figmában **400**. Az authon auth-specifikus override legyen; a dashboard maradhat 500.
- A dashboard footer 52 px; az auth footer **56 px** — szándékos, nézet-specifikus.
- A dashboard `.status-label` tracking `0.02em`; az auth footer label **0.7 px**. Auth-specifikus override.
- A Google Fonts hálózatról töltődik; offline Pi-n fallback. Meglévő probléma; opcionálisan később lokális font subset.

### 2.4 Node-térkép

A v1-ben keveredtek a frame- és panel-node ID-k. A pontos térkép:

| Elem | Start | Login | Register |
|---|---|---|---|
| Frame (1440×1000) | `29:2928` | `29:3369` | `29:3823` |
| Header | `29:2929` | `29:3370` | `29:3824` |
| Page context | `29:2944` | `29:3385` | `29:3839` |
| Bal intro | `29:2953` | `29:3394` | `29:3848` |
| Preview kártya | — | `29:3399` | `29:3853` |
| Preview viewport | — | `29:3407` | `29:3861` |
| Preview header | — | `29:3400` | `29:3854` |
| Preview disclaimer | — | `29:3769` | `29:4223` |
| Capabilities | — | `29:3772` | `29:4226` |
| Jobb oszlop | `29:3341` | `29:3782` | `29:4236` |
| Panel | `29:3342` (Welcome panel) | `29:3786` (Login panel) | `29:4240` (Registration panel) |
| Support / note | `29:3359` (Support) | `29:3814` (Connection note) | — |
| Footer | `29:3363` | `29:3817` | `29:4283` |

---

## 3. Design tokenek, tipográfia, geometria

### 3.1 Tokenek

Ezek közül a legtöbb már a `style.css` `:root`-jában van; a v2 csak egy új tokent vezet be.

| Token | Érték | Használat az auth képernyőkön |
|---|---|---|
| `--bg` | `#101316` | oldalháttér, page context, footer |
| `--panel` | `#181c20` | header, kártyák, preview kártya |
| `--panel-raised` | `#20262b` | secondary gomb, mode control |
| `--chart` | `#11171b` | input háttér, preview viewport |
| `--border` | `#30383e` | kártya/input/elválasztó keret, preview tengelyek |
| `--text` | `#edf2f5` | címek, primary szöveg |
| `--text-muted` | `#a8b4bd` | label, leírás, breadcrumb section, preview disclaimer |
| `--text-dim` | `#7c8c97` | footer, note, subtitle, route, capability |
| `--accent` | `#5bd9ed` | eyebrow, link, primary gomb, fókusz, ikonok |
| `--accent-deep` | `#17333b` | emblem háttér, checkbox háttér |
| `--amber` | `#e4b96d` | footer label, demo badge, error, flask ikon |
| `--amber-deep` | `#30291e` | demo badge / connection badge háttér |
| **`--accent-ink`** | **`#102329`** | **primary gomb szövege és nyila (ÚJ)** |
| `--font-ui` | Inter | minden UI szöveg |
| `--font-mono` | IBM Plex Mono | eyebrow, route, footer, DEMO, jelszó, strength |

A preview SVG belső színei (`#1b252c` grid, `#30383e` tengely, `#5bd9ed` pontok) az SVG-ben vannak; ezekhez nem kell CSS token. A dashboard `--grid` (`#202b32`) **nem** azonos a preview grid színével.

### 3.2 Tipográfia

A Figma text style-okból visszaolvasott pontos értékek. A trackinget a v1 nem tartalmazta, ezért a v2-ben kötelező.

**Header / page context / footer**

| Elem | Font | Méret | Súly | Line-height | Tracking | Szín |
|---|---|---|---|---|---|---|
| Brand title | Inter | 18 | 600 | 1.2 | 0 | `--text` |
| Brand subtitle | Inter | 11 | 400 | 1.2 | 0 | `--text-dim` |
| Page context section | Inter | 16 | 500 | normal | 0 | `--text-muted` |
| Page context route | IBM Plex Mono | 11 | 400 | normal | 0 | `--text-dim` |
| Documentation link | Inter | 12 | 400 | normal | 0 | `--text-muted` |
| Footer label | IBM Plex Mono | 10 | 400 | normal | **0.7 px** | `--amber` |
| Footer copy | Inter | 11 | 400 | normal | 0 | `--text-dim` |
| Footer right | IBM Plex Mono | 10 | 400 | normal | 0 | `--text-dim` |

**Hero / panelek**

| Elem | Font | Méret | Súly | Line-height | Tracking | Szín |
|---|---|---|---|---|---|---|
| Hero eyebrow | IBM Plex Mono | 11 | 400 | normal | **1.3 px** | `--accent` |
| Hero headline | Inter | 42 | 600 | 1.15 | **−1.5 px** | `--text` |
| Hero description | Inter | 15 | 400 | 1.6 | 0 | `--text-muted` |
| Panel eyebrow | IBM Plex Mono | 10 | 400 | normal | **1.2 px** | `--accent` |
| Panel title | Inter | 28 | 600 | normal | **−0.8 px** | `--text` |
| Panel description | Inter | 14 | 400 | 1.6 | 0 | `--text-muted` |
| Start access note | Inter | 12 | 400 | 1.65 | 0 | `--text-dim` |
| Support prompt | Inter | 12 | 400 | normal | 0 | `--text-dim` |
| Support link | Inter | 12 | 400 | normal | 0 | `--accent` |

**Form**

| Elem | Font | Méret | Súly | Line-height | Tracking | Szín |
|---|---|---|---|---|---|---|
| Field label | Inter | 13 | 500 | normal | 0 | `--text-muted` |
| Input value | Inter | 14 | 400 | normal | 0 | `--text` |
| Input value (password) | IBM Plex Mono | 14 | 400 | normal | 0 | `--text` |
| Button label | Inter | 14 | 600 | normal | 0 | primary: `--accent-ink`; secondary: `--text` |
| Checkbox label | Inter | 12 | 400 | normal | 0 | `--text-muted` |
| Inline link (Forgot, Terms) | Inter | 12 / 13 | 400 / 500 | normal | 0 | `--accent` |
| Back to start | Inter | 12 | 400 | normal | 0 | `--text-muted` |
| Connection note | Inter | 11 | 400 | normal | 0 | `--text-dim` |
| Consent | Inter | 12 | 400 | 1.6 | 0 | `--text-muted` + accent linkek |
| Strength label | IBM Plex Mono | 10 | 400 | normal | 0 | `--accent` / `--amber` |
| Requirements | Inter | 11 | 400 | normal | 0 | `--text-dim` |

**Preview / capabilities**

| Elem | Font | Méret | Súly | Line-height | Tracking | Szín |
|---|---|---|---|---|---|---|
| Preview title | Inter | 13 | 600 | normal | 0 | `--text` |
| Preview topic `/scan` | IBM Plex Mono | 10 | 400 | normal | 0 | `--text-dim` |
| DEMO badge | IBM Plex Mono | 9 | 400 | normal | 0 | `--amber` |
| Disclaimer | Inter | 11 | 400 | normal | 0 | `--text-muted` |
| Capability label | Inter | 11 | 400 | normal | 0 | `--text-dim` |
| Viewport labels | IBM Plex Mono | 9 | 400 | normal | 0 | `#7C8C97` / `#A8B4BD` |

### 3.3 Geometria (1440 × 1000)

| Elem | Érték |
|---|---|
| Header | 80 px |
| Page context | 64 px |
| Main (`Access workspace`) | 800 px (min-height; a designban fix) |
| Footer | 56 px |
| Main padding | `24px 128px 48px` |
| Main grid | `600px 104px 480px` |
| Start bal intro | 600 × 190, y = 293 (globálisan 437) |
| Start jobb oszlop | 480 × 518, y = 129 (globálisan 273) |
| Start panel | 480 × 483, gap 28 |
| Start support | 480 × 15, gap 20 |
| Login bal intro | 600 × 698, y = 39 (globálisan 183) |
| Login jobb oszlop | 480 × 589, y = 93.5 (globálisan 237.5) |
| Login back nav | 480 × 15 |
| Login panel | 480 × 521, gap 20 a back nav alatt |
| Login connection note | 480 × 13, gap 20 a panel alatt |
| Register bal intro | 600 × 698, y = 39 (globálisan 183) |
| Register jobb oszlop | 480 × 727, y = 24.5 (globálisan 168.5) |
| Register back nav | 480 × 15 |
| Register panel | 480 × 692, gap 20 a back nav alatt |
| Kártya padding | 32 px |
| Panel belső gap | Start 28; Login 24; Register 16 |
| Gomb | 48 px, radius 8, padding 0 18, gap 12 |
| Input | 48 px, radius 6, padding 0 14, gap 10 |
| Checkbox | 16 × 16, radius 3 |
| Strength segment | 24 × 3, radius 2, gap 4; meter 108; row gap 8 |
| Start emblem | 48 × 48, radius 8; ikon 26 |
| Preview kártya | 600 × 446: header 52, viewport 350, disclaimer 44 |
| Capabilities | 14 px magas; item gap 24; ikon–label gap 8 |
| Footer bal gap | 18 px |

**Vertikális központosítás ellenőrzése** (a v1 számítása helyes; megtartva):

A main content-box 728 px (800 − 24 − 48). `align-items: center` mellett:

| Nézet | Bal oszlop top | Jobb oszlop top |
|---|---|---|
| Start | 24 + (728 − 190)/2 = **293** → y=437 ✔ | 24 + (728 − 518)/2 = **129** → y=273 ✔ |
| Login | 24 + (728 − 698)/2 = **39** → y=183 ✔ | 24 + (728 − 589)/2 = **93,5** → y=237,5 ✔ |
| Register | 24 + (728 − 698)/2 = **39** → y=183 ✔ | 24 + (728 − 727)/2 = **24,5** → y=168,5 ✔ |

Alacsonyabb viewporton a `min-height: 800px` miatt az oldal görgethető, nem préselődik össze. Mobilon (≤1023 px) a `min-height` **nem** érvényes.

---

## 4. Képernyő-specifikációk

### 4.1 Közös váz (`auth.html`)

```
<body class="auth-page">
  <svg class="auth-sprite" aria-hidden="true">…symbolok…</svg>
  <div class="app">
    <header class="app-header auth-header">
      <a class="brand" href="#/auth">…emblem + title + subtitle…</a>
      <div class="header-controls" id="auth-header-controls" hidden>
        …mode-control + connection-badge…
      </div>
    </header>

    <div class="page-context">
      <nav class="breadcrumb" aria-label="Breadcrumb">…</nav>
      <a class="docs-link" href="https://github.com/mihaaaly/lidar-robot#readme" …>…</a>
    </div>

    <main class="auth-main">
      <section class="auth-intro auth-intro--start" data-intro="start">…</section>
      <section class="auth-intro auth-intro--form" data-intro="form">…</section>

      <section class="auth-column" data-panel="start">…</section>
      <section class="auth-column" data-panel="login">…</section>
      <section class="auth-column" data-panel="register">…</section>
    </main>

    <footer class="auth-footer">…</footer>
  </div>
</body>
```

**Miért 2 intro + 3 panel, nem 3 teljes nézet?**

- A Start bal oldala más (nincs preview/capabilities), a Login és Register bal oldala **azonos**.
- Így a hero markupe nem duplikálódik háromszor; a router csak `hidden`-t vált az introkon és a paneleken.
- A grid mindig pontosan két látható gyereket kap: a látható intro a bal, a látható panel a jobb oszlopban.
- Mobilon a látható intro a panel fölé kerül (DOM-sorrendben is előtte van), így a fókuszsorrend természetes.

**Miért nem külön `login.html` + `register.html`?**

- Ugyanaz a váz (header/page-context/footer/jobb oszlop); külön fájlokban a markup 3× duplikálódna.
- Hash routinggal a vissza/előre gomb és a deep link is működik, szerver rewrite nélkül.
- Egy `<section data-panel>` / `hidden` váltás ~30 sor JS.

**Miért `auth.css` és nem a `style.css` bővítése?**

- A `style.css` dashboard-specifikus. Az auth CSS külön tartható, a tokeneket a `style.css`-ből örökli. Betöltési sorrend: `style.css` → `auth.css`.
- A dashboardhoz tartozó egyetlen új szabály a sign-out gomb (és a brand title 18 px) a `style.css`-be kerül.

**JS stílus:** a meglévő kódbázis szerint ES5 (`var`, IIFE, nincs modul, nincs `import`). Ne vezessünk be ES modulokat. A `session.js` globális `window.Session` névteret ad; az `auth.js` és az `app.js` ezt használja.

### 4.2 Header, page context, footer

**Header**

- 80 px, `--panel` háttér, alsó border `--border`, padding 0 28.
- Brand: emblem 40 × 40 (`--accent-deep`, radius 8) + 24 px radar ikon; gap 14; title 18/600; subtitle 11/400 dim; copy gap 4.
- Start: subtitle **„Secure access to your workspace”**, `header-controls` **nincs**.
- Login / Register: subtitle **„Autonomous Robot · Web UI”**, és a dashboarddal azonos `mode-control` + `connection-badge` jelenik meg.
- A header controls a dashboard komponensét használja (38 px mode control, 34 px badge, 16 px gap), de az authon a szöveg súlya **400** (auth-specifikus override), és a mode toggle működik:
  - demó: `Design / Mock Mode` + `Demo mode · No live connection`;
  - live: `Live Mode` + `Live mode · Connects after sign-in`, a badge `.is-live` stílussal.
- A toggle a `localStorage["lidar.demoMode"]` értéket írja; az auth oldal nem indít ROS kapcsolatot. Belépés után a dashboard a mentett módot nyitja.
- A brand kattintható → `#/auth`.

**Page context**

- 64 px, padding 0 28, nincs alsó border.
- Breadcrumb: section 16/500 muted + gap 14 + route 11 mono dim.
- Documentation link jobbra: book-open 14 muted + 12 px muted szöveg + arrow-up-right 13 muted, gap 8. Cél: GitHub README, `target="_blank" rel="noopener noreferrer"`.

| Nézet | Section | Route |
|---|---|---|
| Start | Authentication | `/auth` |
| Login | Workspace access | `/auth/login` |
| Register | Workspace access | `/auth/register` |

**Footer**

- 56 px, felső border `--border`, padding 0 28.
- Bal oldal gap 18; label 10 mono amber tracking 0.7; copy 11 dim; jobb oldal 10 mono dim.

| Nézet | Bal label | Bal copy | Jobb |
|---|---|---|---|
| Start | `SECURE ACCESS` | `Authentication required to continue.` | `LiDAR Autonomous Robot` |
| Login / Register | `DEMO SESSION` | `The displayed environment is an illustration.` | `ROS /scan · Live data stream disabled` |

- Mobilon a footer wrap-el; a bal csoport `flex-wrap`, a jobb oldal új sorba kerülhet.

### 4.3 Start nézet (`#/auth`)

**Bal intro (`auth-intro--start`)**

- 600 × 190; gap 16.
- Eyebrow: `AUTONOMOUS ROBOTICS` (11 mono accent, tracking 1.3).
- Headline: `Your robot.` / `A clearer perspective.` (42/1.15, 600, tracking −1.5).
- Description: `Explore LiDAR scans, inspect your surroundings, and bring your autonomous robot into focus.` (15/1.6 muted, max-width 530).
- **Nincs** preview és **nincs** capabilities sor.

**Jobb oszlop (`29:3341`, 480 × 518)**

- Welcome panel (480 × 483, gap 28, `padding: 32`):
  1. Access emblem 48 × 48 (`--accent-deep`, radius 8), fingerprint ikon 26 accent, középre.
  2. Form introduction (416 széles, gap 12):
     - `AUTHENTICATION` (10 mono accent, tracking 1.2) — **középre** igazítva;
     - `Welcome back` (28/600/−0.8) — **balra**, teljes szélesség;
     - `Log in to continue, or create an account to get started with LiDAR Autonomous Robot.` (14/1.6 muted) — **balra**, teljes szélesség.
  3. Account choices (416, gap 12):
     - primary `Log in` + arrow-right 16 → `#/auth/login`;
     - secondary `Create account` + arrow-right 16 → `#/auth/register`.
  4. Access note (416, border-top, padding-top 24, gap 10): shield-check 17 dim + `Your account is your entry point. Robot connections are configured inside the workspace.` (12/1.65 dim).
- A kártya alatt (gap 20): Support sor, középre igazítva, gap 6:
  - `Need a hand?` (12 dim)
  - link: `Read the getting started guide` (12 accent) + arrow-up-right 12 accent
  - cél: ugyanaz a GitHub README.

### 4.4 Login nézet (`#/auth/login`)

**Bal intro (`auth-intro--form`, ugyanaz mint a Registeren)**

- 600 × 698; gap 24.
- Intro (600 × 190, gap 16):
  - eyebrow `PERCEPTION / NAVIGATION / CONTROL` (11 mono accent, tracking 1.3);
  - headline és description ugyanaz, mint a Starton.
- Sample sensor preview (600 × 446), lásd 4.6.
- Workspace capabilities (600 × 14, gap 24), lásd 4.6.
- A bal oszlop összesen: 190 + 24 + 446 + 24 + 14 = **698**.

**Jobb oszlop (`29:3782`, 480 × 589)**

- Back navigation (480 × 15, gap 8): arrow-left 15 muted + `Back to start` (12 muted) → `#/auth`.
- Login panel (480 × 521, gap 24, padding 32), a back nav alatt 20 px gap-pel:
  1. Form introduction (416, gap 12, balra):
     - `ACCOUNT / LOG IN` (10 mono accent, tracking 1.2);
     - `Welcome back` (28/600/−0.8);
     - `Log in to access your Sensor Workspace.` (14/1.6 muted).
  2. Credentials (416, gap 20):
     - Email address: label 13/500 muted; input 48 px, `type="email"`, `autocomplete="username"`, placeholder `you@robotics.io`;
     - Password: label; input 48 px, `type="password"`, `autocomplete="current-password"`, mono érték; eye-off toggle 17 px a jobb szélen.
  3. Login preferences (416, space-between):
     - checkbox `Remember me` (16 px, radius 3, bg `--accent-deep`, border `--accent`, check 12 px) + label 12 muted;
     - `Forgot password?` (12 accent) — stub, lásd 7.7.
  4. Action: primary `Log in` + arrow-right 16.
  5. Alternate access (416, border-top, padding-top 24, gap 6, középre):
     - `New to the workspace?` (13 muted) + `Create account` (13/500 accent) → `#/auth/register`.
- A panel alatt (gap 20): Connection note, középre, gap 7: info 13 dim + `Logging in does not connect a robot automatically.` (11 dim).

### 4.5 Register nézet (`#/auth/register`)

**Bal intro:** ugyanaz, mint a Loginon (600 × 698).

**Jobb oszlop (`29:4236`, 480 × 727)**

- Back navigation: ugyanaz, mint a Loginon.
- Registration panel (480 × 692, gap **16**, padding 32), a back nav alatt 20 px gap-pel:
  1. Form introduction (416, gap 12):
     - `ACCOUNT / REGISTER` (10 mono accent, tracking 1.2);
     - `Create your account` (28/600/−0.8);
     - `Set up your access to the Sensor Workspace.` (14/1.6 muted).
  2. Account details (416, gap 12):
     - Full name: label 13/500; input 48, `autocomplete="name"`;
     - Email address: label; input 48, `type="email"`, `autocomplete="username"`;
     - Password setup (416 × 112, gap 7):
       - password input 48 + eye-off toggle; `autocomplete="new-password"`;
       - strength row (416 × 13, gap 8): meter 108 (4 × 24 × 3, radius 2, gap 4) + label 10 mono (`STRONG` a designban);
       - requirements: `12+ characters, with a number and a symbol.` (11 dim).
     - Confirm password: label; input 48, `autocomplete="new-password"`, eye-off toggle.
  3. Consent (416 × 19, gap 10): checkbox 16 + `I agree to the Terms of Service and Privacy Policy.` (12/1.6 muted; a két link accent). A checkbox kötelező.
  4. Action: primary `Create account` + arrow-right 16.
  5. Alternate access (416, border-top, padding-top 24, gap 6, középre):
     - `Already have an account?` (13 muted) + `Log in` (13/500 accent) → `#/auth/login`.

**Regisztráció utáni session:** mindig `localStorage`, 7 nap (nincs „remember me” mező). Azonnali `index.html`.

### 4.6 Preview kártya és capabilities

**Preview kártya (600 × 446, radius 12, border `--border`, `overflow: hidden`, bg `--panel`)**

- Header (600 × 52, padding 0 20):
  - radar ikon 18 accent + `Sensor Workspace` (13/600) + `/scan` (10 mono dim), gap 10;
  - jobbra DEMO badge: 36 × 20, radius 4, bg `--amber-deep`, text `DEMO` 9 mono amber, padding 4 px 7 px.
- Viewport (600 × 350, bg `--chart`, `overflow: hidden`):
  - statikus SVG: 315 pont, rács (`#1b252c`), 3 range ring, tengelyek (`#30383e`), `ROBOT` origin, 0°/90°/180°/270° címkék, `SAMPLE / 001`, `LOCAL VIEW`, `60 px / m`;
  - a címkék a SVG-ben path-okká konvertálva vannak (nincs fontfüggés);
  - a viewport **nem** interaktív.
- Disclaimer (600 × 44, border-top, padding 0 18, gap 8): flask-conical 14 **amber** + `Illustrative sample data — not live measurement` (11 **muted**).
- A kártya a bal oszlopban 24 px gap-pel követi az intrót.

**Capabilities (600 × 14, gap 24; a kártya után 24 px)**

- Minden item: ikon 14 + label 11 dim, gap 8.
- `360° scan view` (radar), `Obstacle awareness` (crosshair), `Robot navigation` (navigation).
- Az ikonok színe `--text-dim`, nem accent.

---

## 5. Architektúra és fájlszerkezet

### 5.1 Új / módosuló fájlok

```
lidar-robot/web/public/
├── auth.html                       # ÚJ — a 3 nézet egy fájlban
├── index.html                      # MÓDOSUL — guard + sign out + noscript
├── assets/
│   └── auth-sensor-preview.svg     # ÚJ — Figma export (600×350 viewport)
└── src/
    ├── style.css                   # MÓDOSUL — brand title 18/0, accent-ink, sign-out, noscript
    ├── auth.css                    # ÚJ — auth layout + form komponensek
    ├── session.js                  # ÚJ — storage helperek (közös)
    ├── auth.js                     # ÚJ — router, validáció, session írás
    └── app.js                      # MÓDOSUL — demo mód visszaolvasás + sign-out
```

A `docs/auth.md` és a README szekció a 12. lépésben készül.

### 5.2 Miért nem kell új framework / build?

- A meglévő oldal vanilla ES5, statikus, `python3 -m http.server`-rel is működik.
- A három nézet egy fájlban, hash routinggal, szerver rewrite nélkül.
- Nincs npm, nincs bundle, nincs transpile. A Pi-n a lehető legkevesebb mozgó alkatrész.

### 5.3 Asset pipeline

- **Preview:** a Figma `29:3407` node SVG exportja → `svgo --multipass` → `assets/auth-sensor-preview.svg`. A `.figma-images/auth/` csak lokális referencia.
- **Ikonok:** a Figma vektor-node-okból kinyert path-ok inline sprite-ban (`<symbol>` + `<use>`), `currentColor`-ral. Részletek a 10. szekcióban.
- **Mode control / connection badge:** nem asset; a meglévő CSS komponens.
- **Figma temporary URL:** implementáció után **egyetlen** `figma.com/api/mcp/asset/...` URL sem maradhat a kódban.

---

## 6. Routing és session

### 6.1 Route-ok

| Hash | Nézet | Megjegyzés |
|---|---|---|
| `#/auth` vagy üres hash | Start | alapértelmezett; `history.replaceState`-szel normalizáljuk |
| `#/auth/login` | Login | deep linkelhető, refresh-safe |
| `#/auth/register` | Register | deep linkelhető, refresh-safe |
| bármi más | Start | fallback + `replaceState` `#/auth`-ra |

- `hashchange` + `DOMContentLoaded` → `renderRoute()`.
- Nézetváltáskor: `hidden` attribútum a két intron és a három panelen; csak a kiválasztott látszik.
- A `document.title`, a header subtitle, a breadcrumb és a footer szövegek a view configból frissülnek.
- A header controls csak Login/Register nézetben látszik; a mode toggle állapota megmarad.
- Fókusz: nézetváltás után az adott panel `<h2>`-je kap fókuszt (`tabindex="-1"`), nem a hero `<h1>`. Így a screen reader az új nézet címét jelenti be.
- Belépés után `location.replace("index.html")`; a Back ne vigye vissza a loginra.
- Ha az auth oldal betöltésekor már van érvényes session: `location.replace("index.html")` (korai, headben).

### 6.2 View config

```js
var VIEWS = {
  start: {
    title: "Sign in · LiDAR Autonomous Robot",
    subtitle: "Secure access to your workspace",
    section: "Authentication",
    route: "/auth",
    controls: false,
    footerLabel: "SECURE ACCESS",
    footerCopy: "Authentication required to continue.",
    footerRight: "LiDAR Autonomous Robot",
    intro: "start",
    panel: "start"
  },
  login: {
    title: "Log in · LiDAR Autonomous Robot",
    subtitle: "Autonomous Robot · Web UI",
    section: "Workspace access",
    route: "/auth/login",
    controls: true,
    footerLabel: "DEMO SESSION",
    footerCopy: "The displayed environment is an illustration.",
    footerRight: "ROS /scan · Live data stream disabled",
    intro: "form",
    panel: "login"
  },
  register: { /* ugyanaz, title: "Create account · LiDAR Autonomous Robot", route: "/auth/register", panel: "register" */ }
};
```

- `renderRoute(viewKey, focus)`:
  - beállítja a `document.title`-t, subtitle-t, crumbot, footer szövegeket;
  - `controls.hidden = !view.controls`;
  - `intro.hidden = intro.dataset.intro !== view.intro`;
  - `panel.hidden = panel.dataset.panel !== view.panel`;
  - ha `focus`, akkor a látható panel `<h2>`-jére `focus()`.
- A `hidden` attribútum eltávolítja az elemet a layoutból és az a11y fából is; nem kell külön `display:none`.

### 6.3 Session séma és API

```js
// localStorage["lidar.session"] VAGY sessionStorage["lidar.session"]
{
  "v": 1,
  "email": "alex.morgan@robotics.io",
  "name": "Alex Morgan",           // register: a megadott név; login: az email local-partja
  "createdAt": 1730000000000,
  "expiresAt": 1730604800000,      // remember: +7 nap; egyébként +24 óra (sessionStorage)
  "remember": true
}
```

- **Remember me be:** `localStorage`, 7 napos `expiresAt`.
- **Remember me ki:** `sessionStorage`, tab élettartam, de legfeljebb 24 óra.
- **Jelszót soha nem tárolunk.**
- Kulcsok: `lidar.session`, `lidar.demoMode` (`"1"` / `"0"`).
- `session.js` API:
  - `getSession()` — mindkét storage-ból olvas, lejáratot ellenőriz, a lejártat törli; ha mindkettőben van érvényes, a **későbbi `expiresAt`-űt** adja vissza.
  - `setSession(data, remember)` — a cél storage-ba ír, a **másik storage-ból törli** a sessiont; `v:1`-et is beír.
  - `clearSession()` — mindkét storage-ból töröl.
  - `isAuthenticated()` — `!!getSession()`.
  - `requireAuth()` — nincs érvényes session → `location.replace("auth.html#/auth")`; egyébként `true`.
  - `getDemoMode()` / `setDemoMode(value)` — default `true`; hibát nem dob, ha a storage nem elérhető.
- A storage hozzáférést mindenhol `try/catch` veszi körül. Ha a böngésző tiltja (privát mód), a `setSession` **hibát dob** vagy `false`-t ad; a form ezt látható hibaüzenettel kezeli (7.6).

### 6.4 Dashboard guard (`index.html`)

A guard a `<head>`-ben, önálló inline scriptként fut, még a body festése előtt. Szándékosan **nem** függ a `session.js`-től (ha az 404, akkor is működik).

```html
<html class="auth-pending">
<head>
  …
  <style>
    html.auth-pending body { visibility: hidden; }
    html.auth-pending noscript { visibility: visible; }
  </style>
  <script>
    (function () {
      var KEY = "lidar.session";
      function read(store) {
        try {
          var raw = store.getItem(KEY);
          if (!raw) return null;
          var s = JSON.parse(raw);
          if (!s || typeof s.email !== "string") return null;
          if (s.expiresAt && s.expiresAt <= Date.now()) {
            store.removeItem(KEY);
            return null;
          }
          return s;
        } catch (e) { return null; }
      }
      var ok = false;
      try {
        ok = !!(read(window.localStorage) || read(window.sessionStorage));
      } catch (e) { ok = false; }
      if (!ok) { location.replace("auth.html#/auth"); return; }
      document.documentElement.classList.remove("auth-pending");
    })();
  </script>
</head>
```

- A `<noscript>` a body elején legyen, és a guard CSS **láthatóvá teszi**:
  ```html
  <noscript>
    <div class="noscript-banner" role="alert">
      This demo requires JavaScript. Enable JavaScript, or open the
      <a href="auth.html">sign-in page</a>.
    </div>
  </noscript>
  ```
- A guard kommentje tartalmazza: ez **demo-kapu, nem biztonsági kontroll**.
- A guard és a `session.js` sémája duplikált; ha a kulcs/séma változik, mindkét helyen frissíteni kell. Ezt kommentben jelezni kell.
- A `style.css`-be csak a `.noscript-banner` és a sign-out stílus kerül; a guard kritikus CSS-e inline, hogy ne villanjon a dashboard.

### 6.5 Auth oldal korai redirect

Az `auth.html` `<head>`-jében, a `style.css` előtt vagy után (de a body előtt):

```html
<script src="src/session.js"></script>
<script>
  (function () {
    if (window.Session && window.Session.isAuthenticated()) {
      location.replace("index.html");
    }
  })();
</script>
```

- Ha már be van jelentkezve, a login nem villan fel.
- Ha a `session.js` nem tölt be, a redirect elmarad; az `auth.js` egy fatal error bannert mutat, ha a `Session` hiányzik.
- A body végén csak `auth.js` kell (a `session.js` már betöltődött).

### 6.6 Kijelentkezés

- A dashboard headerben, a `connection-badge` után egy ghost gomb: `Sign out` (38 px, `--panel-raised`, border, radius 8, 12 px, 500).
- Kattintásra `Session.clearSession()` → `location.replace("auth.html#/auth")`.
- Nincs megerősítő dialógus (v1 döntés).
- Mobilon a header-controls wrap viselkedését örökli.
- A demo mód (`lidar.demoMode`) **nem** törlődik kijelentkezéskor.

### 6.7 Demo mód perzisztencia

- Az auth header toggle `Session.getDemoMode()`-mal inicializál; kattintásra `Session.setDemoMode(next)`.
- A dashboard `setMode(Session.getDemoMode())`-val indul; a dashboard toggle is írja a kulcsot (a `setMode` végén vagy a click handlerben).
- Az auth oldal nem indít ROS kapcsolatot; a live badge szövege „Live mode · Connects after sign-in”.
- A dashboardon a live mód a meglévő `connectROS()` logikát használja; ezen nem változtatunk.

### 6.8 Biztonsági figyelmeztetés

- A session kliensoldali; bárki megkerülheti. A `docs/auth.md`-ben és a README-ben szerepeljen.
- Ne tegyünk érzékeny adatot a sessionbe (jelszó, token, személyes adat a szükségesnél több).
- A session csak email + név + időbélyegek.
- A valódi védelem külön feladat (lásd 1. szakasz).

---

## 7. Interakciók és validáció

### 7.1 Login

| Mező | Szabály | Hibaüzenet |
|---|---|---|
| Email | nem üres, érvényes formátum | `Enter your email address.` / `Enter a valid email address.` |
| Password | nem üres | `Enter your password.` |

- Sikeres submit (bármilyen érvényes formátum): `setSession({email, name: emailLocalPart}, remember)` → `location.replace("index.html")`.
- Mivel nincs backend, **nincs „hibás jelszó” állapot**. A demo jelleget a footer `DEMO SESSION` sora és a login note kommunikálja.
- A `Remember me` a Figma szerint **alapból bekapcsolt**; a login `localStorage`-ba ír.
- `Forgot password?`: stub, lásd 7.7.

### 7.2 Register

| Mező | Szabály | Hibaüzenet |
|---|---|---|
| Full name | trim után ≥ 2 karakter | `Enter your name.` |
| Email | érvényes formátum | `Enter a valid email address.` |
| Password | ≥ 12 karakter, ≥ 1 szám, ≥ 1 szimbólum | `Use at least 12 characters, including a number and a symbol.` |
| Confirm password | egyezik | `Passwords do not match.` |
| Consent | kötelező | `Accept the Terms of Service and Privacy Policy to continue.` |

- A Figma requirements sora pontosan ezt a szabályt írja le.
- Sikeres submit: `setSession({email, name}, true)` → `index.html`.
- A jelszómező értékét a strength meter **csak minősíti**, nem blokkolja a gépelést.
- A consent a Figma szerint **alapból bekapcsolt** a demóban (a minta a kitöltött állapotot mutatja). Éles termékben ez nem elfogadható; a `docs/auth.md`-ben jelezni kell, hogy valódi bevezetésnél alapból **kikapcsolt** legyen.

### 7.3 Jelszó-erősség (4 szegmens)

Egyszerűsített, a requirementshez igazodó pontozás:

```js
function scorePassword(p) {
  if (!p) return 0;
  var len = p.length;
  var hasNumber = /\d/.test(p);
  var hasSymbol = /[^A-Za-z0-9]/.test(p);
  if (len >= 12 && hasNumber && hasSymbol) return 4; // STRONG
  if (len >= 12 && (hasNumber || hasSymbol)) return 3; // GOOD
  if (len >= 8) return 2; // FAIR
  return 1; // WEAK
}
```

| Pont | Szegmens | Felirat | Szín |
|---|---|---|---|
| 0 | 0 (üres) | – (rejtett) | `--border` |
| 1 | 1 | `WEAK` | `--amber` |
| 2 | 2 | `FAIR` | `--amber` |
| 3 | 3 | `GOOD` | `--accent` |
| 4 | 4 | `STRONG` | `--accent` |

- A design csak a `STRONG` állapotot mutatja; a többi dokumentált kiterjesztés.
- A meter 108 px (4 × 24 + 3 × 4), a szegmensek 24 × 3 px, radius 2 px.
- Az egész meter `aria-hidden`; a felirat `role="status" aria-live="polite"`.
- Üres jelszónál a sor **helye maradjon meg** (a szegmensek `--border`-rel, a label üresen), hogy ne ugráljon a requirements sor.
- Reduced motion esetén nincs animáció (a globális szabály lefedi).

### 7.4 Jelszó megjelenítés

- Mindkét jelszómezőn (password, confirm) külön toggle.
- A design csak `eye-off`-ot tartalmaz. Az `eye` ikon az `eye-off` path **utolsó, slash-t rajzoló subpathjának elhagyásával** készül; így a stroke stílus (1 px, round cap) és a 17 px viewBox pontosan azonos.
- A toggle `<button type="button">`, 40 × 40 px-es kattintható területtel, a 48 px-es input jobb szélén (right 4, top 4); az input jobb paddingja 50 px, hogy a szöveg ne csússzon az ikon alá.
- `aria-pressed` + `aria-label` (`Show password` / `Hide password`); az ikon `aria-hidden`.
- A design ikon-pozíciója megmarad (a 17 px ikon közepe ~392 px-nél van a 416 px-es mezőn).

### 7.5 Checkbox és consent linkek

- Valódi `<input type="checkbox">`, `.sr-only`-val vizuálisan rejtve; a custom box `<span aria-hidden="true">`; a label kattintható.
- A checkbox 16 × 16, radius 3; unchecked: transparent bg, `--border`; checked: `--accent-deep` bg, `--accent` border, check 12 px accent. (A Figma csak a checked állapotot mutatja; az unchecked a design kiterjesztése.)
- `:focus-visible + .auth-check-box` adjon látható fókuszgyűrűt.
- A consent szövegben a `Terms of Service` / `Privacy Policy` linkek accentek. A linkek kattintása **ne** kapcsolja a checkboxot. A legrobusztusabb megoldás, ha a linkek a `<label>`-en **kívül** vannak, és a szöveget több label-szegmensre bontjuk:
  ```html
  <input id="consent" type="checkbox">
  <span class="auth-check-box" aria-hidden="true">…</span>
  <span class="auth-consent-text">
    <label for="consent">I agree to the </label>
    <a href="#" class="auth-link" aria-disabled="true">Terms of Service</a>
    <span> and </span>
    <a href="#" class="auth-link" aria-disabled="true">Privacy Policy</a>
    <span>.</span>
  </span>
  ```
  Így nincs szükség `preventDefault` hackre a labelen; a linkek saját click handlerje a demo üzenetet adja, és `preventDefault()`-dal megakadályozza a `#` ugrást.
- A consent hibaüzenete a checkboxhoz legyen kötve (`aria-describedby`).

### 7.6 Hibamegjelenítés

- Érvénytelen mező: `border-color: var(--amber)`; hibaüzenet a mező alatt 12 px `--amber`, `role="alert"`.
- A mező `aria-invalid="true"` + `aria-describedby="<error-id>"`.
- Submit után az első hibás mező kap fókuszt.
- A hibaüzenet `<p>`-je mindig a DOM-ban van, `hidden`-nel rejtve; így az `aria-describedby` stabil.
- Storage hiba (privát mód / tiltott storage): form-szintű hiba a submit gomb felett:
  `Your browser blocked storage. Allow site data or leave private mode to sign in.`
- Miért amber és nem piros: a palettában nincs piros; az amber már a warning/demo szerepet viszi. Később egy `--danger` tokennel cserélhető.
- Dupla submit elleni védelem: `submitting` flag + a gomb `disabled` a navigációig; storage hiba esetén a gomb újra engedélyezett.

### 7.7 Stub linkek

- `Forgot password?`: `<button type="button" class="auth-link" aria-disabled="true" title="Password recovery is not available in this demo">Forgot password?</button>`. Fókuszálható marad; kattintásra egy `aria-live` üzenet: `Password recovery is not available in this demo.`
- `Terms of Service` / `Privacy Policy`: `<a href="#" aria-disabled="true" title="Not available in this demo">…</a>`; kattintásra `preventDefault()`, és ugyanaz a demo üzenet. A linkek accentek maradnak.
- A `Documentation` és a `Read the getting started guide` valódi link a GitHub README-re.
- Ha később lesz `terms.html` / `privacy.html`, csak a href-eket kell cserélni.

### 7.8 Autofill

- `autocomplete`: email `username`, login password `current-password`, regisztrációs jelszó/confirm `new-password`, név `name`.
- `:-webkit-autofill` esetén a háttér maradjon `--chart`, a szöveg `--text`:
  ```css
  input:-webkit-autofill,
  input:-webkit-autofill:hover,
  input:-webkit-autofill:focus {
    -webkit-text-fill-color: var(--text);
    -webkit-box-shadow: 0 0 0 1000px var(--chart) inset;
    caret-color: var(--text);
    transition: background-color 9999s ease-out 0s;
  }
  ```
- `spellcheck="false"`, `autocapitalize="none"` az emailen; a jelszavakon `spellcheck="false"`.
- Ne használjunk `maxlength`-et a jelszón (a jelszókezelők hosszú jelszavakat generálhatnak); emailen 254, néven 80 opcionális.

---

## 8. Reszponzív viselkedés

A design 1440 × 1000-re készült. A v1 breakpointjai 1200 és 1024 között **nem működtek** (a fix 600-as preview és a 600 + 104 + 480 kolumnák nem fértek el). A v2 javított stratégiája:

| Viewport | Layout | Oszlopok | Main padding | Preview | Capabilities |
|---|---|---|---|---|---|
| **≥ 1440 px** | 2 oszlop, pontos design | 600 / 104 / 480 | `24px 128px 48px` | 600 px, teljes | látható |
| **1200–1439 px** | 2 oszlop, flexibilis bal | `minmax(0, 600px)` / 64 / 480 | `24px 48px 48px` | 100% (max 600), arányosan skálázódik | látható |
| **1024–1199 px** | 2 oszlop | `minmax(0, 1fr)` / 48 / 480 | `24px 48px 48px` | **elrejtve** | látható |
| **≤ 1023 px** | 1 oszlop, max 480, középre | – | `16px 24px 32px` | elrejtve | elrejtve |
| **≤ 620 px** | 1 oszlop | – | `16px 20px 32px` | elrejtve | elrejtve |
| **≤ 380 px** | 1 oszlop | – | `16px 20px 32px` | elrejtve | elrejtve |

**Részletek:**

- **≥1440:** a main `max-width: 1440px; margin: 0 auto`; a header/page-context/footer belső tartalma is a 1440-es vázhoz igazodik:
  ```css
  @media (min-width: 1440px) {
    .auth-header,
    .page-context,
    .auth-footer {
      padding-inline: calc((100% - 1440px) / 2 + 28px);
    }
  }
  ```
  A header/footer háttér teljes szélességű, a belső tartalom középre igazított.
- **1200–1439:** a bal oszlop `minmax(0, 600px)`, a grid `justify-content: center`; a preview `width: 100%; max-width: 600px`, a viewport `width: 100%; height: auto` (az SVG arányt tart). A kártya magassága 52 + viewport + 44 lesz, nem fix 446.
- **1024–1199:** a bal oszlop 1fr; a preview `display: none`; a capabilities marad (a 400 px-es bal oszlopban is elfér: 103 + 24 + 128 + 24 + 110 = 389; ha kell, `flex-wrap: wrap`).
- **≤1023:** a main `display: block`, `max-width: 480px`, `margin: 0 auto`, `min-height: 0`; a látható intro a panel fölött, köztük 32 px gap. A headline 36 px; a hero description 15 px, de **≤620 px-en elrejtve**, hogy a login űrlap elférjen.
- **≤620:**
  - header: a meglévő `.app-header` wrap szabályai (16 px 20 px padding, a brand title 16 px);
  - page context: `flex-wrap: wrap; height: auto; min-height: 64px; padding: 14px 20px; gap: 8px 12px;` — a documentation link a második sorba kerülhet;
  - footer: `height: auto; min-height: 56px; flex-wrap: wrap; padding: 12px 20px; gap: 6px;` — a jobb oldal új sorba kerülhet;
  - panel padding 24; headline 32 px; a hero description **elrejtve**; a gombok teljes szélességűek;
  - a `.auth-support` wrap-eljen (`flex-wrap: wrap; row-gap: 4px`);
  - a login preferences wrap-eljen (`flex-wrap: wrap; row-gap: 8px`), a „Forgot password?” a második sorba kerülhet.
- **≤380:** a consent és a footer szövegek törhetők; a page context documentation linkje két sorba kerülhet; semmi sem csúszhat ki vízszintesen.
- A `min-height: 800px` csak ≥1024 px-en érvényes; mobilon a main a tartalom magasságát veszi fel, a footer a flex miatt az oldal aljára kerül.
- A preview `display:none` ≤1199 px-en; ez design-döntés, mert a Figma nem tartalmaz tablet/mobil layoutot. A capabilities ≤1023 px-en szintén elrejtve; a hero és az űrlap a prioritás.

**Ellenőrzési pontok:** 1440, 1280, 1200, 1024, 1023, 768, 390, 320; 200% zoom.

---

## 9. Accessibility

- **Szemantika:** `<header>`, `<main>`, `<footer>`, `<nav aria-label="Breadcrumb">`, `<form>`, `<label for>`, `<button type>`.
- **Fókusz:** a meglévő `:focus-visible` (accent, 2 px, offset 2 px) öröklődik; a kártyák és dekoratív ikonok nem fókuszálhatók.
- **Route-fókusz:** nézetváltás után a panel `<h2>`-je kap fókuszt (`tabindex="-1"`); a hero `<h1>` marad az oldal fő címe.
- **Breadcrumb:** a route `aria-current="page"`.
- **Form hibák:** `role="alert"`, `aria-invalid`, `aria-describedby`; az első hibás mező fókuszál.
- **Strength meter:** a vizuális szegmensek `aria-hidden`; a felirat `role="status"` + `aria-live="polite"`.
- **Jelszó toggle:** `<button type="button">`, `aria-pressed`, `aria-label`; 40 px target.
- **Checkbox:** valódi input `.sr-only`-val; a custom box `aria-hidden`; a label kattintható; a fókuszgyűrű a boxon látszik.
- **Képek:** a preview `<img alt="Illustrative LiDAR scan of a room with the robot at the origin">`; minden dekoratív ikon `aria-hidden`.
- **Nyelv:** `<html lang="en">`, mert a UI angol (a repó doksi magyar).
- **Tab order:** brand → (header controls) → documentation → back nav → form mezők → gombok → footer. A Starton: brand → documentation → Log in → Create account → getting started.
- **Kontraszt (mért):**
  - `--text` `#EDF2F5` / `--panel` `#181C20`: **15.19:1**
  - `--text-muted` `#A8B4BD` / `--panel`: **8.10:1**
  - `--text-dim` `#7C8C97` / `--panel`: **4.94:1** (AA normál szövegre)
  - `--text-dim` / `--bg` `#101316`: **5.37:1**
  - `--accent` `#5BD9ED` / `--panel`: **10.27:1**
  - `--amber` `#E4B96D` / `--amber-deep` `#30291E`: **7.84:1**
  - `--accent-ink` `#102329` / `--accent`: **9.73:1**
  - A 10–11 px-es dim szövegek is átmennek AA-n; a 9 px-es DEMO badge nem normál szöveg, de a kontrasztja 7.84:1.
- **Reduced motion:** a meglévő globális szabály lefedi; nincs saját animáció.
- **No-JS:** az index `<noscript>` banner látható a guard CSS miatt; az auth oldalon a Start nézet statikus marad, a `<noscript>` üzenet magyarázza, hogy a váltáshoz JS kell.
- **Ismert design-korlátok:** a 9–11 px-es label-ek kicsik; a `--text-dim` a legkisebb kontraszt; a `Forgot password?` / Terms / Privacy stubbok. Ezeket a `docs/auth.md`-ben rögzíteni kell.

---

## 10. Assetek

### 10.1 Preview SVG

- Forrás: Login `29:3407`, Register `29:3861` (ugyanaz a viewport).
- Cél: `web/public/assets/auth-sensor-preview.svg`, `viewBox="0 0 600 350"`.
- **315 sample point**, nem 720. A `.figma-images/design-reference/radar.svg` a dashboard 720 pontos referenciája, nem ez.
- Nyers export: **58 241 B**; `svgo --multipass`: **35 368 B**. A méret LAN-on rendben van; nincs szükség pontritkításra.
- Az export tartalmazza a frame ancestor hátterét is (a viewBox kivágja); a látható 600 × 350 terület a lényeg. Ha a méret zavar, a `Illustrative point cloud` csoport kiemelhető, de nem kötelező.
- A szövegek path-okká vannak konvertálva → nincs fontfüggés.
- A kártya header/disclaimer HTML/CSS; csak a viewport SVG. A DEMO badge HTML.
- Használat: `<img src="assets/auth-sensor-preview.svg" width="600" height="350" alt="Illustrative LiDAR scan of a room with the robot at the origin">`, `width:100%; height:auto`.
- A `.figma-images/auth/` referencia (gitignore); implementációkor a node újra exportálható.

### 10.2 Ikonok

A Figma auth ikonok **1 px** stroke-pal, round cap-pel készültek. A dashboard ikonjai 1.6 px-esek; az authon ne használjuk azokat a stroke-okat.

| Ikon | Méret(ek) | Szín | Hol |
|---|---|---|---|
| `radar` | 24, 18, 14 | `#5BD9ED` (header, preview); `#7C8C97` (capability) | header emblem, preview header, capability |
| `fingerprint` | 26 | `#5BD9ED` | Start emblem |
| `arrow-right` | 16 | `#102329` (primary), `#A8B4BD` (secondary) | gombok |
| `arrow-up-right` | 13, 12 | `#A8B4BD` (docs), `#5BD9ED` (support) | docs / getting started |
| `shield-check` | 17 | `#7C8C97` | Start access note |
| `book-open` | 14 | `#A8B4BD` | documentation |
| `arrow-left` | 15 | `#A8B4BD` | back |
| `eye-off` | 17 | `#A8B4BD` | password |
| `eye` | 17 | `#A8B4BD` | password visible (az eye-off slash nélkül) |
| `check` | 12 | `#5BD9ED` | checkbox |
| `info` | 13 | `#7C8C97` | login connection note |
| `flask-conical` | 14 | `#E4B96D` | preview disclaimer |
| `crosshair` | 14 | `#7C8C97` | capability |
| `navigation` | 14 | `#7C8C97` | capability |

**Ajánlott implementáció:** inline `<svg><symbol>` sprite az `auth.html` tetején, `<use>`-szal, `stroke="currentColor"`, a szülő `color`-jával. Minden méretváltozathoz külön symbol kell (a 24/18/14 radar path-jai eltérő léptékűek; a stroke mindegyiknél 1 px). Így elég egy színváltozat, és a hover/`aria-pressed` állapotok automatikusan működnek.

- Ez kis eltérés a dashboard fix-színű inline ikonjaitól; a rendered design ugyanaz, a karbantartás jobb.
- A sprite dekoratív: `<svg class="auth-sprite" aria-hidden="true" style="display:none">`.
- A Figma exportokban benne van a frame háttere; **csak a `Vector` path-okat** emeljük át, a háttér rect-eket nem.
- A `check` path a checkboxon belül; a checked állapotban `opacity: 1`, egyébként 0.
- Az `eye` ikon: az `eye-off` path utolsó subpathja (`M 0 0 L 14.167 14.167`) elhagyható; a maradék path adja az eye-t. Ellenőrizni kell, hogy a 17 × 17 viewBox és a 1 px stroke megmarad.

### 10.3 Asset lista (repo)

```
web/public/assets/auth-sensor-preview.svg      # commitolható, ~35 KB
web/public/src/auth.css                        # commitolható
web/public/src/auth.js                         # commitolható
web/public/src/session.js                      # commitolható
web/public/auth.html                           # commitolható
```

A `.figma-images/` továbbra is gitignore; a referencia screenshotok és a nyers exportok nem kerülnek a repóba.

---

## 11. Döntések

### 11.1 Átvett v1 döntések

1. A Start nézeten nincs mode-toggle; csak Login/Register.
2. Kijelentkezés: header ghost `Sign out`, megerősítés nélkül.
3. „Forgot password?”: letiltott stub, nincs új képernyő.
4. Hibaszín: `--amber`; később `--danger` token.
5. Eye ikon: pótolni; fallback színváltás.
6. Documentation / getting started: GitHub README, `target=_blank`.
7. Preview: statikus SVG export.
8. Regisztráció után azonnali belépés.
9. Session lejárat: remember 7 nap; egyébként tab-élettartam (max. 24 óra).
10. Nincs sign-out megerősítés.
11. `.brand-title` 18 px; a dashboardot ellenőrizni.

### 11.2 V2-ben pontosított / új döntések

| # | Kérdés | Döntés |
|---|---|---|
| 12 | Responsive 1200–1439 | 2 oszlop, flexibilis bal oszlop (max 600), gap 64, padding 48; a preview skálázódik |
| 13 | Responsive 1024–1199 | 2 oszlop, bal 1fr, gap 48; a preview **elrejtve**; capabilities marad |
| 14 | ≤1023 | 1 oszlop max 480; a hero a form fölött; preview és capabilities rejtve; `min-height: 0` |
| 15 | ≤620 | A hero description elrejtve; headline 32; panel padding 24; header/page/footer wrap |
| 16 | Consent default | A demóban **checked** (design fidelity); élesben unchecked — dokumentálni |
| 17 | Icon stratégia | Inline sprite + `currentColor`, 1 px stroke, méretenként külön symbol |
| 18 | Eye ikon | Az `eye-off` slash nélküli változata; nem kell új asset |
| 19 | Auth oldal érvényes sessionnel | Korai `location.replace("index.html")` a headben |
| 20 | Auth mode toggle live állapot | Badge: `Live mode · Connects after sign-in`; nem hazudik demo állapotot |
| 21 | Storage tiltva | A login/register formon látható hiba; az index guard nem marad örökre hidden |
| 22 | Forgot password stub | Fókuszálható `aria-disabled` button + látható demo üzenet |
| 23 | Terms/Privacy | `aria-disabled` link stub; a kattintás ne kapcsolja a checkboxot; valódi oldalak később |
| 24 | `getSession` | A későbbi lejáratút választja; `setSession` törli a másik storage-ot; `v:1` |
| 25 | Preview pontszám | 315; a 720 a dashboardé; a méretkockázat megszűnt |
| 26 | Brand tracking | A title tracking 0; a subtitle authon 0 (a dashboardon maradhat a meglévő) |
| 27 | Mode control súly | Az authon 400; a dashboardon marad 500 |
| 28 | Fókusz route-váltáskor | A panel `<h2>`-je, nem a hero `<h1>` |
| 29 | Oldalcímek | Start: `Sign in · …`; Login: `Log in · …`; Register: `Create account · …` |
| 30 | Password strength | Egyszerűsített 1–4 pontozás a requirementshez igazítva |

### 11.3 Jóváhagyásra váró kérdések

1. **Mobil sorrend:** a v2 a hero-t a form fölé teszi (rövidítve), nem a formot előre. Alternatíva: a form legyen első, a hero utána. A v2 javaslata a designhoz közelebb áll, és 390 px-en is a látható részen tartja a login gombot.
2. **Consent default:** a v2 a Figma miatt checked; élesben unchecked lenne a helyes. Melyik legyen a demóban?
3. **Terms/Privacy:** elég a disabled stub, vagy készüljön két minimál `terms.html` / `privacy.html` oldal?
4. **Figma frissítés:** a hiányzó állapotok (error, eye, sign-out, mobil) kerüljenek-e a Figmába külön körben, vagy maradjon a kód a design előtt?

---

## 12. Implementációs lépések

1. **Ág:** `feat/auth-startpage` a `web-ui-init`-ről (vagy a kijelölt forkból). A terv dokumentum marad a `web-ui-init`-en.
2. **Assetek:** a preview SVG exportja (`29:3407`) + `svgo --multipass`; az ikon-pathok kigyűjtése; a `.figma-images/auth/` referencia ellenőrzése.
3. **Token/CSS fix:** `--accent-ink` hozzáadása; `.brand-title` 18 px + tracking 0; auth-specifikus mode-control súly; a dashboard ellenőrzése.
4. **`auth.html` váz:** header, page context, main (2 intro + 3 panel), footer, sprite; `auth.css` alap layout; mindhárom nézet láthatóvá tétele fejlesztés alatt.
5. **Start nézet:** pixelre pontosítás 1440 × 1000-en; összevetés az `auth-start.png`-vel.
6. **Login nézet:** form komponensek (field, input, primary/secondary, checkbox, reveal); összevetés az `auth-login.png`-vel.
7. **Register nézet:** password setup, strength meter, consent; összevetés az `auth-create.png`-vel.
8. **`session.js`:** storage API, lejárat, demo mód, `requireAuth`; konzolos tesztek.
9. **`auth.js`:** router/view config/fókusz/title; korai redirect; validáció; reveal; strength; stubok; storage-hiba.
10. **Guard:** `index.html` inline guard + kritikus CSS + noscript; `app.js` demo mód visszaolvasás; sign-out.
11. **Reszponzív:** 1440 / 1200 / 1024 / 1023 / 768 / 390 / 320; preview skálázás/rejtés; header/page/footer wrap.
12. **A11y:** fókusz, hibák, strength aria-live, reveal aria-pressed, checkbox, kontraszt, reduced motion, keyboard pass.
13. **Dokumentáció:** `docs/auth.md` (route-ok, session kulcsok, guard, demo-jelleg figyelmeztetés, asset újragenerálás) + README szekció.
14. **Teszt:** a 13. szekció végigfuttatása; végső pixel-diff; konzol/404 ellenőrzés.
15. **Opcionális:** a Figma frissítése a hiányzó állapotokkal (error, eye, sign-out, mobil) — külön kör.

---

## 13. Tesztterv

### 13.1 Funkcionális

- [ ] `/` bejelentkezés nélkül → `auth.html#/auth`; nincs dashboard-villanás.
- [ ] Érvényes sessionnel `auth.html` → `index.html` (nincs login-villanás).
- [ ] Start → `Log in` → login; `Create account` → register; `Back to start` → Start.
- [ ] Deep link: `auth.html#/auth/register` közvetlen megnyitás + refresh → register.
- [ ] Böngésző vissza/előre → helyes nézet; a Start normalizálása nem duplikál history entry-t.
- [ ] Login: üres/érvénytelen email → inline hiba; érvényes email + bármilyen nem üres jelszó → `index.html`; session a megfelelő storage-ban.
- [ ] Register: név, email, jelszó, confirm, consent külön-külön triggerelhető.
- [ ] Strength meter: 0/1/2/3/4 szegmens, feliratok, `aria-live`.
- [ ] Jelszó toggle mindkét űrlapon, mindkét irányban; a value megmarad.
- [ ] `Remember me` be → `localStorage`; ki → `sessionStorage`; a másik storage törlődik.
- [ ] Session lejárat (kézzel átírt `expiresAt`) → guard kirak; az auth `isAuthenticated()` törli.
- [ ] Corrupt JSON a storage-ban → guard kirak, nem crashel.
- [ ] Storage tiltva (privát mód) → login/register form hiba; nincs végtelen hidden oldal.
- [ ] Sign out → session törölve, `auth.html#/auth`; a demo mód megmarad.
- [ ] Demo mód toggle az authon → dashboard ugyanabban a módban nyílik; a live badge szövege helyes.
- [ ] „Forgot password?” fókuszálható, demo üzenetet ad; Terms/Privacy nem kapcsolja a checkboxot.
- [ ] JS nélkül az index noscript bannerje látható; az auth oldal üzenete látható.

### 13.2 Vizuális

- [ ] 1440 × 1000: mindhárom nézet összevetve a referencia PNG-vel (oszlopszélességek, 80/64/56 sávok, 128/104 gap, kártya 480, panel padding 32, gomb 48, input 48, tracking).
- [ ] 1280, 1200, 1024, 1023, 768, 390, 320: nincs vízszintes scroll; a preview a megfelelő breakpointon skálázódik/eltűnik; 390 px-en a login gomb a fold felett van, 320 px-en görgetéssel elérhető.
- [ ] 200% zoom; nagy betűméret.
- [ ] Hosszú email / név nem töri a layoutot; az input flex-el.
- [ ] Hibás mezők, strength 1–4, reveal, checkbox checked/unchecked állapotok.
- [ ] Konzol hiba nélkül; nincs 404; minden font/asset betölt.
- [ ] Offline (font fallback) esetén a layout nem törik kritikusan.

### 13.3 Accessibility

- [ ] Csak billentyűzettel végigjárható; fókuszgyűrű mindenhol látszik.
- [ ] Route-váltás után a panel címe kap fókuszt; a title frissül.
- [ ] Hibák: `role=alert`, `aria-invalid`, `aria-describedby`, első hibás mező fókusz.
- [ ] Strength: `role=status`, `aria-live=polite`; a vizuális szegmensek `aria-hidden`.
- [ ] Reveal: `aria-pressed` + `aria-label` váltás.
- [ ] Checkbox: label, fókuszgyűrű, `.sr-only` input.
- [ ] Kontraszt: a 9. szakasz értékei; nincs 4.5 alatti normál szöveg.
- [ ] `prefers-reduced-motion` mellett nincs animáció.
- [ ] Screen reader alap teszt (VoiceOver/NVDA): Start → Login → Register, hibák, strength.

### 13.4 Regresszió

- [ ] A dashboard zoom, demo/live toggle, go home változatlan.
- [ ] A sign-out gomb nem töri a header wrapet; a demo mód megmarad.
- [ ] A `.brand-title` 18 px-es változása a dashboardon nem tör el semmit.
- [ ] `python3 -m http.server` alatt is működik (nincs rewrite igény).
- [ ] A guard nem befolyásolja a dashboard betöltését érvényes sessionnel.

---

## 14. Kockázatok

| Kockázat | Hatás | Kezelés |
|---|---|---|
| A kliensoldali guard hamis biztonságérzetet ad | félrevezetés | explicit figyelmeztetés a doksiban, README-ben és kódkommentben |
| A Figma később változik | design drift | node ID-k + screenshotok rögzítve; a v2 mérései reprodukálhatók |
| A Google Fonts offline a Pi-n | fallback font, eltérő tördelés | meglévő probléma; opcionálisan lokális font subset később |
| A Figma nem tartalmaz mobil layoutot | design-döntések | a 8. szakasz dokumentált breakpointjai; 390/320 px teszt |
| A 9–11 px-es label-ek kicsik | olvashatóság | kontraszt rendben; ha kell, később 1 px-emelés a design frissítésével |
| Stub linkek (Forgot, Terms, Privacy) | hiányos UX | egyértelmű demo üzenet; valódi oldalak külön feladat |
| Storage tiltva / privát mód | session nem írható | form-szintű hiba; a guard nem marad végtelen hidden |
| A preview SVG export ancestorokat tartalmaz | nagyobb fájl | `svgo`; a viewBox kivágja; 35 KB elfogadható |
| Az icon sprite eltér a dashboard konvenciójától | karbantartási különbség | dokumentált; a rendered színek azonosak; a sprite csak az authon él |
| A `hidden` attribútum + fókusz | fókusz nem látszik | a panel címe `tabindex=-1`; a fókusz a `hidden` levétele után történik |
| A hash routing és a `location.replace` | history viselkedés | tesztek: back/forward, login, sign out, deep link |
| A consent pre-checked | jogi/etikai | demóban a design miatt; élesben unchecked — dokumentálva |

---

## 15. Definition of done

- [ ] A három nézet 1440 × 1000-en pixelre közel azonos a referencia PNG-vel (font-rendering eltérés megengedett).
- [ ] 1280 / 1200 / 1024 / 1023 / 768 / 390 / 320 px-en nincs vízszintes scroll; a login a fold felett van.
- [ ] A session flow (login, register, remember, expiry, sign out, guard, demo mode) működik.
- [ ] Az auth oldal érvényes sessionnel `index.html`-re irányít; az index érvénytelen sessionnel `auth.html`-re.
- [ ] A storage-tiltott és no-JS esetek nem hagynak üres/végtelen hidden oldalt.
- [ ] A keyboard/a11y pass kitöltve; a kontraszt megfelel.
- [ ] Nincs konzol hiba, nincs 404, nincs Figma temporary URL a kódban.
- [ ] `docs/auth.md` és a README szekció elkészült, a demo/biztonsági figyelmeztetéssel.
- [ ] A dashboard regressziós tesztjei zöldek.
- [ ] A tervben szereplő nyitott kérdések (11.3) eldöntve vagy külön issue-ba mozgatva.

---

## Függelék — Gyors ellenőrzőlista a review-hoz

1. A 0.1 táblázat javításai elfogadhatók?
2. A 11.3 nyitott kérdésekre melyik választ kérjük?
3. A 8. szakasz mobil stratégiája (hero a form fölött, preview/capabilities rejtve) rendben van?
4. A consent default maradjon checked a demóban?
5. Az icon sprite + `currentColor` irány rendben van, vagy maradjon a v1 fix-színű inline ikonja?
6. A `web-ui-init` ágon commitoljuk-e a v2 tervet, vagy a review után külön?
