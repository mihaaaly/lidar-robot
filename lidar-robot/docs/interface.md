# Interface — robot ↔ web szerződés

Ez a fájl a **tényleges** szerződés a ROS 2 oldal és a web UI között. Ha valamit
megváltoztatsz az egyik oldalon, itt is frissíteni kell — ez a dokumentum a
nézeteltérések helye, nem a tervek gyűjteménye.

> **Státusz-jelölés:** ✅ = implementálva és használja a kód · 🟡 = a kód előkészítve,
> de nincs mögötte implementáció · ⬜ = csak terv (még nincs kód egyik oldalon sem).
> A "hol" oszlop mindig a valós fájlra mutat.

## 1. Szállítási réteg (transport)

| Csatorna | Cím | Ki használja | Státusz |
| :-- | :-- | :-- | :-- |
| rosbridge WebSocket | `ws://<PI_IP>:9090` | web UI (`ROSLIB.Ros`), Node-RED (`websocket-client`) | ✅ |
| foxglove_bridge | `ws://<PI_IP>:8765` | fejlesztői 3D diagnosztika (Foxglove Studio) | ✅ |
| Node-RED HTTP API | `http://<PI_IP>:1880/api/…` | jövőbeli web UI (térkép/`go-home`) | ✅ (flow-ban) |
| Auth + statikus UI | `http://<PI_IP>:8080` | böngésző | ✅ |

- `ROS_DOMAIN_ID=10` — minden ROS 2 node és a bridge ezen a domainen fut.
- A frontend a hostnevet a böngésző címéből veszi, tehát a Pi IP-je nem beégetett:
  `ws://${window.location.hostname}:9090`.
- A `:9090`, `:1880` és `:8765` portok **nincsenek hitelesítve** — trusted LAN
  feltételezés. Ez tudatos, scope-on kívüli döntés (lásd `docs/auth.md`).

## 2. ROS 2 topicok

| Topic | Típus | Irány | Státusz | Hol |
| :-- | :-- | :-- | :-- | :-- |
| `/scan` | `sensor_msgs/msg/LaserScan` | robot → web | ✅ | `web/public/src/app.js` (sub), `robot/launch/robot_bringup.launch.py` (rplidar) |
| `/goal_pose` | `geometry_msgs/msg/PoseStamped` | Node-RED → Nav2 | 🟡 | `robot/nodered/flows.json` (üzenetépítés kész, Nav2 nincs) |
| `/map` | `nav_msgs/msg/OccupancyGrid` | robot → web | ⬜ | — |
| `/odom` | `nav_msgs/msg/Odometry` | robot → web | ⬜ | — |
| `/keepout_mask` | `nav_msgs/msg/OccupancyGrid` | web → Nav2 | ⬜ | — |
| `/battery_state` | `sensor_msgs/msg/BatteryState` | robot → web | ⬜ | — |

A `⬜` sorok típusai a `README.md` 5.1 szakaszából származó **terv**, nem
implementált viselkedés. Amíg nincs kód, addig ne hivatkozz rájuk úgy, mintha lenne.

## 3. Térkép adatszerkezet

A kanonikus alak (a `robot/data/robot.db` `maps` táblája és a UI között):

```json
{
  "map_name": "labda",
  "map_file": "labda.yaml",
  "home_pose": { "x": 0.0, "y": 0.0, "theta": 0.0 }
}
```

SQLite leképezés (`maps` tábla): `map_name`, `map_file`, `home_x`, `home_y`,
`home_theta`, `is_active`. A UI oldalon a kiválasztott térkép a
`lidar.map` kulcsban él (`localStorage`, `{ id, name, at }`) — ez **kliens-oldali**
állapot, nem a robot állapota. Ezt a kulcsot a térképválasztó főképernyő mellett a
`workspace.html` page-context sávja is olvassa (`web/public/src/map-storage.js`,
`workspace-map.js`), de csak megjelenítésre. A robot-oldali `maps` táblával való
összekötés továbbra sem történik meg (`web/public/src/maps-data.js` statikus adat).

## 4. Node-RED HTTP API

A flow-k (`robot/nodered/flows.json`, 20 node, 2 tab) ezt a két végpontot adják:

| Végpont | Metódus | Mit csinál |
| :-- | :-- | :-- |
| `/api/maps` | GET | `SELECT maps & logs` a `robot.db`-ből, JSON válasz |
| `/api/go-home` | POST | aktív térkép bázispontját lekéri, `/goal_pose`-t publikál a rosbridge-en, `system_logs`-ba ír |

```bash
curl -s http://<PI_IP>:1880/api/maps | head
curl -s -X POST http://<PI_IP>:1880/api/go-home
```

Korlát: a Node-RED `http in` node-oknak **nincs** auth-juk és nincs origin-ellenőrzésük,
ezért ezeket csak a helyi hálózatról szabad elérni. Ha a web UI elkezdi használni,
az auth service-en keresztül kell proxyzni, nem közvetlenül hívni.

## 5. Auth / session API

A web UI bejelentkezési felülete a Node auth service-t használja. A részletes
API (`/api/auth/health`, `/register`, `/login`, `/session`, `/logout`), a
cookie-k (`lidar_session`, `lidar_auth`, `lidar_backend`) és a státuszkódok:
[`auth.md`](auth.md) és [`../server/README.md`](../server/README.md).

A frontend csak akkor vált szerver-módra, ha a `lidar_backend=1` marker cookie
megvan **és** a `/api/auth/health` válasza `{"service":"lidar-auth"}`. Ha a marker
megvan, de a health elhal, a UI hibát mutat és **nem** esik vissza demo loginra —
ez szándékos biztonsági döntés.

## 6. Hogyan ellenőrizd a szerződést

```bash
# élő topikok a Pi-n
ros2 topic list
ros2 topic echo /scan --once | head -5

# rosbridge elérhető-e (böngésző konzolból is)
curl -s -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==" \
  http://<PI_IP>:9090/ | head -3

# Node-RED API
curl -s http://<PI_IP>:1880/api/maps
```
