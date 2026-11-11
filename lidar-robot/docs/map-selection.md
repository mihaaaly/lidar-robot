# Map Selection — implementáció

A bejelentkezés utáni **főképernyő** (térképválasztó) implementációja a Figma
`LiDAR · Map selection` frame (`43:4131`, 1440 × 1000) alapján.

- Terv és mérések: [`map-selection-plan.md`](map-selection-plan.md)
- Figma: <https://www.figma.com/design/9FySk0KrG1FfdGGjWj8nPN/Untitled?node-id=26-2>
- Auth réteg: [`auth.md`](auth.md)

---

## Fájlok

```text
web/public/
├── index.html                # Map Selection főképernyő (root URL) + inline guard
├── workspace.html            # Sensor Workspace dashboard (a korábbi index.html)
├── assets/icons/             # 14 ikon SVG export a Figmából
│   ├── arrow-right.svg       ├── file.svg          ├── map.svg
│   ├── check.svg             ├── flask-conical.svg ├── search.svg
│   ├── chevron-down.svg      ├── folder-open.svg   ├── unplug.svg
│   ├── crosshair.svg         ├── info.svg          ├── upload.svg
│   ├── layout-grid.svg       └── list.svg
└── src/
    ├── maps.css              # a főképernyő stílusai (a style.css tokenjeire épül)
    ├── maps-data.js          # demo térképkönyvtár: metaadat + Figma-geometria
    ├── map-storage.js        # a `lidar.map` közös olvasó/író helperje (DOM nélkül)
    ├── maps.js               # renderelés, kiválasztás, keresés, szűrés, toast
    └── workspace-map.js      # a kiválasztott térkép a workspace page-contextben
```

Nincs build és nincs npm dependency. A betöltési sorrend az `index.html`-ben:
`session.js` → `maps-data.js` → `map-storage.js` → `maps.js`; a `workspace.html`
ugyanezt tölti be, a végén a `src/workspace-map.js`-sel. A session-guard inline,
a `<head>`-ben fut (mint a `workspace.html`-en).

---

## Route-ok

| URL | Fájl | Szerep |
| :--- | :--- | :--- |
| `/` (root) | `index.html` | Map Selection — belépés utáni főképernyő |
| `/workspace.html` | `workspace.html` | Sensor Workspace dashboard |
| `/auth.html#/auth*` | `auth.html` | belépés / regisztráció |
| egyik fenti sem | — | session nélkül `auth.html#/auth` |

Az auth átirányítások nem változtak: login/register után továbbra is
`index.html` töltődik — ez most a főképernyő.

---

## Adatmodell (`maps-data.js`)

```js
window.MAP_LIBRARY = {
  storageKey: "lidar.map",
  maps: [{
    id: "MAP-001",            // a kártyán és a panelen látható azonosító
    name: "Robotics lab",
    recent: true,             // a "Recent" szűrőhöz
    order: 0,                 // "Last updated" sorrend
    area: "240 m²", areaValue: 240,
    resolution: "0.05 m / px",
    updated / updatedShort,   // kártya / panel formátum
    description, dimensions, frame, baseCoordinates,
    file: { name, format },
    preview: {                // kártya-preview (viewBox 0 0 412 148)
      width, height,
      outline: { x, y, points },     // poligon, a saját origójához képest
      walls: [[x, y, w, h, kind]],   // kind 1 = helyiség, 0 = fal
      base: [x, y],                  // base point közepe
      dots: { radius, spacing }    // scan-pont sugár és pötty-távolság
    },
    hero: { /* ugyanaz 520 × 260-on + labels */ }
  }]
};
```

- A geometria a Figmából átvett koordináták (kártya és nagy előnézet külön,
  mert a designban eltérő léptékben vannak rajzolva).
- Csak a `MAP-001`-nek van explicit `hero` rajza; a többi térkép kártya-geometriája
  rendereléskor illeszkedik a nagy panel 332 × 164-es területére (`fittedHero`).
- A **scan pontok nem assetek**: a renderer a körvonal és a fal-téglalapok élei
  mentén generál pöttyöket (a falak körül ~1 px kifelé tolva, determinisztikus
  jitterrel), a falak pedig föléjük rajzolódnak — így pontosan a Figma
  előnézeteinek „scan halo” mintája jön ki. A sűrűség: `dots.spacing`
  (kártya 4.2, nagy panel 4.6).

> ⚠️ A `MAP-002`…`MAP-004` metaadata (méret, base point, fájlméret) illusztratív:
> a Figma csak a `Robotics lab` panel adatait tartalmazza.

---

## Viselkedés

| Interakció | Megvalósítás |
| :--- | :--- |
| Kiválasztás | kattintás, `Enter` / `Space`; a panel és a kártya-állapot azonnal frissül |
| Billentyűzet | `role="listbox"` / `role="option"`, nyilak, `Home`, `End`, roving `tabindex` |
| Keresés | élő szűrés név + ID alapján; találat nélkül üres állapot és „Clear search” |
| Rendezés | natív `<select>`: Last updated / Name (A–Z) / Area (largest first) |
| Szűrők | `All maps` / `Recent`, `aria-pressed`, darabszám az adatból |
| Grid / List | `is-list` osztály a rácson; list nézetben kompakt, 140 px magas sorok |
| Import map | rejtett fájlválasztó + toast: a demó nem perzisztál importot |
| Open in Sensor Workspace | `lidar.map` mentése, majd `workspace.html` |
| Sign out | `Session.logout()` → session/hint törlés → `auth.html#/auth` |
| Mode toggle | `lidar.demoMode` írása; a feliratok/badge a választott módhoz igazodnak |
| Betöltés | a korábbi `lidar.map` visszaolvasása; ha nincs/nem érvényes: `MAP-001` |

A kiválasztás sémája:

```js
// localStorage["lidar.map"]
{ "id": "MAP-001", "name": "Robotics lab", "at": 1730000000000 }
```

A sémát egyetlen hely olvassa és írja: a `src/map-storage.js` `window.MapStorage`
objektuma (`KEY`, `read`, `resolve`, `save`). A `maps.js` és a workspace is ezen
keresztül éri el, így a hibakezelés (hiányzó kulcs, hibás JSON, nem-string `id`,
ismeretlen `id`, tiltott `localStorage`) egy helyen van, és DOM nélkül tesztelhető
(`server/test/frontend-map-storage.test.js`).

---

## Workspace map context

A `workspace.html` page-context sávja (a `Sensor Workspace` cím jobb oldalán) a
`localStorage["lidar.map"]` kiválasztást mutatja; a bekötés a `src/workspace-map.js`.

| Elem | Forrás | Üres / érvénytelen állapot |
| :-- | :-- | :-- |
| név | `map.name` | `No map selected` |
| azonosító | `map.id` (mono) | üres, a CSS `:empty` rejti |
| részletek | `map.dimensions + " · base " + map.baseCoordinates` | üres, a CSS `:empty` rejti |
| link | `href="./"` (a `/` térképválasztó), felirata `Change map` | felirata `Choose map` |

- A feloldás `window.MapStorage.resolve(localStorage, MAP_LIBRARY.maps)`: ismeretlen
  vagy törölt `id` → üres állapot, **nincs** csendes visszaesés a `MAP-001`-re.
- Üres/hibás állapotban az oldal nem irányít át, tehát a deep link és a refresh
  működik; a szerveroldali session gate változatlan.
- A gyökér `data-state` attribútuma `selected` / `empty`; a `MAP_LIBRARY` a
  `maps-data.js`-ből jön, tehát a dashboard ugyanazt a demó könyvtárat használja,
  mint a főképernyő. A robot-oldali `maps` táblához még nem kapcsolódik.

---

## Design-eltérések (szándékos)

| # | Eltérés | Ok |
| --- | --- | --- |
| 1 | A headerben megmaradt a **Sign out** ghost gomb | a demó auth miatt a főképernyőről is ki kell tudni lépni; a design headerében nincs rá hely |
| 2 | **List nézet** (a Figmában csak grid van) | a design view-toggle-ja két állapotot sugall; a list nézet kompakt sorokat rajzol |
| 3 | Üres keresés állapot, toast | a Figma nem ábrázolja ezeket az állapotokat |
| 4 | A `MAP-002`…`MAP-004` panel-adatai illusztratívak | a Figma csak egy kiválasztott térképet részletez |

---

## Reszponzív viselkedés

| Szélesség | Elrendezés |
| :--- | :--- |
| ≥ 1440 | 840 (library) + 24 + 520 (panel), 412 × 260 kártyák |
| 1200–1439 | rugalmas library, a kártya-preview `aspect-ratio: 412 / 148` szerint skálázódik |
| ≤ 1199 | egy oszlop: library felül, panel alatta (max. 760 px, középre igazítva) |
| ≤ 960 | 2 oszlopos kártyarács marad |
| ≤ 700 | 1 oszlopos kártyarács, 2 oszlopos metadata |
| ≤ 620 | tördelt legend, teljes szélességű import gomb, list nézet oszlopba fordul |

A header/page-context/footer tördelése a `style.css` meglévő media query-jeiből
jön, ezért a főképernyő ugyanazt a viselkedést örökli.

---

## Ellenőrzés

Vizuális egyeztetés a Figma 1440 × 1000-es exportjával (pixel-diff + overlay):
a sávok, a 840/520-as oszlopok, a 412 × 260-as kártyák, a kártya- és panel-geometria
1 px-en belül egyeznek. Az eltérések: a sign-out gomb (1. eltérés), a scan-pont
minta (generált, nem exportált) és a szöveg-rasterizálás.

Funkcionális ellenőrzés (headless Chromium, CDP):

- [x] 4 kártya, alapból `MAP-001` kiválasztva
- [x] kattintás → panel + `aria-selected` + `localStorage` frissül
- [x] keresés (`office` → `MAP-002`), üres állapot, „Clear search”
- [x] `Recent` → `MAP-001`, `MAP-002`; rendezés név szerint helyes sorrendet ad
- [x] list nézet osztály és layout; nyílbillentyű + fókusz működik
- [x] újratöltés után a kiválasztás megmarad
- [x] sign out → `auth.html#/auth`
- [x] nincs vízszintes túlcsordulás 1440 / 1024 / 620 px-en
- [x] nincs konzolhiba egyik nézetben sem

---

## Következő lépések (nem része ennek a szeletnek)

1. Valódi térképkönyvtár: a `maps-data.js` cseréje a robotról jövő
   `map_server` listára / Node-RED SQLite `maps` táblára (lásd `interface.md`).
2. Feltöltés: az `Import map` bekötése (YAML + PGM validáció, mentés a robotra).
3. A scan-pontok generálása helyett élő `/scan` alapú előnézet, ha lesz valós
   ROS kapcsolat.
