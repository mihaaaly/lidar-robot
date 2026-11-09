# server/ — auth backend and web host

Zero-dependency Node.js service that provides the real, server-side session
for the LiDAR robot web UI. It serves the API (`/api/auth/*`), hosts the static
files from `../web/public`, and gates the protected pages server-side.

- **Runtime:** Node.js **>= 22.16** (`node:sqlite` and its `backup()` API).
- **Dependencies:** none. No `npm install`, no build step.
- **Database:** one SQLite file (WAL), default `server/data/auth.db`.
- **Ports:** `8787` locally, `8080` on the Raspberry Pi (the existing URL).
- **TLS:** not included. Designed for a trusted LAN; `COOKIE_SECURE` and
  `TRUST_PROXY` are ready for a future Nginx + TLS reverse proxy.

The static demo (`webui.service`, `python3 -m http.server`) still works and does
not need this service; the demo login is client-side only. In server mode the
`lidar_backend=1` cookie tells the frontend to use this API.

---

## Running locally

```bash
cd lidar-robot/server
AUTH_PORT=8787 node server.js
# http://127.0.0.1:8787/auth.html#/auth
```

The first start creates `server/data/auth.db` (directory `0700`, file `0600`).
Registration is enabled by default locally.

## Quality gate

```bash
npm test          # 85 tests, node:test, temp DBs (touches no real data)
npm run coverage  # same tests + 90% line / 75% branch thresholds (fails below)
npm run check     # node --check on every source and test file
npm run typecheck # tsc -p . (checkJs, strictNullChecks) — needs tsc installed
```

`npm run typecheck` is the only command that needs a tool outside Node: TypeScript
is installed transiently and **never** added to `package.json`, so the service stays
dependency-free at runtime:

```bash
npm install --no-save --no-package-lock typescript@5 @types/node@22
```

CI (`.github/workflows/ci.yml`) runs `check`, `coverage` and `typecheck` on Node 22
and 24 for every push and pull request. Type checking deliberately excludes `test/`
for now — the test helpers are dynamic fixtures; the server code is what is checked.

```bash
npm test          # node --test test/*.test.js
npm run test:api  # integration tests only
node --check server.js
```

Tests use `node:test` and the built-in `fetch`; they need no dependencies and
write their temp databases outside `server/data`.

---

## Configuration

Every variable has a default. An invalid value stops the process with a readable
message instead of leaving a half-running service.

| Variable | Default | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | `development` only changes log verbosity today. |
| `AUTH_HOST` | `127.0.0.1` | Bind address. Pi: `0.0.0.0`; behind Nginx: `127.0.0.1`. |
| `AUTH_PORT` | `8787` | Port. Pi: `8080`. |
| `AUTH_DB_PATH` | `./data/auth.db` | SQLite file, relative to `server/`. |
| `WEB_ROOT` | `../web/public` | Static web root, relative to `server/`. |
| `PUBLIC_ORIGIN` | empty | e.g. `http://192.168.1.50:8080`. Empty → derived from `Host`. |
| `TRUST_PROXY` | `0` | `1` only behind a trusted reverse proxy (uses `X-Forwarded-For`). |
| `COOKIE_SECURE` | `0` | `1` only with HTTPS. |
| `ALLOW_REGISTRATION` | `1` | `0` → `403 registration_disabled` (recommended on the Pi). |
| `SESSION_REMEMBER_DAYS` | `7` | Remember-me session length. |
| `SESSION_HOURS` | `24` | Non-remember session length. |
| `LOGIN_IP_LIMIT` | `20` | Login attempts / IP / window. |
| `LOGIN_EMAIL_LIMIT` | `10` | Login attempts / email / window. |
| `LOGIN_WINDOW_MIN` | `15` | Login rate-limit window (minutes). |
| `REGISTER_IP_LIMIT` | `10` | Register attempts / IP / window. |
| `REGISTER_WINDOW_MIN` | `60` | Register rate-limit window (minutes). |
| `BODY_LIMIT_BYTES` | `16384` | JSON body limit. |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`, `silent`. |
| `SCRYPT_N` | `16384` | Test-only reduction; production keeps 16384. |

Startup validation rejects a missing `WEB_ROOT`, an invalid port/origin, a bad
`ALLOW_REGISTRATION` value and Node older than 22.16. Warnings are logged for
`COOKIE_SECURE=1` with an `http://` origin and for `TRUST_PROXY=1` on `0.0.0.0`.

---

## API

All responses are JSON (`application/json; charset=utf-8`), `Cache-Control:
no-store`, with security headers (`nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: no-referrer`, `Permissions-Policy`). Every response also sets
the readable `lidar_backend=1` marker cookie (1 day).

Errors use the envelope:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Check the highlighted fields.",
    "fields": { "email": "Enter a valid email address." },
    "requestId": "8f0c1a2b3c4d5e6f"
  }
}
```

`fields` is present only for validation errors; `requestId` appears in every
error and in the `X-Request-Id` response header.

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET`/`HEAD` | `/api/auth/health` | `{service:"lidar-auth",status:"ok",version,time}`; `503` on DB failure. |
| `POST` | `/api/auth/register` | `{name,email,password,consent}` → `201 {user,expiresAt}`. |
| `POST` | `/api/auth/login` | `{email,password,remember}` → `200 {user,expiresAt}`. |
| `GET`/`HEAD` | `/api/auth/session` | `{authenticated:false}` or `{authenticated:true,user,expiresAt}`. |
| `POST` | `/api/auth/logout` | `{}` (empty body allowed) → `200 {ok:true}`; idempotent. |

Validation messages match the frontend: name 2–80 characters, email pattern and
max 254 characters, password 12–1024 with a number and a non-alphanumeric,
consent strictly `true`.

Status codes: `400` validation/invalid JSON/bad request, `401` invalid
credentials, `403` registration disabled or forbidden origin, `404` unknown API
path, `405` wrong method (+`Allow`), `409` email taken, `413` body too large,
`415` non-JSON body, `429` rate limit (+`Retry-After`), `500` internal error,
`503` database unavailable.

### CSRF rules

- `POST` requires `Content-Type: application/json` (else `415`).
- If `Origin` is present it must exactly match `PUBLIC_ORIGIN` or
  `http://<Host>`; `Sec-Fetch-Site: cross-site` is always rejected.
- No CORS headers; same-origin only.

### Cookies

| Cookie | HttpOnly | Max-Age | Purpose |
| :--- | :---: | :--- | :--- |
| `lidar_session` | yes | remember: 7 days; else session cookie | Raw session token (32 bytes base64url). |
| `lidar_auth` | no | remaining TTL; session cookie when not remembered | Readable hint for the frontend guard. |
| `lidar_backend` | no | 1 day, refreshed on every response | Marks server mode. |

All cookies are host-only, `Path=/`, `SameSite=Lax`; `Secure` follows
`COOKIE_SECURE`. The raw token is never stored in the database (only its
SHA-256 hex) and never written to logs.

---

## Database

Schema v1 (`PRAGMA user_version = 1`), created in one transaction on first
start:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
) STRICT;

CREATE TABLE sessions (
  token_hash TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  remember   INTEGER NOT NULL DEFAULT 0,
  ip         TEXT,
  user_agent TEXT
) STRICT;
```

- Emails are stored trimmed and lowercased; timestamps are milliseconds.
- Passwords use scrypt (`N=16384, r=8, p=1`, 16-byte salt, 64-byte key) stored
  as `scrypt$N$r$p$<salt-base64>$<hash-base64>`.
- Sessions expire absolutely (no sliding); remember sessions live 7 days, others
  24 hours. At most 10 sessions per user, oldest pruned. Expired rows are
  deleted at startup and every 15 minutes.
- DB directory `0700`, DB file `0600`; the service and CLI set `umask 077`
  before SQLite creates the `-wal` / `-shm` files, and the systemd unit sets
  `UMask=0077` as well.
- A database whose `user_version` is newer than the service supports is
  refused at startup, so an older build cannot write into a newer schema.

---

## Admin CLI

Runs with the same config/db/password modules as the service and works while the
service is running (WAL + busy timeout). Passwords come from stdin.

```bash
# create
read -rsp "Password: " PW; echo
printf '%s' "$PW" | node bin/users.js add \
  --email alex@example.com --name "Alex Morgan" --password-stdin
unset PW

# list (id, email, name, created; never hashes)
node bin/users.js list

# reset a password (revokes every session of the user)
read -rsp "New password: " PW; echo
printf '%s' "$PW" | node bin/users.js passwd \
  --email alex@example.com --password-stdin
unset PW

# delete (needs --yes; sessions cascade)
node bin/users.js remove --email alex@example.com --yes

# consistent online backup
node bin/users.js backup --out /path/auth-YYYY-MM-DD.db
```

The backup contains password hashes: keep it `0600` and treat it like the
database. Restore: stop the service, remove stale `-wal`/`-shm` files, copy the
backup over `auth.db`, fix owner/mode, start the service.

On the Pi use the `deploy/lidar-auth-users.sh` wrapper, which loads
`/etc/lidar-auth.env` and runs the CLI as the service user:

```bash
sudo -u admin /usr/local/bin/lidar-auth-users list
```

---

## Static hosting and the page gate

| Path | Gate |
| :--- | :--- |
| `/`, `/index.html`, `/workspace.html` | valid session, else `302 /auth.html#/auth` |
| `/auth.html` | public; redirects to `/` only with a session **and** the `lidar_auth` hint |
| `/src/*`, `/assets/*`, `/js/*`, `/mock/*` | public |
| `/favicon.ico` | `204` |
| anything else | `404` (no SPA fallback, no directory listing) |

Static responses only allow `GET`/`HEAD` (`405` + `Allow: GET, HEAD`).
Path handling decodes and normalizes the path before routing, rejects NUL bytes,
dotfiles, traversal outside `WEB_ROOT` and symlink escapes (`realpath` prefix
check). HTML is `no-store`, assets are `no-cache` (revalidate; no ETag/304).

---

## Security notes

- scrypt is asynchronous; unknown emails run a dummy verification so timing does
  not reveal account existence.
- Passwords, tokens, cookie values and bodies are never logged. Logs are JSON
  lines on stdout (journald): `ts, level, event, method, path, status, ms, ip,
  userId, requestId, code`.
- Rate limits are in-memory (restart resets them): login 20/IP and 10/email per
  15 minutes, register 10/IP per hour. `Retry-After` is always sent on `429`.
- `TRUST_PROXY=0` ignores `X-Forwarded-For` entirely, so a client cannot spoof
  its IP and bypass the IP limit.
- Security headers are always sent; HSTS is not (HTTP-only deployment) and there
  is no CSP in v1 because the UI uses inline scripts/styles and Google Fonts.
- Not protected by this service: `rosbridge` (`:9090`), Node-RED (`:1880`), and
  the LAN traffic itself (HTTP, no TLS). Use a trusted network or a later TLS
  reverse-proxy round.

See `../deploy/README.md` for the Raspberry Pi installation.
