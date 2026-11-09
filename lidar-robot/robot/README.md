# robot/ — ROS 2 és Node-RED oldal

Ez a mappa a robot oldali konfiguráció. A részletes architektúra:
[`../docs/architecture.md`](../docs/architecture.md), a szerződés:
[`../docs/interface.md`](../docs/interface.md).

## Tartalom

| Útvonal | Mi ez | Állapot |
| :-- | :-- | :-- |
| `launch/robot_bringup.launch.py` | rplidar driver + rosbridge (:9090) + foxglove (:8765) | ✅ működő launch, Nav2 még nincs benne |
| `nodered/flows.json` | 20 node, 2 tab: `/api/maps` (GET), `/api/go-home` (POST), `/goal_pose` építés, `system_logs` írás | ✅ fájlban, Pi-n verifikálandó |
| `data/robot.db` | Node-RED SQLite (`maps`, `system_logs`) | gitignore-olt, futásidőben keletkezik |
| `maps/` | mentett térképek (`.yaml` + `.pgm`) | üres, amíg a SLAM nem megy |

## Futtatás a Pi-n

```bash
# bringup (systemd-n keresztül ez megy bootkor)
ros2 launch robot/launch/robot_bringup.launch.py

# kézi ellenőrzés
ros2 topic list
ros2 topic echo /scan --once | head
```

A Node-RED flow importja: Node-RED UI → Import → `nodered/flows.json`. A flow a
`ws://127.0.0.1:9090` rosbridge-re és a `robot/data/robot.db` fájlra számít, tehát
a working directory a repó gyökere kell legyen (a systemd unit ezt állítja be).
