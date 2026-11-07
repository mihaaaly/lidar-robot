# Map selection (main screen) — implementációs terv

> **Státusz:** jóváhagyásra kész. Ez a dokumentum a bejelentkezés utáni **főképernyő**
> (térképválasztó) implementációjának terve.
>
> **Figma:** <https://www.figma.com/design/9FySk0KrG1FfdGGjWj8nPN/Untitled?node-id=26-2>
> — `Main screen` oldal, `LiDAR · Map selection` frame (`43:4131`, 1440 × 1000)
>
> **Kapcsolódó:** [`auth-startpage-plan.md`](auth-startpage-plan.md) (belépés előtti réteg),
> [`auth.md`](auth.md) (auth implementáció), [`interface.md`](interface.md) (ROS interfész).

---

## 1. Cél és hatókör

A belépés utáni első képernyő a **térképválasztó (Map Selection)**: a mentett
térképek könyvtára, valamint a kiválasztott térkép részletes előnézete. Innen
nyílik meg a meglévő **Sensor Workspace** dashboard.

**Ebben a szeletben:**

- a `LiDAR · Map selection` frame pixelközeli, reszponzív implementációja;
- térképkönyvtár: keresés, rendezés, szűrők (`All maps` / `Recent`), grid/list nézet;
- kártyánkénti kiválasztás (egér + billentyűzet), a jobb oldali panel élő frissítése;
- a kiválasztás tárolása (`localStorage["lidar.map"]`), visszaolvasás betöltéskor;
- „Open in Sensor Workspace” → a meglévő dashboard megnyitása;
- a meglévő session-guard, mode-toggle és sign-out újrahasznosítása;
- az auth folyamat végpontjának átállítása az új főképernyőre (a route-ok változatlanok).

**Nem része:**

- valódi térképfeltöltés/feldolgozás (a `Import map` demo stub: fájlválasztó + toast);
- valódi ROS kapcsolat, térkép letöltés a robotról (a könyvtár statikus demo adat);
- Node-RED / SQLite `maps` tábla integráció (későbbi szelet, lásd `interface.md`);
- a Sensor Workspace (`workspace.html`) belső működésének módosítása;
- a Figma fájl frissítése a hiányzó állapotokkal (list nézet, üres keresés, toast).

---

## 2. Route-ok és fájlszerkezet

A főképernyőnek a **root URL-en** (`/`, `index.html`) kell megjelennie, ezért a
meglévő dashboard átkerül `workspace.html`-re. Az auth átirányítások
(`auth.js` → `index.html`) így **változatlanok maradhatnak**.

| Fájl | Változás | Szerep |
| :--- | :--- | :--- |
| `web/public/index.html` | **ÚJ tartalom** (a régi dashboard átkerül) | Map Selection főképernyő |
| `web/public/workspace.html` | **ÁTHELYEZVE** `index.html`-ből | Sensor Workspace dashboard |
| `web/public/src/maps.css` | új | a főképernyő saját stílusai |
| `web/public/src/maps-data.js` | új | térképkönyvtár adatmodell + geometria |
| `web/public/src/maps.js` | új | renderelés, kiválasztás, keresés, szűrés, toast |
| `web/public/assets/icons/*.svg` | új (14 fájl) | Figmából exportált ikonok |
| `web/public/src/auth.js` | változatlan | login/register → `index.html` (= főképernyő) |
| `web/public/auth.html` | változatlan | érvényes session → `index.html` |
| `web/public/src/workspace.html` guard | változatlan logika | érvénytelen session → `auth.html#/auth` |

Betöltési sorrend az `index.html`-ben:
`session.js` (head, guardhoz) → `maps-data.js` → `maps.js`.

Nincs build, nincs npm; a fájlok statikusan tölthetők (`python3 -m http.server 8080`
vagy Nginx), ahogy eddig.

---

## 3. Layout specifikáció (1440 × 1000, Figma-mérés)

### 3.1 Oldalrács

| Sáv | Magasság | Padding | Megjegyzés |
| :--- | ---: | :--- | :--- |
| `Application header` | 80 | `0 28px` | `#181c20`, alsó 1px `#30383e` |
| `Page context` | 84 | `0 28px` | cím + route + disclaimer |
| `Map selection workspace` | 784 | `0 28px` | flex, gap **24** |
| `Session footer` | 52 | `0 28px` | felső 1px `#30383e`, háttér nélkül |

Workspace: `840` (library) + `24` (gap) + `520` (panel) = `1384` → `1440 − 2×28`. ✔

### 3.2 Header (`43:4132`)

Meglévő komponensek újrahasználva (`style.css`): `.app-header`, `.brand`,
`.mode-control`, `.connection-badge`, `.sign-out`.

| Elem | Mérés |
| :--- | :--- |
| Brand | 40px emblem (`#17333b`, r8, 24px accent ikon), gap 14; cím 18/600, alcím 11 dim |
| Mode toggle | h38, r8, bg `#20262b`, border `#30383e`, padding `0 13`, gap 12, label 12/400 |
| Connection badge | h34, r6, bg `#30291e`, padding `0 12`, gap 8, dot 6px `#e4b96d`, label 12 |

> **Döntés (eltérés a Figmától):** a design headerében nincs sign-out gomb. A demó
> auth réteg miatt a kijelentkezésnek a főképernyőről is elérhetőnek kell lennie,
> ezért a meglévő `.sign-out` ghost gombot a `header-controls` végén megtartjuk
> (a `workspace.html`-en is megmarad). Ez az egyetlen szándékos eltérés.

### 3.3 Page context (`43:4148`)

| Elem | Mérés |
| :--- | :--- |
| Cím | „Map Selection”, 24/600, `#edf2f5`, letter-spacing `−0.6px` |
| Route | `/maps`, 12 mono, `#7c8c97`, gap 14 |
| Disclaimer | flask ikon 15px (stroke `#e4b96d`) + 12/400 `#a8b4bd` |

### 3.4 Map library (`43:4156`, 840 széles, vertical gap 16)

| Blokk | Magasság | Részletek |
| :--- | ---: | :--- |
| `Library introduction` | 44 | bal: 18/600 cím + `04 MAPS` (11 mono dim, gap 10), leírás 12 `#a8b4bd`; jobb: `Import map` gomb |
| `Search and sort` | 40 | kereső (flex, gap 12) + rendező (131 széles) |
| `Library filters` | 28 | bal: 2 chip; jobb: grid/list ikonok |
| `Saved maps` | 536 | 2 × 2 kártya, gap 16/16 |
| `Local library note` | 48 | r8, bg `#181c20`, border, padding `0 16`, gap 10 |

`Import map` gomb: h36, r8, bg `#20262b`, border `#30383e`, padding `0 13`, gap 8,
ikon 14 (`#a8b4bd`), label 12/500.

Kereső: h40, r8, bg `#11171b`, border `#30383e`, padding `0 13`, gap 10, ikon 16 dim,
placeholder 12 dim. Rendező: h40, r8, bg `#20262b`, border, padding `0 13`, gap 16,
szöveg 12 `#a8b4bd`, chevron 14.

Chipek: h28, r6, padding `0 12`, label 11; aktív: bg `#17333b`, szöveg `#5bd9ed`;
inaktív: szöveg `#7c8c97`, átlátszó háttér.

### 3.5 Térképkártya (`43:4184`, 412 × 260, r12)

| Rész | Mérés |
| :--- | :--- |
| Kártya | bg `#181c20`, 1px border `#30383e`; kiválasztva `#5bd9ed` |
| Preview | 412 × 148, bg `#11171b`, 24px-es rács `#1c282f` |
| Mapped area | 1.5px `#5bd9ed` (kiválasztva) / `#587681` (egyéb) |
| Falak | 2px `#587681`; belső területek: bg `#20262b`, 1px `#587681` |
| Scan pontok | 1.5px `#5bd9ed` pöttyök a körvonal/falak mentén |
| Base point | 28px gyűrű (bg `#17333b`, 1px) + 6px pont (`#5bd9ed` / `#a8b4bd`) |
| ID chip | bal felül 12px-re, h20, r4, bg `#11171b`, 9 mono dim, padding `4 7` |
| Selection indicator | jobb felül 12px-re, 22px kör; kiválasztva bg+border `#5bd9ed`, 14px check (`#102329`, 2px stroke); egyébként bg `#11171b`, border `#587681` |
| Info | padding 16, gap 12: név 15/600, állapot 9 mono (`SELECTED` accent / `SAMPLE MAP` dim), meta 11 mono (area `#a8b4bd`, 3px elválasztó `#587681`, resolution dim), updated 10 dim |

### 3.6 Selected map panel (`43:5196`, 520 × 760, r12)

| Rész | Mérés |
| :--- | :--- |
| Panel | bg `#181c20`, 1px `#30383e`, r12, flex column |
| Header | h56, padding `0 22`: 17px accent `map` ikon + 14/600 cím; jobb: `DEMO PREVIEW` badge (h20, r4, bg `#30291e`, 9 mono amber, padding `4 8`) |
| Occupancy map | 520 × 260, bg `#11171b`; overlay: `5 meters` + 64px skála, `FRAME / map`, `N ↑`, `BASE POINT` / `TEST AREA` / `LAB / B` címkék |
| Legend | h40, padding `0 22`, felső 1px; 4px accent dot + `Mapped boundary`, 12px crosshair + `Saved base point`, jobb: `2D / OCCUPANCY` 9 mono dim |
| Details | flex 1, padding 22, gap 16 |
| Identity | név 22/600 (ls `−0.5px`) + ID 10 mono dim; leírás 12 `#a8b4bd` |
| Metadata | 2 sor × 3 oszlop, gap 20: label 10 dim, érték 13 mono `#edf2f5` (`Mapped area`, `Dimensions`, `Resolution`, `Coordinate frame`, `Base point`, `Last updated`) |
| File sor | h34, felső 1px, padding-top 10, gap 8: 13px `file` ikon, `robotics_lab.yaml` 10 mono muted, `+ PGM · 1.2 MB` 10 mono dim |
| Connection notice | r6, bg `#30291e`, padding 12, gap 10: 15px `unplug` amber ikon, 11/1.5 amber szöveg |
| Primary gomb | h44, r8, bg `#5bd9ed`, label 13/600 `#102329`, gap 12, 16px `arrow-right` |
| Lábjegyzet | 12px `info` ikon + 10 dim szöveg, középre igazítva |

### 3.7 Footer (`43:5591`)

Meglévő `.status-bar`: `DEMO SESSION` (10 mono amber, ls 0.7) + notice 11 dim,
jobb: `ROS /scan · Live data stream disabled` 10 mono dim.

### 3.8 Tokenek

Minden szín/font már létezik a `style.css`-ben (`--bg`, `--panel`, `--panel-raised`,
`--chart`, `--border`, `--text*`, `--accent`, `--accent-deep`, `--accent-ink`,
`--amber`, `--amber-deep`, `--font-ui`, `--font-mono`).

Új token a `maps.css`-ben:

```css
:root {
    --map-grid: #1c282f;   /* a kártya-preview rácsvonala */
    --map-wall: #587681;   /* fal / körvonal / elválasztó */
    --map-empty: #20262b;  /* belső helyiség kitöltés */
}
```

---

## 4. Adatmodell (`maps-data.js`)

```js
window.MAP_LIBRARY = {
    maps: [
        {
            id: "MAP-001",
            name: "Robotics lab",
            recent: true,
            area: "240 m²",
            resolution: "0.05 m / px",
            updated: "Updated Today, 09:42",
            updatedShort: "Today, 09:42",
            description: "Indoor test environment with two rooms and a central passage.",
            dimensions: "20 × 12 m",
            frame: "map",
            baseCoordinates: "0.00 / 0.00 m",
            file: { name: "robotics_lab.yaml", format: "+ PGM · 1.2 MB" },
            card: { w: 412, h: 148, outline: "M … Z", walls: [[x, y, w, h], …], base: [x, y] },
            hero: { w: 520, h: 260, outline: "M … Z", walls: […], base: […], labels: […] }
        },
        // MAP-002 Office floor, MAP-003 Warehouse aisle, MAP-004 Test arena
    ]
};
```

- A `card` geometria a Figma **kártya-preview** koordinátái (viewBox `0 0 412 148`),
  a `hero` pedig a nagy panel koordinátái (viewBox `0 0 520 260`) — a Figma ezeket
  külön rajzolta, ezért pontosabban így egyeznek.
- Csak a `MAP-001` (Robotics lab) rendelkezik Figmából mért `hero` geometriával.
  A többi térképnél a `hero` a `card` geometriából generálódik (fit + center),
  így a nagy panel minden kiválasztásnál konzisztens marad.
- A scan pontokat **nem** tároljuk: a renderer generálja a falak/körvonal mentén
  determinisztikus mintával (LiDAR-os pöttyözött él).

---

## 5. Interakciók és állapotok

| Interakció | Viselkedés |
| :--- | :--- |
| Kártya kattintás / `Enter` / `Space` | kiválasztás; a jobb panel (név, ID, leírás, meta, fájl, nagy előnézet) frissül; `aria-selected` + fókuszgyűrű |
| Keresés | valós idejű szűrés név és ID alapján (kis/nagybetűtől független); találat nélkül üres állapot kártya |
| Rendezés | `Last updated` (alap), `Name (A–Z)`, `Area (large first)` — natív, stílusozott `<select>` |
| Szűrők | `All maps` (összes) / `Recent` (2 db) — `aria-pressed`, a darabszám az adatból számolva |
| Grid / List nézet | grid = 2 oszlop (design); list = 1 oszlopos kompakt sor (preview 140 × 104, info mellette) |
| `Import map` | rejtett `<input type="file" accept=".yaml,.yml,.pgm,.png">`; kiválasztás után toast: „Demo mode — map import is not persisted.” |
| `Open in Sensor Workspace` | `localStorage["lidar.map"] = {id, name, at}` mentés → `workspace.html` |
| Sign out | `Session.logout()` → session/hint törlés → `auth.html#/auth` (a `workspace.html` logikájával azonos) |
| Mode toggle | `lidar.demoMode` írása (`Session.setDemoMode`), badge + label frissítés (mint a dashboardon) |
| Betöltés | korábbi `lidar.map` visszaolvasása (ha létezik és szerepel a könyvtárban), különben `MAP-001` |

Billentyűzet: a kártyarács `role="listbox"`, a kártyák `role="option"`,
nyilakkal is mozgatható a kiválasztás (Home/End is), `Tab` a fókuszálható elemekre.

---

## 6. Reszponzív viselkedés

| Szélesség | Viselkedés |
| :--- | :--- |
| ≥ 1440 | a design szerinti 840 + 24 + 520 elrendezés |
| 1200–1439 | library rugalmas (`flex: 1`), panel 460-ra szűkül, kártyák `minmax(0,1fr)` |
| 1024–1199 | egy oszlop: library felül, panel alatta (max-width 760, középre) |
| 861–1023 | kártyák 1 oszlop, panel teljes szélesség |
| ≤ 860 | header tördel (meglévő media query), page context tördel, toolbar egymás alatt |
| ≤ 620 | kártya info tömörebb, a metadata 2 oszlop, a legend tördel |

A `prefers-reduced-motion` és a fókusz-stílusok a `style.css`-ből öröklődnek.

---

## 7. Akadálymentesség

- Szemantikus régiók: `header`, `main`, `aside`, `footer`; a panel `aria-live="polite"`.
- Kártyák: `role="option"`, `aria-selected`, látható fókuszgyűrű, `Enter`/`Space`.
- Ikonok: `aria-hidden="true"` + `alt=""` (díszítő), a gombok/chipek szöveges címkét kapnak.
- Kereső: `<label class="sr-only">` + `type="search"`; a rendező valódi `<select>`.
- Toast: `role="status"` + `aria-live="polite"`, 4 s után eltűnik.
- Kontraszt: a design tokenjei (accent `#5bd9ed` a `#181c20`-on ≈ 9:1).

---

## 8. Kockázatok / döntések

| # | Kérdés | Döntés |
| --- | --- | --- |
| 1 | A design headerében nincs sign-out | megtartjuk a meglévő ghost gombot (demó auth miatt) — dokumentált eltérés |
| 2 | A Figma `hero` nagyítás aránya eltér a kártyáétól | külön `card` / `hero` geometria; a nem mért térképeknél generált hero |
| 3 | A scan pontok ~200 ellipse / kártya | nem asset: determinisztikusan generált pöttyök |
| 4 | A `Import map` mögött nincs backend | demo stub (fájlválasztó + toast), nincs hamis perzisztencia |
| 5 | Dashboard átnevezése `workspace.html`-re | a root `/` a főképernyő legyen; az auth átirányítások változatlanok |
| 6 | A kiválasztott térkép nem jelenik meg a dashboardon | szándékosan kívül esik (a dashboard designja nem változik); a `lidar.map` már mentve van a következő szelethez |

---

## 9. Elfogadási kritériumok

- [ ] 1440 × 1000-en a layout a Figma screenshotnak megfelel (sávok, 840/520, 412 × 260 kártyák).
- [ ] A 4 térképkártya a Figma geometriájával rajzolódik (körvonal, falak, base point, rács, ID chip).
- [ ] Kiválasztás frissíti a jobb panelt (név, ID, leírás, 6 metadata mező, fájl, nagy előnézet).
- [ ] Keresés, rendezés, `All maps`/`Recent` szűrő és grid/list váltás működik.
- [ ] `Open in Sensor Workspace` → `workspace.html`, a választás a `localStorage`-ban.
- [ ] Session nélkül az `index.html` → `auth.html#/auth`; belépés után `index.html` (főképernyő).
- [ ] Sign out a főképernyőről is működik.
- [ ] Billentyűzettel bejárható (Tab, nyilak, Enter/Space), fókusz látható.
- [ ] 1024 és 620 px szélességen nincs vízszintes túlcsordulás.
- [ ] Nincs hivatkozás ideiglenes Figma asset URL-re; minden ikon lokális.
