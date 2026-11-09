# Architecture — LiDAR robot (on-board edge)

Minden fut a Raspberry Pi 5-ön; a kliens (laptop/tablet/telefon) csak böngészőt futtat.
Ez a dokumentum a **tényleges** processzeket, portokat és adatfolyamokat írja le, és
külön jelöli, ami még csak terv.

## 1. Rétegek és processzek

```
┌─────────────────────────────────────────────────────────────────────┐
│ Kliens (böngésző)                                                   │
│   :8080  auth.html → index.html (térképválasztás) → workspace.html  │
└───────────────┬──────────────────────────┬──────────────────────────┘
                │ HTTP (session cookie)    │ WebSocket
                ▼                          ▼
┌───────────────────────────────┐  ┌──────────────────────────────────┐
│ lidar-auth.service (Node)     │  │ rosbridge_websocket  :9090       │
│   statikus web root + gate    │  │ foxglove_bridge      :8765       │
│   /api/auth/* (session, DB)   │  └───────────────┬──────────────────┘
└───────────────┬───────────────┘                  │ ROS 2 (domain 10)
                │                                  ▼
                │                        ┌──────────────────────────┐
                │                        │ ROS 2 node-ok            │
                │                        │  rplidar driver → /scan  │
                │                        │  (motor/EKF/SLAM/Nav2 ⬜)│
                │                        └───────────────┬──────────┘
                │                                        │
                ▼                                        │
┌───────────────────────────────┐              ┌──────────┴───────────┐
│ server/data/auth.db           │              │ Node-RED  :1880      │
│   users, sessions (schema v1) │              │  websocket-client ───┘
└───────────────────────────────┘              │  sqlite robot.db     │
                                               │  http in /api/*      │
                                               └──────────────────────┘
```

| Process | systemd unit | Port | Kiindulási fájl |
| :-- | :-- | :-- | :-- |
| ROS 2 bringup (rplidar + bridge-ek) | `robot-bringup.service` | 9090, 8765 | `robot/launch/robot_bringup.launch.py` |
| Node-RED | `nodered.service` | 1880 | `robot/nodered/flows.json` |
| Auth + statikus kiszolgáló | `lidar-auth.service` | 8080 (Pi), 8787 (lokális) | `server/server.js` |
| Statikus demo (fallback) | `webui.service` | 8080 | `python3 -m http.server` — **nem futhat** a `lidar-auth` mellett |
| Nginx (opcionális) | `nginx.service` | 80 | reverse proxy → `127.0.0.1:8787`, **soha** nem szolgálja ki közvetlenül a `web/public`-ot |

## 2. Adatfolyamok

1. **Bejelentkezés:** böngésző → `POST /api/auth/login` (JSON, same-origin) → scrypt
   ellenőrzés → session sor a `auth.db`-ben (csak a token SHA-256 hash-e) → HttpOnly
   `lidar_session` + olvasható `lidar_auth` hint cookie.
2. **Oldalkiszolgálás:** böngésző → `GET /` → a Node service ellenőrzi a sessiont;
   érvénytelen → `302 /auth.html#/auth`. A statikus fájlok ugyanebből a processzből
   jönnek, ezért a kapu nem kerülhető meg egy másik porton.
3. **Élő LiDAR:** `workspace.html` → `ROSLIB.Ros('ws://<host>:9090')` → `/scan`
   (`sensor_msgs/msg/LaserScan`) → canvas. Bridge nélkül a UI "LIVE OFFLINE" és
   minta-scan-t rajzol.
4. **Go Home (részben kész):** böngésző → Node-RED `POST /api/go-home` → `SELECT` az
   aktív térkép bázispontjára → `/goal_pose` publikálás a rosbridge-en → `system_logs`
   bejegyzés. A Nav2 oldal (tényleges navigáció) ⬜.

## 3. Tárolás

| DB | Tulajdonos | Táblák | Megjegyzés |
| :-- | :-- | :-- | :-- |
| `server/data/auth.db` | Node auth service | `users`, `sessions` | STRICT táblák, `PRAGMA user_version = 1` séma-kapu, WAL, 0600 fájl / 0700 könyvtár |
| `robot/data/robot.db` | Node-RED | `maps(map_name, map_file, home_x, home_y, home_theta, is_active)`, `system_logs(level, source, message)` | Node-RED `sqlitedb` node-ok írják |

Mindkettő `.gitignore`-olt (`**/data/*.db*`); a `-wal`/`-shm` fájlok hiánya normális.

## 4. Mi van kész, mi nincs

| Komponens | Állapot |
| :-- | :-- |
| Statikus UI + szerveroldali session gate | ✅ 85 teszt, 91% line coverage |
| Auth API (register/login/session/logout, rate limit, CSRF origin check) | ✅ |
| Admin CLI (add/list/passwd/remove/backup) | ✅ |
| Deploy: systemd unit, env example, users wrapper | ✅ (Pi-n még nem verifikálva élesben) |
| Térképválasztó UI | ✅ statikus demo (`maps-data.js`), robot-adat nélkül |
| LiDAR driver + rosbridge + foxglove | ✅ launch fájl kész |
| Node-RED flow-k (`/api/maps`, `/api/go-home`) | ✅ fájlban; Pi-n futás verifikálandó |
| Motor driver, enkóder/IMU fúzió (`/odom`) | ⬜ |
| SLAM (`/map`), Nav2, keepout editor, akkumulátor | ⬜ |

## 5. Ismert korlátok (tudatos döntések)

- Nincs TLS: trusted LAN. HTTPS-hez Nginx reverse proxy + `COOKIE_SECURE=1` kell.
- A `:9090`, `:1880`, `:8765` portok hitelesítés nélkül futnak.
- A statikus demo mód (böngésző-oldali guard) **nem** biztonsági kontroll.
- Egy session-legfeljebb 10 párhuzamos bejelentkezés/felhasználó, abszolút lejárattal.
