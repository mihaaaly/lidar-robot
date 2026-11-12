# Auth backend (szerveroldali session) — implementációs terv

> **Státusz:** jóváhagyásra kész. Ez a dokumentum a web UI valódi, szerveroldali
> auth backendjének terve. **Ebben a sessionben csak a terv készül el**, a kód
> implementációja külön forkban/branchben történik.
>
> **Kiinduló branch:** `web-ui-init` — ide legfeljebb a terv dokumentum
> commitja kerül (kód nem; lásd 15.1).
> **Implementációs branch:** `feat/auth-backend` — a `web-ui-init`-ről
> létrehozva; **minden kódcommit ide megy**, a `web-ui-init` az implementáció
> alatt érintetlen marad.
>
> **Kapcsolódó dokumentumok:**
> [`auth.md`](auth.md) (jelenlegi auth implementáció),
> [`auth-startpage-plan.md`](auth-startpage-plan.md) (a belépő képernyők terve),
> [`map-selection.md`](map-selection.md) (belépés utáni főképernyő),
> [`../README.md`](../README.md) (architektúra és deploy),
> [`../deploy/README.md`](../deploy/README.md) (Pi telepítés).

---

## 0. Kiindulási állapot — mi van már a repóban?

A frontend **már tartalmazza a szerver mód kliensoldalát**, csak a backend
hiányzik. Ez a terv pontosan ehhez a már létező contracthoz igazodik; a
frontendet csak egy ponton kell javítani (lásd 11.2).

| Hol | Mi van már | Állapot |
| :--- | :--- | :--- |
| `web/public/src/session.js` | `hasBackend()`, `hasServerHint()`, `detectBackend()`, `api()`, `logout()`, `clearServerHint()`, `requireAuth()` | kész, backend-kompatibilis |
| `web/public/src/auth.js` | demo/szerver mód elágazás, `/api/auth/login`, `/api/auth/register`, hibakód-feldolgozás (400/401/409/429) | kész |
| `web/public/auth.html` | korai redirect, cookie-ellenőrzés, `lidar_auth` hint | kész |
| `web/public/index.html`, `workspace.html` | inline guard, ami a `lidar_auth=1` hint cookie-t is elfogadja | kész |
| `web/public/src/maps.js`, `src/app.js` | `Session.logout()` hívás sign-outnál, 5 s timeout | kész |
| `lidar-robot/server/` | — | **hiányzik** (a korábbi prototípus nem került be a gitbe) |
| `deploy/systemd/webui.service` | statikus demo: `python3 -m http.server 8080` | megvan, ez a fallback |
| `docs/auth.md`, `README.md` | jelenleg „nincs backend” állítások | frissítendő |

### 0.1 A frontend által elvárt contract (ez a backend „vevőspecifikációja”)

| Elvárás | Konkrétum |
| :--- | :--- |
| Backend marker | `lidar_backend=1` olvasható cookie; enélkül a frontend nem hívja az API-t |
| Health | `GET /api/auth/health` → `{ "service": "lidar-auth", ... }` |
| Login | `POST /api/auth/login` `{email, password, remember}` → `{user:{email, name}}` |
| Register | `POST /api/auth/register` `{name, email, password, consent}` → `{user:{email, name}}` |
| Logout | `POST /api/auth/logout` → `result.ok === true` |
| Session hint | sikeres login/register után olvasható `lidar_auth=1` cookie |
| Session | `HttpOnly` `lidar_session` cookie; JS nem látja |
| Hiba | `{error:{message, fields?}}`; `fields` kulcsai: `name`, `email`, `password`, `consent` |
| Státuszkódok | `400` validáció, `401` rossz hitelesítés, `409` foglalt email, `429` rate limit |
| Rate limit | `Retry-After` header (másodpercben) |
| Origin | same-origin JSON POST; a frontend `credentials: "same-origin"`-t küld |

> A `session.js` `detectBackend()` **csak akkor** próbálja a health endpointot, ha
> a `lidar_backend=1` marker cookie jelen van. Ha a marker ott van, de a health
> nem válaszol, a frontend **nem esik vissza** a demó loginra, hanem hibát mutat.
> Ez szándékos biztonsági döntés: a marker jelenléte azt jelenti, hogy valódi
> backendnek kell lennie.

---

## 1. Cél és hatókör

### 1.1 Ebben a szeletben

- `lidar-robot/server/`: önálló, **nulla npm függőségű** Node.js szolgáltatás.
- Valódi regisztráció, login, session, logout; jelszó **scrypt** hash-sal.
- Session **SQLite**-ban, a böngészőben csak `HttpOnly` cookie-ban.
- A web UI statikus fájljait is ez a szolgáltatás szolgálja ki, és a védett
  oldalakat (`/`, `/index.html`, `/workspace.html`) **szerveroldalon** kapuzza.
- Rate limit, Origin/CSRF védelem, body limit, biztonsági headerek.
- Admin CLI: felhasználó létrehozás, jelszó reset, lista, törlés, DB backup.
- Pi telepítés: systemd unit, env fájl, offline működés, régi statikus service
  kiváltása.
- A meglévő statikus demo (python `http.server`) **megmarad** fallbacknak.
- Tesztek: `node:test` unit + integrációs tesztek, valamint manuális Pi E2E.
- Dokumentáció frissítése (`docs/auth.md`, `README.md`, `server/README.md`,
  `deploy/README.md`).

### 1.2 Nem része ennek a szeletnek

- **rosbridge (9090) és Node-RED (1880) védelme.** Ezek továbbra is nyitottak a
  LAN-on; a login önmagában nem védi a robotot, ha valaki közvetlenül a
  rosbridge-hez csatlakozik. Ez külön feladat (Nginx WebSocket proxy +
  session-ellenőrzés, illetve Node-RED admin auth).
- TLS termináció. A Pi marad HTTP a megbízható LAN-on; a `COOKIE_SECURE` és a
  `TRUST_PROXY` env elő van készítve a későbbi Nginx + TLShez.
- Jelszó-visszaállítás e-mailben, 2FA, OAuth, meghívókód, szerepkörök.
- Felhasználói profil UI, fióktörlés UI, több robot / multi-tenant.
- Sliding session (a session abszolút lejáratú; lásd 8.2).
- A statikus demo megszüntetése; a `webui.service` megmarad demóhoz.

---

## 2. Jóváhagyott döntések

| # | Kérdés | Döntés |
| :--- | :--- | :--- |
| 1 | Futtatási környezet | **Lokálisan és a Pi-n is.** A backend a repó része; a Pi-n systemd service, offline is működik. A statikus demo fallback megmarad. |
| 2 | Stack | **Node.js >= 22.16, stdlib only** (`node:http`, `node:sqlite`, `node:crypto`). Nincs npm dependency, nincs build. |
| 3 | Regisztráció | **Nyílt, env kapcsolóval** (`ALLOW_REGISTRATION=1` default; a Pi-n `0`). Éles fiókot admin CLI is létrehozhat. |
| 4 | TLS | **HTTP most**, a LAN-on; `COOKIE_SECURE` / `TRUST_PROXY` env a későbbi Nginx + TLShez. |
| 5 | Védett hatókör | **Csak a web UI + `/api/auth/*`.** A rosbridge/Node-RED nyitva marad, dokumentált korlát. |
| 6 | Statikus kiszolgálás | A Node service szolgálja ki a `web/public`-t is (egy process, egy port). Az Nginx opcionális TLS reverse proxy, nem kötelező. |
| 7 | Session lejárat | Remember: 7 nap; egyébként 24 óra. Abszolút lejárat, nincs sliding. |
| 8 | Session token | 32 random bájt base64url a cookie-ban; a DB-ben csak `SHA-256(token)`. |
| 9 | Jelszó | scrypt (N=16384, r=8, p=1, 16 bájt só, 64 bájt kulcs), `scrypt$N$r$p$salt$hash` formátum. |
| 10 | Rate limit | In-memory: login IP 20/15 perc, login email 10/15 perc, register IP 10/óra; `429` + `Retry-After`. |
| 11 | Session tároló | SQLite (WAL), `PRAGMA user_version` migráció, fájl 0600, könyvtár 0700. |
| 12 | Pi Node verzió | NodeSource Node 22 LTS (>= 22.16). A service induláskor ellenőrzi és érthető hibával leáll, ha régebbi. |
| 13 | Pi port | 8080 (a meglévő URL marad). A régi `webui.service`-t le kell tiltani, különben bypass marad. |
| 14 | Nginx | Ha van Nginx, az **nem** szolgálhatja közvetlenül a `web/public`-t. Vagy le van tiltva, vagy reverse proxy a Node service felé (opcionális TLS). |
| 15 | Admin jelszó reset | CLI (`users.js passwd`), nem e-mail. A „Forgot password?” a UI-n stub marad. |
| 16 | Branch | A `web-ui-init`-en csak a terv dokumentum commitja; **minden implementáció az új `feat/auth-backend` ágon** (15.1). |

---

## 3. Architektúra

### 3.1 Folyamat és rétegek

```
Böngésző (LAN)
   │  HTTP :8080
   ▼
Node.js auth service (server/server.js)
   ├─ security middleware: Origin, Content-Type, body limit, headerek, log
   ├─ /api/auth/*  →  auth handlers  →  SQLite (auth.db)
   └─ statikus fájlok  →  web/public  +  szerveroldali gate
```

- **Egy process, egy port.** A Node service az API-t és a statikus UI-t is
  kiszolgálja. Így a session cookie same-origin, nincs CORS, és a védett
  oldalak szerveroldalon kapuzhatók.
- Az SQLite ugyanabban a processben fut (`node:sqlite`), nincs külön DB server.
- A statikus demo (`python3 -m http.server`) továbbra is működik, de akkor nincs
  `lidar_backend` marker, és a kliensoldali guard a kapu.

### 3.2 Kérési útvonalak

| Kérés | Session | Eredmény |
| :--- | :--- | :--- |
| `GET /` vagy `/index.html` | nincs | `302 → /auth.html#/auth` |
| `GET /` vagy `/index.html` | van | `200`, a Map Selection oldal |
| `GET /workspace.html` | nincs | `302 → /auth.html#/auth` |
| `GET /auth.html` | nincs | `200`, login oldal |
| `GET /auth.html` | van + `lidar_auth=1` | `302 → /` |
| `GET /auth.html` | van, de nincs hint | `200` (loop-védelem; a kliens dönt) |
| `GET /src/*`, `/assets/*`, `/js/*` | bármi | `200`, statikus asset |
| `GET /api/auth/health` | bármi | `200` + `lidar_backend=1` |
| `GET /api/auth/session` | bármi | `200 {authenticated:false}` vagy `{authenticated:true,...}` |
| `POST /api/auth/login` | bármi | `200` + session cookie-k / hiba |
| `POST /api/auth/register` | bármi | `201` + session cookie-k / hiba |
| `POST /api/auth/logout` | bármi | `200 {ok:true}`, cookie-k törölve |
| egyéb | — | `404` (nincs directory listing, nincs SPA fallback) |

### 3.3 Miért a Node szolgálja a statikus fájlokat?

- A szerveroldali gate így valódi: a védett HTML-t a Node nem adja ki session
  nélkül. Ha az Nginx szolgálná a statikus fájlokat, a kaput `auth_request`-tel
  kellene megoldani (több mozgó alkatrész, külön Nginx config).
- Egy process → egy systemd unit → egyszerűbb Pi üzemeltetés.
- Az Nginx később bekerülhet TLS reverse proxyként; a Node ekkor
  `127.0.0.1`-re hallgat, és `TRUST_PROXY=1`-et kap.

### 3.4 A szerveroldali gate és a kliensoldali guard viszonya

- **Server módban a valódi kapu a szerver.** A kliensoldali inline guard
  (index/workspace `auth-pending`) csak UX fallback; a `lidar_auth=1` hint
  cookie miatt nem villan fel a login.
- **Static demo módban** (nincs `lidar_backend` marker) a kliensoldali guard a
  kapu, ahogy eddig.
- A szerver a `lidar_auth=1` hintet **minden hitelesített válaszon** újraküldi,
  így a guard és a korai redirect nem tud elakadni.
- Ha a session érvényes, de a hint cookie hiányzik, a `/auth.html` **nem**
  redirectel `/`-re (különben redirect loop lehetne); a válaszon viszont
  beállítja a hintet, így a kliens a következő kérésnél már továbblép. Ha a
  böngésző a cookie-t blokkolja, a login oldal látszik; új login után minden
  helyreáll.

---

## 4. Fájlszerkezet

```text
lidar-robot/
├── server/                          # ÚJ — auth backend + statikus UI
│   ├── package.json                 # scripts, engines; NINCS dependencies
│   ├── README.md                    # üzemeltetési és API doksi
│   ├── server.js                    # entry point: config check, listen, shutdown
│   ├── app.js                       # request router + middleware (tesztelhető factory)
│   ├── lib/
│   │   ├── config.js                # env parsing, validáció, defaults
│   │   ├── db.js                    # DatabaseSync, PRAGMA-k, migrációk
│   │   ├── users.js                 # user CRUD, email normalizálás
│   │   ├── passwords.js             # scrypt hash/verify, dummy hash
│   │   ├── sessions.js              # token generálás/hash, session CRUD
│   │   ├── validate.js              # email/name/password/consent validáció
│   │   ├── ratelimit.js             # in-memory sliding window
│   │   ├── cookies.js               # parse/serialize, Set-Cookie lista
│   │   ├── http.js                  # JSON válasz, error envelope, body reader
│   │   ├── security.js              # Origin, Sec-Fetch-Site, Content-Type
│   │   ├── static.js                # statikus kiszolgálás + gate + path safety
│   │   └── log.js                   # JSON lines logger, request id
│   ├── bin/
│   │   └── users.js                 # admin CLI: add/list/passwd/remove/backup
│   ├── data/                        # lokális runtime DB (gitignore)
│   │   └── .gitkeep
│   └── test/
│       ├── helpers.js               # temp DB, app indítás, cookie jar, fetch
│       ├── passwords.test.js
│       ├── validate.test.js
│       ├── ratelimit.test.js
│       ├── cookies.test.js
│       ├── static.test.js
│       └── api.test.js              # integráció: regisztráció/login/session/logout/gate
├── deploy/
│   ├── systemd/
│   │   ├── lidar-auth.service       # ÚJ — a Node auth service
│   │   └── webui.service            # MEGMARAD — statikus demo (python)
│   ├── lidar-auth.env.example       # ÚJ — /etc/lidar-auth.env minta
│   ├── lidar-auth-users.sh          # ÚJ — CLI wrapper az env fájllal
│   └── README.md                    # MÓDOSUL — auth service telepítés
├── web/public/
│   └── src/session.js               # MÓDOSUL — logout 401 kezelés (11.2)
├── docs/
│   ├── auth.md                      # MÓDOSUL — server mód
│   └── auth-backend-plan.md         # ÚJ — ez a dokumentum
├── README.md                        # MÓDOSUL — 6.1 + repo tree
└── .gitignore                       # ÚJ — DB, env, node_modules
```

**Miért nem `web/server/`?** A backend nem a statikus web root része; a
`server/` a repó gyökerén a README architecture tree-jében is így szerepelt, és
a Pi deploy külön mappaként kezeli.

---

## 5. Konfiguráció

### 5.1 Env változók

| Változó | Default | Leírás |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | `development` → rövidebb log, részletesebb hiba |
| `AUTH_HOST` | `127.0.0.1` | Bind address. Pi-n `0.0.0.0`; Nginx mögött `127.0.0.1`. |
| `AUTH_PORT` | `8787` | Port. Pi-n `8080` (a meglévő URL). |
| `AUTH_DB_PATH` | `./data/auth.db` | SQLite fájl; a `server/` mappához relatívan oldjuk fel. Pi-n `robot/data/auth.db`. |
| `WEB_ROOT` | `../web/public` | Statikus web root; a `server/` mappához relatívan. |
| `PUBLIC_ORIGIN` | üres | Pl. `http://<pi-ip>:8080`. Ha üres, a `Host` headerből deriváljuk. |
| `TRUST_PROXY` | `0` | `1` csak Nginx reverse proxy mögött; ekkor `X-Forwarded-For` / `X-Forwarded-Proto` használható. |
| `COOKIE_SECURE` | `0` | `1` csak HTTPS-en; HTTP-n a `Secure` cookie nem menne át. |
| `ALLOW_REGISTRATION` | `1` | `0` → a register `403`; a Pi env-ben `0` ajánlott. |
| `SESSION_REMEMBER_DAYS` | `7` | Remember me session hossza. |
| `SESSION_HOURS` | `24` | Nem-remember session hossza. |
| `LOGIN_IP_LIMIT` | `20` | Login kísérlet / IP / ablak. |
| `LOGIN_EMAIL_LIMIT` | `10` | Login kísérlet / email / ablak. |
| `LOGIN_WINDOW_MIN` | `15` | Login rate limit ablak. |
| `REGISTER_IP_LIMIT` | `10` | Register / IP / ablak. |
| `REGISTER_WINDOW_MIN` | `60` | Register rate limit ablak. |
| `BODY_LIMIT_BYTES` | `16384` | JSON body limit. |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`, `silent`. |
| `SCRYPT_N` | `16384` | Csak tesztben csökkentjük (pl. 1024). |

### 5.2 Validáció induláskor

A `config.js` az indulásnál ellenőriz és **érthető hibával leáll**, ha:

- a Node verzió `< 22.16.0` (a `node:sqlite` és a `backup()` miatt);
- a port nem 1–65535 közé esik;
- a `WEB_ROOT` nem létezik vagy nem könyvtár;
- a `PUBLIC_ORIGIN` nem érvényes origin (nincs path/query);
- `COOKIE_SECURE=1`, de a `PUBLIC_ORIGIN` `http://`-vel kezdődik (figyelmeztetés);
- `TRUST_PROXY=1`, de `AUTH_HOST=0.0.0.0` (a proxy megkerülhető; figyelmeztetés);
- az `ALLOW_REGISTRATION` értéke nem `0`/`1`.

### 5.3 Példa — lokális fejlesztés

```bash
cd lidar-robot/server
AUTH_PORT=8787 node server.js
# http://127.0.0.1:8787/auth.html#/auth
```

Az első indulás létrehozza a `server/data/auth.db`-t. Regisztrálni lehet
(`ALLOW_REGISTRATION=1` default), vagy admin CLI-vel létrehozni a fiókot.

### 5.4 Indítás és leállítás

- A `server.js` a `SIGTERM` / `SIGINT` jelre leállítja a HTTP szervert
  (`server.close()`), lezárja a DB-t (`db.close()`), majd kilép. 5 másodperc
  után `process.exit(1)` kényszerített leállás (systemd `TimeoutStopSec`).
- `uncaughtException` / `unhandledRejection` → log + `process.exit(1)`; a
  systemd `Restart=on-failure` újraindítja. A részlegesen megírt DB tranzakciót
  az SQLite visszagörgeti.
- A takarító és rate-limit időzítők `unref()`-eltek, hogy ne tartsák életben a
  processzt.
- Induláskor: config validáció → DB megnyitás + migráció → HTTP listen. Ha a
  listen vagy a DB megnyitás hibázik, a process nem marad félig futó állapotban.

### 5.5 Példa — Pi (`/etc/lidar-auth.env`)

```bash
NODE_ENV=production
AUTH_HOST=0.0.0.0
AUTH_PORT=8080
AUTH_DB_PATH=/home/admin/lidar-robot/lidar-robot/robot/data/auth.db
WEB_ROOT=/home/admin/lidar-robot/lidar-robot/web/public
PUBLIC_ORIGIN=
ALLOW_REGISTRATION=0
COOKIE_SECURE=0
TRUST_PROXY=0
LOG_LEVEL=info
```

> Ha a Pi IP-je DHCP-vel változhat, hagyd üresen a `PUBLIC_ORIGIN`-t (a `Host`
> headerből derivál), vagy adj DHCP reservationt és írd be a fix IP-t.
>
> A `PUBLIC_ORIGIN`-nek **pontosan** egyeznie kell a böngésző címsorában
> látható originnal (séma + host + port). Ha `http://<pi-ip>:8080` van
> beállítva, de a böngésző `http://robot.local:8080`-on nyitja meg, a POST-ok
> `403 forbidden_origin`-t kapnak. Ilyenkor vagy egységesítsd a címet, vagy
> hagyd üresen a változót.

---

## 6. Adatbázis

### 6.1 Séma (v1)

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  remember   INTEGER NOT NULL DEFAULT 0,
  ip         TEXT,
  user_agent TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

PRAGMA user_version = 1;
```

- Az emailt **normalizálva** (trim + lowercase) tároljuk; a `COLLATE NOCASE`
  csak védelem a jövőbeli eltérések ellen.
- Az időbélyegek **milliszekundum** (`Date.now()`), INTEGER.
- A `token_hash` a session token SHA-256 hexje; a nyers token **soha** nincs a
  DB-ben.
- A `remember` 0/1; a cookie Max-Age ettől függ.
- A `STRICT` táblák a Node 22/24 beépített SQLite-jában működnek; ha a Pi
  SQLite-ja régi lenne, a `STRICT` elhagyható (a terv a Node beépített SQLite-ját
  használja, nem a rendszerét).

### 6.2 Migrációk

- Induláskor: `PRAGMA user_version` olvasása; ha `0`, létrehozzuk a táblákat és
  beállítjuk `1`-re; egy tranzakcióban.
- Későbbi séma-változás: `user_version` növelése + idempotens `ALTER TABLE`
  lépések. A v1-ben csak a fenti séma van.
- A CLI ugyanazt a `db.js` migrációt futtatja, így a service nélkül is működik.

### 6.3 Fájl- és könyvtárjogok

- A DB könyvtárát `fs.mkdirSync(dir, { recursive: true, mode: 0o700 })` hozza
  létre.
- A DB fájl `chmod 600`; a WAL/SHM fájlok a DB módját öröklik.
- A systemd unit `UMask=0077`.
- A `web/public` csak olvasható a service számára.

### 6.4 Backup / restore

- CLI: `node bin/users.js backup --out /path/auth-YYYY-MM-DD.db` — a
  `node:sqlite` `backup()` API-jával konzisztens másolatot készít járó service
  mellett is.
- Alternatíva: service stop → `cp auth.db auth.db.bak` (a WAL miatt a service
  álljon le, vagy használd a CLI-t).
- A backup jelszó-hasheket tartalmaz → kezeld úgy, mint a DB-t (0600, titkos
  hely).
- Restore: service stop → a backupot `auth.db`-re másolni → service start.
  A séma `user_version`-je a backupban van; ha régebbi, a service migrálja.

---

## 7. API contract

### 7.1 Közös szabályok

- **JSON only:** a `POST` kéréseknél `Content-Type: application/json`
  kötelező (`application/json; charset=utf-8` is elfogadott). Egyébként `415`.
- **Body limit:** 16 KB (env); túllépés → `413`.
- **Válasz:** `Content-Type: application/json; charset=utf-8`,
  `Cache-Control: no-store`.
- **Hiba envelope:**
  ```json
  {
    "error": {
      "code": "validation_error",
      "message": "Check the highlighted fields.",
      "fields": { "email": "Enter a valid email address." },
      "requestId": "8f0c..."
    }
  }
  ```
  A `fields` opcionális; a `requestId` opcionális (logkorreláció).
- **Siker:** a `user` objektum csak `{ email, name }`; jelszó, hash, token soha.
- **Státuszkódok:** lásd 7.7.
- **Metódus:** nem támogatott metódus → `405` + `Allow` header.
- **Ismeretlen API útvonal:** `404` JSON envelope-pal.
- **CORS:** nincs `Access-Control-Allow-Origin`; same-origin only.
- **Cookie-k:** lásd 8. szakasz.

### 7.2 `GET /api/auth/health`

Publikus. A frontend `detectBackend()` ezt hívja.

**200:**
```json
{
  "service": "lidar-auth",
  "status": "ok",
  "version": "1.0.0",
  "time": 1730000000000
}
```
- Minden válaszon beállítja a `lidar_backend=1` markert.
- DB ellenőrzés (`SELECT 1`); ha a DB hibás → `503`
  `{"service":"lidar-auth","status":"error"}`.

### 7.3 `POST /api/auth/register`

**Request:**
```json
{
  "name": "Alex Morgan",
  "email": "alex.morgan@robotics.io",
  "password": "correct-horse-9!",
  "consent": true
}
```

**Sikeres `201`:**
```json
{
  "user": { "email": "alex.morgan@robotics.io", "name": "Alex Morgan" },
  "expiresAt": 1730604800000
}
```
- Session: **7 nap** (a regisztráció mindig remember, ahogy a frontend várja).
- Cookie-k: `lidar_session` (HttpOnly), `lidar_auth=1`, `lidar_backend=1`.
- A jelszó scrypt hash-sal kerül a DB-be; a válaszban nem jelenik meg.
- Ha `ALLOW_REGISTRATION=0` → `403 registration_disabled`.
- Ha az email már létezik → `409 email_taken`. A duplikációt a beszúrás
  `INSERT ... ON CONFLICT(email) DO NOTHING` + `changes === 0` ellenőrzéssel
  kezeli (race-safe, mert a scrypt aszinkron, így két kérés összefuthat).
- Ha a consent nem `true` → `400` `fields.consent`.
- Ha a jelszó gyenge → `400` `fields.password`.
- Ha a név/email hibás → `400` a megfelelő `fields` kulccsal.

**Validáció (szerveroldal, ugyanaz mint a frontend):**

| Mező | Szabály | Hibaüzenet |
| :--- | :--- | :--- |
| `name` | trim után 2–80 karakter, nincs vezérlőkarakter | `Enter your name.` |
| `email` | trim + lowercase, max 254, `^[^\s@]+@[^\s@]+\.[^\s@]+$` | `Enter your email address.` / `Enter a valid email address.` |
| `password` | 12–1024 karakter, >= 1 szám, >= 1 nem alfanumerikus | `Use at least 12 characters, including a number and a symbol.` |
| `consent` | strict `true` | `Accept the Terms of Service and Privacy Policy to continue.` |

### 7.4 `POST /api/auth/login`

**Request:**
```json
{ "email": "alex.morgan@robotics.io", "password": "correct-horse-9!", "remember": true }
```

**Sikeres `200`:**
```json
{
  "user": { "email": "alex.morgan@robotics.io", "name": "Alex Morgan" },
  "expiresAt": 1730604800000
}
```
- `remember: true` → `lidar_session` `Max-Age=604800` (7 nap), DB `expires_at`
  = +7 nap.
- `remember: false` → `lidar_session` session cookie (nincs Max-Age), DB
  `expires_at` = +24 óra.
- A login előtt a kliens esetleges régi session tokenjét töröljük (cookie
  rotáció), majd újat adunk.
- Helytelen email **vagy** jelszó → `401 invalid_credentials`, ugyanazzal a
  szöveggel és (dummy scrypttel) hasonló időzítéssel.
- Rate limit → `429` + `Retry-After`.
- A válasz `Set-Cookie`-i: `lidar_session`, `lidar_auth=1`, `lidar_backend=1`.

### 7.5 `GET /api/auth/session`

Publikus; a session állapotát adja vissza. A frontend jelenleg nem használja,
de a tesztek és a jövőbeli UI használhatja.

**200, van session:**
```json
{
  "authenticated": true,
  "user": { "email": "alex.morgan@robotics.io", "name": "Alex Morgan" },
  "expiresAt": 1730604800000
}
```
**200, nincs session:**
```json
{ "authenticated": false }
```
- Érvénytelen/lejárt token esetén a szerver törli a session sort és a
  cookie-kat (`lidar_session`, `lidar_auth`), a `lidar_backend` markert
  megtartja.
- Érvényes sessionnél a cookie-k TTL-je frissül (a lejárat nem tolódik).

### 7.6 `POST /api/auth/logout`

**Request:** `{}` (üres body is elfogadható).

**200:**
```json
{ "ok": true }
```
- A session tokenhez tartozó DB sort törli (ha van).
- `lidar_session` és `lidar_auth` → `Max-Age=0`.
- **A `lidar_backend=1` marker megmarad** (különben a frontend demó módba
  esne vissza).
- Idempotens: ismeretlen/lejárt tokenre is `200 {ok:true}`.

### 7.7 Státusz- és hibakódok

| HTTP | `error.code` | Mikor | `fields` |
| ---: | :--- | :--- | :--- |
| `400` | `validation_error` | hiányzó/érvénytelen mező, rossz JSON | igen |
| `400` | `invalid_json` | a body nem parse-olható JSON | nem |
| `400` | `bad_request` | nem objektum body, hiányzó Host | nem |
| `401` | `invalid_credentials` | rossz email vagy jelszó | nem |
| `403` | `registration_disabled` | `ALLOW_REGISTRATION=0` | nem |
| `403` | `forbidden_origin` | nem egyező `Origin` / cross-site | nem |
| `404` | `not_found` | ismeretlen API útvonal | nem |
| `405` | `method_not_allowed` | rossz metódus | nem |
| `409` | `email_taken` | már létező email | nem |
| `413` | `payload_too_large` | body > limit | nem |
| `415` | `unsupported_media_type` | nem JSON Content-Type | nem |
| `429` | `rate_limited` | limit túllépés | nem |
| `500` | `internal_error` | váratlan hiba | nem |
| `503` | `unavailable` | DB hiba / health | nem |

- A `429` válasz **mindig** tartalmaz `Retry-After: <másodperc>` fejlécet.
- A `405` válasz `Allow: POST` / `Allow: GET, HEAD` fejlécet tartalmaz.
- Az `500` válasz nem szivárogtat stack trace-t; a részletek a logban vannak.

### 7.8 Példák (`curl`)

```bash
# health
curl -i http://127.0.0.1:8787/api/auth/health

# register (cookie jar)
curl -i -c /tmp/jar.txt -H 'Content-Type: application/json' \
  -d '{"name":"Alex Morgan","email":"alex@example.com","password":"correct-horse-9!","consent":true}' \
  http://127.0.0.1:8787/api/auth/register

# login
curl -i -c /tmp/jar.txt -H 'Content-Type: application/json' \
  -d '{"email":"alex@example.com","password":"correct-horse-9!","remember":true}' \
  http://127.0.0.1:8787/api/auth/login

# session
curl -i -b /tmp/jar.txt http://127.0.0.1:8787/api/auth/session

# logout
curl -i -b /tmp/jar.txt -X POST -H 'Content-Type: application/json' -d '{}' \
  http://127.0.0.1:8787/api/auth/logout
```

---

## 8. Cookie contract

### 8.1 Cookie-k

| Cookie | HttpOnly | Secure | SameSite | Path | Max-Age | Szerep |
| :--- | :---: | :---: | :--- | :--- | :--- | :--- |
| `lidar_session` | **igen** | `COOKIE_SECURE` | `Lax` | `/` | remember: 7 nap; egyébként session cookie | A nyers session token (32 bájt base64url) |
| `lidar_auth` | nem | `COOKIE_SECURE` | `Lax` | `/` | a session hátralévő TTL-je; remember=0 esetén session cookie | Redirect-loop elleni hint; a frontend olvassa |
| `lidar_backend` | nem | `COOKIE_SECURE` | `Lax` | `/` | 1 nap (minden válaszon frissül) | Azt jelzi, hogy valódi backend van; e nélkül a frontend demó módban marad |

- A `lidar_session` értéke soha nem kerül a válasz JSON-jébe vagy a logba.
- A `lidar_auth` / `lidar_backend` értéke pontosan `1`.
- A cookie-k **host-only**-k (nincs `Domain`), `Path=/`.
- A `Secure` flag csak HTTPS-en lehet 1; HTTP-n a böngésző eldobná a cookie-t.
- `__Host-` prefix nem használható, mert az `Secure`-t követel; a TLS bevezetése
  után megfontolható (átnevezéssel, frontend változással).

### 8.2 Session életciklus

1. **Login/register:** új token generálás (`randomBytes(32).toString('base64url')`),
   `token_hash = sha256(token)` a DB-be, a nyers token a cookie-ba.
2. **Minden hitelesített kérés:** a cookie tokenjének hash-ével keresés a
   `sessions` táblában; ha van és `expires_at > now`, érvényes. A válaszon a
   `lidar_auth` (és remember esetén a `lidar_session`) TTL-je a hátralévő időre
   frissül; a session **nem** hosszabbodik meg.
3. **Lejárat:** a DB `expires_at` dönt; a lejárt sort a keresés törli, a
   cookie-kat a válasz törli.
4. **Logout:** a token hash-ének törlése; cookie-k törlése; marker marad.
5. **Jelszó változtatás (CLI):** a user összes sessionje törlődik.
6. **User törlés:** FK cascade törli a sessionöket.
7. **Takarítás:** induláskor és 15 percenként `DELETE FROM sessions WHERE
   expires_at <= now`; a timer `unref()`-elt.
8. **Session cap:** userenként max 10 session; a legrégebbiek törlődnek
   (bekerül a v1-be).

> **Nincs sliding session:** a 7 nap / 24 óra a login pillanatától számít.
> Ez kiszámíthatóbb és egyszerűbb; a felhasználó lejárat után újra belép.

### 8.3 Miért kell a `lidar_auth` hint?

A `lidar_session` `HttpOnly`, ezért a JS nem látja. A dashboard inline guardja
viszont a body festése előtt dönt, és nem hívhatja az API-t (nincs még festés,
illetve a guard szándékosan független a `session.js`-től). A hint cookie egy
nem érzékeny, olvasható jelzés, hogy a szerver szerint van session. A guard a
`localStorage` sessiont **vagy** a hintet elfogadja; a valódi ellenőrzést a
szerver végzi a védett oldalak kiszolgálásakor.

### 8.4 Marker és a statikus demo közötti váltás

- A `lidar_backend=1` marker 1 napig él, és minden válaszon frissül.
- Ha a Pi-n visszaállsz a statikus demóra (`webui.service`), a böngészőben
  legfeljebb 1 napig maradhat marker. Addig a login `SERVICE_ERROR`-t mutat,
  nem esik vissza csendben a demóra (ez biztonsági döntés).
- Azonnali váltáshoz töröld a `lidar_backend` cookie-t a böngészőben (DevTools →
  Application → Cookies), vagy használj más hostot/portot.

---

## 9. Biztonság

### 9.1 Jelszó hash — scrypt

```js
const PARAMS = { N: 16384, r: 8, p: 1, keylen: 64, saltBytes: 16 };
// formátum: scrypt$16384$8$1$<salt-base64>$<hash-base64>
```
- `crypto.scrypt` **aszinkron** hívás, hogy ne blokkolja az event loopot.
- `maxmem: 64 * 1024 * 1024` (N=16384, r=8 → 16 MiB, belefér).
- A só 16 random bájt; a hash 64 bájt.
- Ellenőrzés `crypto.timingSafeEqual`-lel; a hosszakat előbb ellenőrizzük.
- Ismeretlen emailnél **dummy hash** ellenőrzés fut, hogy az időzítés ne
  árulja el, létezik-e a fiók.
- A jelszó soha nem kerül logba, válaszba, localStorage-ba.
- A jelszó max 1024 karakter (scrypt DoS ellen); a frontend 12+ követelménye
  szerveroldalon is él.
- A hash formátum tartalmazza a paramétereket → későbbi paraméter-emelés és
  „rehash on login” lehetséges (nem v1).

### 9.2 Session token

- 32 bájt `crypto.randomBytes` → base64url (43 karakter).
- A DB-ben csak `SHA-256(token)` hex; ha a DB kiszivárog, a tokenek nem
  használhatók.
- A token cookie `HttpOnly`, `SameSite=Lax`, `Path=/`; `Secure` env-től függ.
- Login előtt a régi cookie tokenjének session sora törlődik (rotáció).
- A token összehasonlítás a DB primary key lookup-pal történik; nincs
  végigiterálás, nincs timing-érzékeny string compare.

### 9.3 Rate limiting

| Limit | Kulcs | Alap | Tárolás |
| :--- | :--- | :--- | :--- |
| Login | IP | 20 / 15 perc | in-memory sliding window |
| Login | normalizált email | 10 / 15 perc | in-memory sliding window |
| Register | IP | 10 / óra | in-memory sliding window |

- A limiter a **minden** kísérletet számolja (a sikereset is), kivéve a login
  email limitet, amit siker esetén resetelünk.
- `429` + `Retry-After` (másodperc, felfelé kerekítve).
- A Map mérete korlátozott (pl. 5000 kulcs); 5 percenként takarítás; a
  legrégebbi bejegyzések evictionje.
- A rate limit **nem** perzisztens: service restart nullázza. Ez egy LAN-os
  roboton elfogadható; a dokumentáció jelzi.
- `TRUST_PROXY=1` esetén a kliens IP az `X-Forwarded-For` első eleme; enélkül
  a `req.socket.remoteAddress` (normalizálva, `::ffff:` levágva).
- `TRUST_PROXY=0` (default) mellett a `X-Forwarded-For` fejlécet **teljesen
  figyelmen kívül hagyjuk**, különben a kliens hamis IP-t küldhetne és
  megkerülhetné az IP-limitet. Csak akkor állítsd 1-re, ha a Node tényleg
  egy megbízható reverse proxy mögött hallgat `127.0.0.1`-en.

### 9.4 CSRF / Origin / Content-Type

A session cookie `SameSite=Lax`, de ez önmagában nem elég (same-site, más
portról jövő POST, pl. Node-RED `:1880`). Ezért:

- `POST` esetén kötelező `Content-Type: application/json` → a böngésző
  „simple request” form-POST-ja nem megy át (415).
- Ha van `Origin` header, annak **pontosan** egyeznie kell:
  - `PUBLIC_ORIGIN`-nel, ha be van állítva; vagy
  - a `Host` headerből derivált originnal (`http://<host>`).
  Egyébként `403 forbidden_origin`.
- Ha a `Sec-Fetch-Site: cross-site`, akkor `403` (még Origin nélkül is).
- `Origin` hiánya (curl, régi böngésző) megengedett; a JSON Content-Type
  követelmény és a `SameSite=Lax` továbbra is véd.
- Nincs CORS header; a böngésző same-origin policy-ja érvényes.
- A `GET /api/auth/session` és a `health` safe method, nem módosít.

### 9.5 Kérés limit

- Body: 16 KB; a `Content-Length` előellenőrzés, chunked body esetén olvasás
  közbeni limit; túllépés → `413`, a kapcsolat lezárása.
- Header méret: Node default (16 KB) elég; `server.maxHeadersCount = 100`.
- `server.requestTimeout = 15000`, `headersTimeout = 10000`,
  `keepAliveTimeout = 5000`.
- URL hossz: a Node header limitje véd; a statikus path 2 KB-nál hosszabb → 414
  (opcionális).
- JSON parse csak a limit alatt; nincs `eval`.

### 9.6 Biztonsági headerek

Minden válaszon:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy: geolocation=(), camera=(), microphone=()
Cache-Control: no-store   (API és HTML)
```

- `Strict-Transport-Security` **nincs** HTTP-n (csak TLS után, `COOKIE_SECURE=1`
  mellett).
- CSP a v1-ben nincs: az oldalak inline scriptet/style-t és Google Fontst
  használnak; egy rossz CSP könnyen eltörné a dashboardot. Külön körben,
  a tényleges inline blokkok listázásával vezethető be.
- A statikus fájlokra `Cache-Control: no-cache` (revalidálás), hogy deploy után
  ne ragadjon be a régi JS.

### 9.7 Felhasználó-enumeráció és időzítés

- Login: ismeretlen email és rossz jelszó **ugyanaz** a `401` válasz, ugyanaz a
  szöveg; dummy scrypt egalizálja az időt.
- Register: a foglalt email `409`-et ad (nyílt regisztrációnál ez elfogadott
  kompromisszum; a `ALLOW_REGISTRATION=0` mellett a támadó nem tud regisztrálni).
- A health/session végpontok nem árulnak el felhasználói adatot.

### 9.8 Logging és adatvédelem

- JSON lines a stdout-ra (systemd journal).
- Mezők: `ts`, `level`, `event`, `method`, `path`, `status`, `ms`, `ip`,
  `userId` (ha van), `requestId`, `code`.
- **Soha** nem logolunk: jelszó, token, cookie érték, teljes body, password
  hash.
- Az email csak regisztrációnál, szükség esetén; a login hibánál nem.
- A hibák stack trace-e a logba kerül, a kliens csak `internal_error`-t kap.
- A `requestId` a válasz `error.requestId` mezőjében is megjelenik.

### 9.9 Fájlrendszer

- DB könyvtár 0700, DB 0600, systemd `UMask=0077`.
- A statikus root read-only; path traversal és symlink escape ellen
  `realpath` + prefix check.
- A `/etc/lidar-auth.env` `0640 root:admin`, nem a repóban (a CLI wrapper
  admin csoportként olvassa; a systemd rootként olvassa).
- A backup fájl szintén 0600.

### 9.10 Amit ez a backend NEM véd

- **rosbridge `:9090`** — továbbra is bárki csatlakozhat és vezérelheti a
  robotot, ha eléri a portot. Ez a legnagyobb nyitott rés; külön feladat.
- **Node-RED `:1880`** — admin UI, flow szerkesztés; szintén nyitott.
- **HTTP a LAN-on** — a jelszó és a session token cleartextben megy a LAN-on;
  csak megbízható hálózaton használható. TLS később.
- **Fizikai hozzáférés** — a Pi-hez hozzáférő bárki olvashatja a DB-t (0600
  ellenére root/sudo), és módosíthatja a kódot.
- **XSS** — a v1 nem ad CSP-t; a jelenlegi UI nem jelenít meg felhasználói
  HTML-t, de ez nem garancia. A session cookie `HttpOnly`, így XSS esetén sem
  olvasható ki közvetlenül, de a támadó a böngésző nevében kérhet.

---

## 10. Statikus kiszolgálás és gate

### 10.1 Szabályok

| Útvonal | Gate | Megjegyzés |
| :--- | :--- | :--- |
| `/` | session | `index.html`-t szolgálja ki |
| `/index.html` | session | ugyanaz |
| `/workspace.html` | session | dashboard |
| `/auth.html` | publikus | ha session + hint → `302 /` |
| `/src/*` | publikus | JS/CSS az auth oldalhoz is kell |
| `/assets/*` | publikus | ikonok, SVG |
| `/js/*` | publikus | `roslib.min.js` |
| `/mock/*` | publikus | statikus demo adat |
| `/favicon.ico` | publikus | `204` (nincs 404 zaj) |
| `/api/auth/health` | publikus | marker |
| `/api/auth/session` | publikus | állapot |
| `/api/auth/login` | publikus | POST |
| `/api/auth/register` | publikus | POST |
| `/api/auth/logout` | publikus | POST, idempotens |
| `/server/*`, `/.env`, `/.git/*` | — | `404` (a web rooton kívül) |

- A védett oldalaknál a `302 Location: /auth.html#/auth`, `Cache-Control:
  no-store`.
- Statikus útvonalon csak `GET` és `HEAD`; más metódus → `405` +
  `Allow: GET, HEAD`.
- Ha a session érvényes, de a hint hiányzik, a `/auth.html` **nem** redirectel
  (loop-védelem).
- Nincs directory listing; könyvtárra kért path → `404`.
- Nincs SPA fallback; ismeretlen path → `404`.

### 10.2 Path safety

1. `decodeURIComponent(pathname)`; hiba → `400`.
2. `\0` vagy `%00` → `400`.
3. `path.posix.normalize('/' + pathname)`; ha `..` szegmens marad → `400`.
4. Minden szegmens, ami `.`-tal kezdődik → `404` (dotfile tiltás).
5. `path.resolve(WEB_ROOT, '.' + normalized)`; ha nem `WEB_ROOT` alatt van →
   `403`.
6. `fs.realpath` a fájlra és a `WEB_ROOT`-ra; a realpath prefix check a
   symlink escape ellen.
7. Csak rendes fájl (`stat.isFile()`); könyvtár → `404`.

### 10.3 MIME és cache

- Kiterjesztés → MIME map: `.html`, `.css`, `.js`, `.mjs`, `.json`, `.svg`,
  `.png`, `.jpg`, `.webp`, `.ico`, `.woff2`, `.txt`, `.map`.
- Ismeretlen kiterjesztés → `application/octet-stream`; a böngésző
  `nosniff` miatt nem futtatja.
- HTML: `text/html; charset=utf-8`; JS/CSS: `charset=utf-8`.
- `Cache-Control`: HTML/API `no-store`; asset `no-cache` (revalidate).
  Nincs ETag/304 a v1-ben (a fájlok kicsik, LAN-on a re-download olcsó).
- `HEAD`: ugyanazok a headerek, body nélkül.
- Range request nincs (nem szükséges).

---

## 11. Frontend integráció

### 11.1 Ami már megfelel — nem kell változtatni

- `session.js` server mód: `hasBackend`, `hasServerHint`, `detectBackend`,
  `api`, `logout`, `clearServerHint`, `requireAuth`.
- `auth.js` demo/server elágazás, health-probe a submit előtt, 400/401/409/429
  kezelés, `COOKIE_ERROR`, `SERVICE_ERROR`, `STORAGE_ERROR`.
- `auth.html` korai redirect + cookie-ellenőrzés.
- `index.html` / `workspace.html` inline guard, ami a hintet is elfogadja.
- `maps.js` / `app.js` sign-out: `Session.logout()` + timeout.
- A login/register utáni `location.replace("index.html")` és a `remember`
  logika.

### 11.2 Szükséges kis javítások

1. **`web/public/src/session.js` — logout 401 kezelés.**
   Ha a session a szerveren már lejárt, a `POST /api/auth/logout` a v1-ben
   idempotens `200`-at ad, de ha bármiért `401` jönne, a sign-out ne ragadjon
   be:
   ```js
   return result.ok || result.status === 401;
   ```
   A `maps.js` így nem mutat hibát egy már lejárt sessionnél.

2. **`web/public/src/auth.js` — opcionális: 403 register message.**
   A jelenlegi `handleRegisterResult` a nem kezelt státuszokra az
   `error.message`-t mutatja, tehát a `403 registration_disabled` működik.
   Nem kötelező változtatás; a teszt igazolja.

3. **Dokumentációs kommentek.**
   A `session.js` fejlécében a „DEMO ONLY” szöveget pontosítani kell: a
   kliensoldali session továbbra is csak hint/fallback, de a szerveroldali
   session már valódi. A `auth.js` fejlécében a „local Node backend” már igaz;
   csak a „not part of this commit” jellegű megjegyzéseket kell frissíteni.

### 11.3 Ami nem változik

- A három auth képernyő markupja, CSS-e, routingja, validációja.
- A Map Selection és a Sensor Workspace layoutja.
- A `lidar.demoMode` működése.
- A `Sign out` gomb helye és viselkedése (a backend hívás már be van kötve).
- A statikus demo útja (`python3 -m http.server`).

### 11.4 A frontend és a backend közös „szerződés” tesztjei

Az integrációs teszteknek ezeket a konkrétumokat kell igazolniuk:

- `GET /api/auth/health` válasza `service === "lidar-auth"`.
- Login/register válasza `data.user.email` és `data.user.name`.
- Hiba esetén `data.error.message` és `data.error.fields`.
- `429` esetén `Retry-After` parse-olható integer.
- `Set-Cookie`-ban `lidar_session` `HttpOnly`, `lidar_auth=1`,
  `lidar_backend=1`.
- Logout után a `lidar_auth` törlődik, a `lidar_backend` megmarad.

---

## 12. Admin CLI

```bash
# új felhasználó (jelszó stdin-ről, hogy ne kerüljön shell history-ba)
read -rsp "Password: " PW; echo
printf '%s' "$PW" | node server/bin/users.js add \
  --email alex@example.com --name "Alex Morgan" --password-stdin
unset PW

# jelszó reset (minden sessiont visszavon)
read -rsp "New password: " PW; echo
printf '%s' "$PW" | node server/bin/users.js passwd \
  --email alex@example.com --password-stdin
unset PW

# lista (id, email, name, created_at; hash és jelszó nélkül)
node server/bin/users.js list

# törlés (megerősítéssel; a sessionök cascade törlődnek)
node server/bin/users.js remove --email alex@example.com --yes

# konzisztens backup
node server/bin/users.js backup --out /home/admin/auth-2026-01-01.db
```

- A CLI ugyanazt a `config.js`-t, `db.js`-t, `passwords.js`-t és
  `validate.js`-t használja, mint a service.
- `--password-stdin` nélkül, TTY-n a CLI kiírja a `read -s` példát és
  belépéssel kilép (nincs jelszó a parancssorban).
- A CLI a service futása mellett is működik (WAL + busy_timeout); a `passwd`
  azonnal érvényteleníti a meglévő sessionöket.
- A `backup` a `node:sqlite` `backup()` API-ját használja (Node >= 22.16).
- A Pi-n a `deploy/lidar-auth-users.sh` wrapper betölti a
  `/etc/lidar-auth.env`-et és meghívja a CLI-t; így nem kell kézzel env-et
  exportálni.

---

## 13. Telepítés

### 13.1 Lokális fejlesztés

```bash
cd lidar-robot/server
AUTH_PORT=8787 node server.js
```

- A böngésző: `http://127.0.0.1:8787/auth.html#/auth`.
- Regisztráció default engedélyezett; a `server/data/auth.db` jön létre.
- A statikus demo továbbra is:
  ```bash
  cd lidar-robot/web/public && python3 -m http.server 8080
  ```
  Ekkor nincs `lidar_backend` marker → a kliensoldali demó login megy.
- Ne futtasd a kettőt ugyanazon a porton; a marker miatt a váltásnál lásd 8.4.

### 13.2 Raspberry Pi

**1. Node 22 LTS (>= 22.16):**

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version    # >= 22.16.0
```

> A Node-RED a Pi-n szintén Node-ot használ; a NodeSource Node 22 LTS-sel a
> Node-RED 4.x-nek működnie kell. Ha a meglévő Node-RED verzió nem támogatja a
> Node 22-t, előbb frissítsd a Node-RED-et, vagy használj külön Node-ot a
> service-hez. A service induláskor ellenőrzi a verziót, és érthető hibával
> leáll, ha túl régi.

**2. Env fájl:**

```bash
sudo install -m 640 -o root -g admin deploy/lidar-auth.env.example /etc/lidar-auth.env
sudo editor /etc/lidar-auth.env
```

- Állítsd be a `PUBLIC_ORIGIN`-t a Pi elérhetőségére (pl.
  `http://<pi-ip>:8080`), vagy hagyd üresen.
- A Pi-n `ALLOW_REGISTRATION=0` ajánlott; a fiókot admin CLI-vel hozd létre.
- Hozd létre a DB könyvtárat **a service indulása előtt** (a systemd
  `ReadWritePaths` miatt; a Node-RED `robot.db`-je is itt van, ezért ellenőrizd
  a tulajdonost):
  ```bash
  sudo install -d -m 700 -o admin -g admin \
    /home/admin/lidar-robot/lidar-robot/robot/data
  ```

**3. Service:**

```bash
sudo cp deploy/systemd/lidar-auth.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl disable --now webui.service     # a statikus demo le
sudo systemctl enable --now lidar-auth.service
sudo systemctl status lidar-auth.service
sudo journalctl -u lidar-auth.service -f
```

**4. CLI wrapper és az első fiók:**

```bash
sudo install -m 755 deploy/lidar-auth-users.sh /usr/local/bin/lidar-auth-users

read -rsp "Password: " PW; echo
printf '%s' "$PW" | sudo -u admin /usr/local/bin/lidar-auth-users add \
  --email alex@example.com --name "Alex Morgan" --password-stdin
unset PW
```

> A wrapper betölti a `/etc/lidar-auth.env`-et, így a CLI ugyanazt a DB-t
> használja, mint a service. A fájl `0640 root:admin`, ezért `sudo -u admin`
> olvasni tudja.

**5. Böngésző:** `http://<pi-ip>:8080/auth.html#/auth`

**6. Nginx / port 80 megjegyzés:**

- Ha az Nginx a 80-as porton **közvetlenül** a `web/public`-t szolgálja ki,
  akkor a backend gate megkerülhető a 80-as porton. Ezért:
  - vagy tiltsd le az Nginx statikus site-ját, és használd a Node service-t a
    8080-on; vagy
  - állítsd be az Nginxet **reverse proxy**-nak a Node service felé
    (`proxy_pass http://127.0.0.1:8787;`), és a `web/public`-ot ne szolgáld ki
    közvetlenül.
- Ellenőrzés (ha Nginx van a 80-on): a `curl -I http://<pi>/` **ne** adjon
  `200`-at a `web/public` tartalmára; a gyökérnek a Node gate-hez kell
  irányítania (302 vagy proxy). Ha 200-at ad a statikus indexre, a login
  megkerülhető.
- A `webui.service` (python) és a `lidar-auth.service` ne fusson egyszerre; a
  unit `Conflicts=webui.service`-t tartalmaz.
- A tűzfal a LAN-ról engedje a 8080-at; internetre ne legyen kitéve.
- A `rosbridge` (9090) és a Node-RED (1880) továbbra is nyitott; lásd 9.10.

### 13.3 Opcionális Nginx + TLS (későbbi kör)

```nginx
server {
    listen 443 ssl;
    server_name robot.local;

    ssl_certificate     /etc/ssl/robot/robot.crt;
    ssl_certificate_key /etc/ssl/robot/robot.key;

    location / {
        proxy_pass         http://127.0.0.1:8787;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
    }
}
```

- A Node ekkor: `AUTH_HOST=127.0.0.1`, `AUTH_PORT=8787` (a Pi default 8080
  helyett), `TRUST_PROXY=1`, `COOKIE_SECURE=1`,
  `PUBLIC_ORIGIN=https://robot.local`.
- A böngészőnek meg kell bíznia a tanúsítványban (self-signed esetén kézi
  kivétel; LAN-on ez UX teher).
- A `proxy_read_timeout` a statikus fájlokhoz elég; a logout `keepalive`
  kérését a Nginx továbbítja.

### 13.4 Upgrade / backup / restore / uninstall

**Upgrade:**
```bash
cd /home/admin/lidar-robot && git pull
sudo systemctl restart lidar-auth.service
```
- A séma migráció induláskor fut; előtte backup.
- A statikus fájlok `no-cache`-el mennek, így a böngésző frissít.

**Backup:**
```bash
sudo -u admin mkdir -p /home/admin/backups
sudo -u admin /usr/local/bin/lidar-auth-users backup \
  --out /home/admin/backups/auth-$(date +%F).db
chmod 600 /home/admin/backups/auth-*.db
```

**Restore:**
```bash
sudo systemctl stop lidar-auth.service
sudo rm -f /home/admin/lidar-robot/lidar-robot/robot/data/auth.db-wal \
           /home/admin/lidar-robot/lidar-robot/robot/data/auth.db-shm
sudo cp /home/admin/backups/auth-2026-01-01.db \
  /home/admin/lidar-robot/lidar-robot/robot/data/auth.db
sudo chown admin:admin /home/admin/lidar-robot/lidar-robot/robot/data/auth.db
sudo chmod 600 /home/admin/lidar-robot/lidar-robot/robot/data/auth.db
sudo systemctl start lidar-auth.service
```
- A WAL/SHM fájlokat a restore előtt törölni kell, ha maradtak (a service
  stopped állapotában); a fenti parancs ezt teszi.

**Uninstall:**
```bash
sudo systemctl disable --now lidar-auth.service
sudo rm /etc/systemd/system/lidar-auth.service
sudo systemctl daemon-reload
# a DB-t csak akkor töröld, ha nem kell:
# sudo rm /home/admin/lidar-robot/lidar-robot/robot/data/auth.db*
```

### 13.5 Offline működés

- A backend **nem** hív külső szolgáltatást: nincs CDN, nincs npm, nincs e-mail,
  nincs DNS-alapú függőség.
- A Pi a saját SQLite fájljából dolgozik; a fejlesztőgép lecsatlakoztatása
  után is működik.
- A UI Google Fontsot tölt be; internet nélkül fallback fontra vált (ez a
  frontend meglévő viselkedése, nem a backend függősége).
- Offline teszt: a fejlesztőgép hálózatát bontsd, a Pi-t külön elérve
  regisztrálj/loginolj; a session, a logout és a gate működjön.

---

## 14. Tesztek

### 14.1 Unit tesztek

| Fájl | Mit igazol |
| :--- | :--- |
| `passwords.test.js` | hash formátum, verify true/false, rossz jelszó, eltérő só, malformed hash, paraméter-parse |
| `validate.test.js` | email trim/lowercase, name, password policy (12+, szám, szimbólum), consent strict, remember |
| `ratelimit.test.js` | limit, ablak, `Retry-After`, reset, takarítás, eviction |
| `cookies.test.js` | parse/serialize, `HttpOnly`/`SameSite`/`Path`/`Max-Age`, duplicate név, malformed |
| `static.test.js` | path traversal, dotfile, symlink escape, MIME, HEAD, gate szabályok |

### 14.2 Integrációs tesztek (`api.test.js`)

Temp DB + `server.listen(0)` + `fetch` + cookie jar.

- [ ] health: `200`, `service: "lidar-auth"`, `lidar_backend=1`.
- [ ] register: `201`, user, `lidar_session` HttpOnly, `lidar_auth=1`; DB row; a
      válaszban nincs jelszó/hash.
- [ ] register duplicate: `409 email_taken`.
- [ ] register invalid: `400` + `fields` (`name`, `email`, `password`,
      `consent` külön-külön).
- [ ] register disabled (`ALLOW_REGISTRATION=0`): `403`.
- [ ] login: `200`, új session; a régi token sora törlődött.
- [ ] login rossz jelszó / ismeretlen email: `401`, azonos body.
- [ ] login `remember=false`: session cookie (nincs Max-Age), DB lejárat ~24h.
- [ ] login `remember=true`: Max-Age ~604800, DB lejárat ~7 nap.
- [ ] session endpoint: cookie-val `authenticated:true`; nélküle `false`.
- [ ] logout: `200`, cookie-k törölve, session sor törölve, a következő
      session-hívás `false`; a marker megmarad.
- [ ] lejárt session: törli a sort, `lidar_auth` törölve.
- [ ] rate limit: N kísérlet után `429` + `Retry-After`.
- [ ] CSRF: `Origin: http://evil` → `403`; `Sec-Fetch-Site: cross-site` → `403`.
- [ ] `Content-Type: text/plain` → `415`; body > limit → `413`; invalid JSON →
      `400`.
- [ ] rossz metódus → `405` + `Allow`.
- [ ] gate: `GET /` session nélkül → `302 /auth.html#/auth`; sessionnel → `200`.
- [ ] `GET /auth.html` session + hint → `302 /`; session hint nélkül → `200`.
- [ ] statikus asset publikus; `/.env` és `/../server/server.js` → `400/404`.
- [ ] biztonsági headerek minden válaszon.
- [ ] a valódi `web/public/auth.html` elérhető és tartalmazza a „Sign in”
      szöveget (smoke teszt).

### 14.3 Manuális / E2E (Pi)

- [ ] Offline: a fejlesztőgép lecsatlakoztatva; a Pi login/register/session
      működik.
- [ ] Böngésző: regisztráció → Map Selection → workspace → sign out → login.
- [ ] DevTools → Cookies: `lidar_session` HttpOnly, `lidar_auth=1`,
      `lidar_backend=1`; logout után az első kettő törölve, a marker megvan.
- [ ] Refresh / deep link (`/workspace.html`), back/forward.
- [ ] Service restart: a remember session megmarad (DB).
- [ ] Pi reboot: a service automatikusan indul; a session megmarad.
- [ ] `systemctl status` / `journalctl` tiszta; nincs unhandled rejection.
- [ ] 11 rossz jelszó → `429` + `Retry-After`; a UI hibaüzenete helyes.
- [ ] `curl` Origin/Content-Type/body limit tesztek.
- [ ] `ALLOW_REGISTRATION=0` → a Register `403` üzenetet mutat.
- [ ] Admin CLI: `add`, `list`, `passwd` (sessionök revoked), `remove`,
      `backup`.
- [ ] Backup → restore → login működik.
- [ ] DB 0600, env 0640 (`root:admin`); a service nem root.
- [ ] Nincs bypass: a 80-as porton (ha Nginx van) nem szolgálja ki a
      `web/public`-ot; csak a Node gate válaszol.

### 14.4 Regresszió

- [ ] A dashboard zoom, demo/live toggle, go home változatlan.
- [ ] A Map Selection keresés/szűrés/kiválasztás változatlan.
- [ ] A statikus demo (`python3 -m http.server`) továbbra is működik, és a
      demó login nem hív API-t.
- [ ] A `lidar.demoMode` megmarad sign-out után is.
- [ ] A frontend `session.js` egyéb funkciói (remember, storage fallback)
      változatlanok.

### 14.5 Tesztparancsok

```bash
cd lidar-robot/server
npm test                 # node --test test/*.test.js
npm run test:api         # csak az integráció
node --check server.js   # szintaxis
```

- A tesztekhez nincs npm install; a `node:test` és a `fetch` beépített.
- A temp DB-ket a tesztek a saját temp könyvtárukba teszik, nem a
  `server/data`-ba.
- A scrypt a tesztekben `SCRYPT_N=1024`-gyel fut (a formátum rögzíti az N-t),
  egy külön teszt ellenőrzi a produkciós 16384-et.

---

## 15. Implementációs lépések (commitok)

> A terv dokumentum a `web-ui-init`-re commitolható, majd onnan új branch
> (`feat/auth-backend`) jön létre. **Az implementáció nem a `web-ui-init`-en
> történik.** A lépések a 15.1 branch létrehozása után értendők.

### 15.1 Új branch létrehozása

A terv dokumentum alapértelmezésben még a `web-ui-init` ágra kerül (ez az
utolsó commit ott), majd **az implementáció már az új `feat/auth-backend`
ágon történik**. A `web-ui-init`-en a továbbiakban nem commitolunk.

```bash
# a git repo gyökere (a nested lidar-robot/ mappa felett)
cd /home/mihaly/Documents/lidar_project/lidar-robot

git switch web-ui-init
git status                           # ne legyen kódváltozás (a .memory/ untracked maradhat)

git add lidar-robot/docs/auth-backend-plan.md
git commit -m "docs: add auth backend implementation plan"

git switch -c feat/auth-backend
git branch --show-current            # feat/auth-backend
```

- **Fork esetén:** a fork a `web-ui-init` ágat tartalmazza; a forkban
  `git switch -c feat/auth-backend`, majd jöhetnek a kódcommitok.
- **Worktree esetén:** `git worktree add ../lidar-robot-auth -b
  feat/auth-backend web-ui-init`.
- **Ellenőrzés:** `git log --oneline --decorate -3` mutassa a terv commitot
  és a `feat/auth-backend` ágat; a `web-ui-init` ne mozduljon.
- Ha a tervet **nem** akarod a `web-ui-init`-re commitolni, a branchet előbb
  hozd létre (`git switch -c feat/auth-backend`), és a terv commitja már ott
  történjen; a lényeg, hogy **kód ne kerüljön a `web-ui-init`-re**.

### 15.2 Commitok sorrendje

| # | Commit | Fájlok | Kész, ha |
| ---: | :--- | :--- | :--- |
| 1 | `chore(server): scaffold zero-dependency Node auth service` | `server/package.json`, `server/server.js`, `server/app.js`, `server/lib/config.js`, `server/lib/log.js`, `server/lib/http.js` | `node server.js` elindul, a health `200` + `service: "lidar-auth"`; a verzióellenőrzés működik |
| 2 | `feat(server): SQLite schema, users and scrypt hashing` | `server/lib/db.js`, `server/lib/passwords.js`, `server/lib/users.js`, `server/lib/validate.js`, `server/bin/users.js` (add/list), `server/test/passwords.test.js`, `server/test/validate.test.js` | a séma létrejön, a CLI tud usert adni/listázni, a hash tesztek zöldek |
| 3 | `feat(server): sessions, cookies and rate limiting` | `server/lib/sessions.js`, `server/lib/cookies.js`, `server/lib/ratelimit.js`, tesztek | token generálás/hash/lejárat, cookie attribútumok, limiter tesztek zöldek |
| 4 | `feat(server): auth API` | `server/app.js`, `server/lib/http.js`, `server/lib/validate.js`, `server/test/api.test.js` (register/login/session/logout) | a frontend contract minden pontja teljesül; hibakódok és `fields` helyesek |
| 5 | `feat(server): static hosting and server-side page gate` | `server/lib/static.js`, `server/lib/security.js`, `server/test/static.test.js` | a védett oldalak `302`-t adnak session nélkül; path traversal tiltva; a marker/hint cookie-k beállnak |
| 6 | `feat(server): admin CLI (passwd, remove, backup)` | `server/bin/users.js`, `server/README.md` | a CLI minden parancsa működik; a passwd revokeolja a sessionöket; a backup konzisztens |
| 7 | `feat(deploy): systemd unit, env example and Pi docs` | `deploy/systemd/lidar-auth.service`, `deploy/lidar-auth.env.example`, `deploy/lidar-auth-users.sh`, `deploy/README.md` | a Pi-n offline elindul, reboot után is; a régi `webui.service` le van tiltva |
| 8 | `fix(web): treat 401 on logout as success` | `web/public/src/session.js` | a sign-out lejárt sessionnél sem ragad be |
| 9 | `docs: auth backend` | `docs/auth.md`, `README.md`, `server/README.md`, `.gitignore` | nincs „nincs backend” állítás; a repo tree és a deploy leírás pontos |
| 10 | `test: finalize auth backend suite` | `server/test/*` | `npm test` zöld; a 14. szakasz checklistje kitöltve |

**Miért ez a sorrend?**

- Először a futó váz és a health (a frontend marker-probe azonnal tesztelhető).
- A DB és a jelszó réteg a legalapvetőbb, aztán a session/cookie.
- Az API után jön a statikus gate, mert az a HTTP rétegre épül.
- A security middleware a statikus és API handler közös rétege; a gate után
  könnyű tesztelni.
- A deploy utolsó, mert a Pi-n a kész service-t érdemes telepíteni.
- A frontend fix és a dokumentáció a végén, hogy a contract már igazolt legyen.

---

## 16. Dokumentáció (implementációkor frissítendő)

| Fájl | Mit kell írni |
| :--- | :--- |
| `server/README.md` | rövid áttekintés, Node >= 22.16, futtatás, env táblázat, API, DB séma, CLI, backup, tesztek, security megjegyzések |
| `docs/auth.md` | „Server mód” szakasz: mode detection, cookie-k, gate, API, session életciklus; a „nincs backend” állítások cseréje; fájltree `server/`-rel; deploy link |
| `README.md` | 6.1: két mód (static demo / server), backend fájlok, futtatás; repo tree `server/`; a security figyelmeztetés pontosítása (a server gate valódi, a static demo nem); a Pi deploy leírás frissítése |
| `deploy/README.md` | Node 22 telepítés, env, `lidar-auth.service`, `webui.service` disable, port 80 / Nginx bypass figyelmeztetés, CLI, backup/restore, upgrade, offline teszt |
| `docs/auth-startpage-plan.md` | opcionális: a 6.3/6.4 szakaszban hivatkozás a backend tervre; a „nincs backend” mondatok pontosítása |
| `.gitignore` | `server/data/*.db*`, `robot/data/*.db*`, `.env`, `node_modules/` |

---

## 17. Kockázatok

| Kockázat | Hatás | Kezelés |
| :--- | :--- | :--- |
| A Pi Node verziója < 22.16 | a service nem indul | NodeSource Node 22 LTS; induláskori verzióellenőrzés; deploy doksi |
| A Node-RED nem kompatibilis a Node 22-vel | Node-RED nem indul | Node-RED frissítés; ha nem megy, külön Node a service-hez; a deploy doksi kitér rá |
| HTTP a LAN-on | jelszó/token lehallgatható | megbízható LAN; TLS később; `COOKIE_SECURE`/`TRUST_PROXY` előkészítve |
| rosbridge/Node-RED nyitott | a login megkerülhető a robot vezérléséhez | dokumentált korlát; külön feladat; tűzfal/network segmentation addig |
| Nyílt regisztráció a Pi-n | bárki fiókot készíthet a LAN-ról | `ALLOW_REGISTRATION=0` a Pi env-ben; admin CLI |
| Stale `lidar_backend` marker | a statikus demóra váltás után 1 napig SERVICE_ERROR | 1 napos marker; DevTools cookie törlés; dokumentálva |
| Redirect loop (session van, hint nincs) | login oldal ↔ dashboard | a `/auth.html` csak session + hint esetén redirectel; a hint minden hitelesített válaszon frissül |
| A `Session.logout()` 401-et hibának lát | sign-out elakad lejárt sessionnél | frontend fix (11.2) + idempotens logout |
| SQLite fájl jogosultság | hash-ek olvashatók | 0700/0600 + `UMask=0077`; backup is 0600 |
| Rate limit restarttal nullázódik | brute force a restartok között | LAN-only; erős jelszó; opcionálisan később perzisztens limiter |
| A régi `webui.service` / Nginx 80 tovább fut | a gate megkerülhető | deploy checklist: disable `webui.service`; Nginx ne szolgálja a `web/public`-ot |
| A `node:sqlite` experimental figyelmeztetés | journal zaj | `--disable-warning=ExperimentalWarning` a unitban (ha kell), dokumentálva |
| Pi óra pontatlansága | session lejárat eltér | NTP a LAN-on; a sessionök rövidek; dokumentálva |
| XSS a UI-ban | session ellopás | `HttpOnly`; nincs user HTML; CSP külön kör |
| Felhasználó-enumeráció (409) | fiók létezésének kiderítése | nyílt regisztrációnál elfogadott; `ALLOW_REGISTRATION=0` mellett nincs regisztrációs út |

---

## 18. Definition of done

- [ ] `server/` fut Node >= 22.16-tal, **nulla npm függőséggel**; `npm test`
      zöld.
- [ ] Lokálisan: `node server.js` → `http://127.0.0.1:8787`; regisztráció,
      login, session, logout működik a böngészőben.
- [ ] Pi-n: `lidar-auth.service` offline fut, reboot után is indul; a régi
      `webui.service` le van tiltva; a UI a `http://<pi>:8080` címen érhető el.
- [ ] Szerveroldali gate: `GET /` session nélkül `302 /auth.html#/auth`;
      sessionnel `200`; `/auth.html` session + hint esetén `302 /`.
- [ ] Cookie contract: `lidar_session` HttpOnly; `lidar_auth=1`; logout után a
      session/hint törölve, a `lidar_backend=1` marker megmarad.
- [ ] API contract: health `service: "lidar-auth"`; login/register `user`;
      hibák `{error:{message, fields}}`; `429` + `Retry-After`.
- [ ] Biztonság: scrypt, hash-elt token, rate limit, Origin/Content-Type,
      16 KB body limit, biztonsági headerek, 0600 DB, nem root service.
- [ ] Admin CLI: `add`, `list`, `passwd`, `remove`, `backup` működik; a
      `passwd` revokeolja a sessionöket.
- [ ] Frontend: a login/register/sign-out a meglévő UI-val működik; a
      `Session.logout()` 401 fix bekerült; a demó mód megmarad.
- [ ] Regresszió: Map Selection, workspace, demo/live toggle, statikus demo
      változatlan.
- [ ] Dokumentáció: `server/README.md`, `docs/auth.md`, `README.md`,
      `deploy/README.md` frissítve; nincs elavult „nincs backend” állítás.
- [ ] Nincs bypass: a 80-as porton (ha Nginx van) nem megy a statikus
      `web/public`; csak a Node gate válaszol.
- [ ] Minden implementációs commit a `feat/auth-backend` ágon van; a
      `web-ui-init`-en csak a terv dokumentum commitja szerepel.
- [ ] Offline teszt: a fejlesztőgép lecsatlakoztatva a Pi login/session
      működik.

---

## Függelék A — `deploy/lidar-auth.env.example`

```bash
# /etc/lidar-auth.env  (chmod 640, owner root:admin)
NODE_ENV=production
AUTH_HOST=0.0.0.0
AUTH_PORT=8080
AUTH_DB_PATH=/home/admin/lidar-robot/lidar-robot/robot/data/auth.db
WEB_ROOT=/home/admin/lidar-robot/lidar-robot/web/public
PUBLIC_ORIGIN=
ALLOW_REGISTRATION=0
COOKIE_SECURE=0
TRUST_PROXY=0
LOG_LEVEL=info
```

## Függelék B — `deploy/systemd/lidar-auth.service`

```ini
[Unit]
Description=LiDAR Robot - auth backend and web UI
Documentation=file:///home/admin/lidar-robot/lidar-robot/server/README.md
After=network-online.target
Wants=network-online.target
Conflicts=webui.service

[Service]
Type=simple
User=admin
Group=admin
WorkingDirectory=/home/admin/lidar-robot/lidar-robot/server
EnvironmentFile=/etc/lidar-auth.env
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning server.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=10
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=/home/admin/lidar-robot/lidar-robot/robot/data
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

> A `ProtectHome=read-only` + `ReadWritePaths` kombinációt a Pi-n tesztelni kell;
> ha a DB nem írható, a `ProtectHome` sor elhagyható. A `--disable-warning`
> csak akkor kell, ha a Node 22 `ExperimentalWarning`-ot ír a journalba.

## Függelék C — Hibakódok gyorslistája

```
validation_error       400  fields: name|email|password|consent
invalid_json           400
bad_request            400
invalid_credentials    401
registration_disabled  403
forbidden_origin       403
not_found              404
method_not_allowed     405  Allow
email_taken            409
payload_too_large      413
unsupported_media_type 415
rate_limited           429  Retry-After
internal_error         500
unavailable            503
```

## Függelék D — `deploy/lidar-auth-users.sh`

```bash
#!/usr/bin/env bash
# /usr/local/bin/lidar-auth-users
# Az admin CLI futtatása a service env fájljával, a service user nevében:
#   sudo -u admin /usr/local/bin/lidar-auth-users add --email ... --name ... --password-stdin
set -euo pipefail

ENV_FILE="${LIDAR_AUTH_ENV:-/etc/lidar-auth.env}"
SERVER_DIR="${LIDAR_AUTH_SERVER_DIR:-/home/admin/lidar-robot/lidar-robot/server}"

if [[ ! -r "$ENV_FILE" ]]; then
  echo "Cannot read $ENV_FILE — run as the 'admin' user (the file is 0640 root:admin)." >&2
  exit 1
fi

if [[ ! -f "$SERVER_DIR/bin/users.js" ]]; then
  echo "Cannot find $SERVER_DIR/bin/users.js — set LIDAR_AUTH_SERVER_DIR." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

exec /usr/bin/node "$SERVER_DIR/bin/users.js" "$@"
```

- Telepítés: `sudo install -m 755 deploy/lidar-auth-users.sh /usr/local/bin/lidar-auth-users`.
- Futtatás: `sudo -u admin /usr/local/bin/lidar-auth-users ...` (a DB és a
  `robot/data` könyvtár `admin` tulajdonú).
- `LIDAR_AUTH_ENV` / `LIDAR_AUTH_SERVER_DIR` csak lokális teszthez; a Pi-n a
  default értékek érvényesek.
