# robot/ — ROS 2 és Node-RED oldal

Ez a mappa a robot oldali konfiguráció. A részletes architektúra:
[`../docs/architecture.md`](../docs/architecture.md), a szerződés:
[`../docs/interface.md`](../docs/interface.md), a hardver és a rendszerszintű
beállítások: [`../docs/hardware-parts.md`](../docs/hardware-parts.md).

## Tartalom

| Útvonal | Mi ez | Állapot |
| :-- | :-- | :-- |
| `launch/robot_bringup.launch.py` | rplidar driver + rosbridge (:9090) + foxglove (:8765) | ✅ működő launch, Nav2 még nincs benne |
| `nodered/flows.json` | 20 node, 2 tab: `/api/maps` (GET), `/api/go-home` (POST), `/goal_pose` építés, `system_logs` írás | ✅ fájlban, Pi-n verifikálandó |
| `data/robot.db` | Node-RED SQLite (`maps`, `system_logs`) | gitignore-olt, futásidőben keletkezik |
| `maps/` | mentett térképek (`.yaml` + `.pgm`) | üres, amíg a SLAM nem megy |
| `src/` | üres ROS 2 package placeholderek (`motor_driver`, `lidar_bringup`, `localization`, `nav2_config`) | csak `.gitkeep` |

## Rendszerkövetelmények és beállítások (Raspberry Pi)

### 1. Hálózatkezelés (Netplan javítás)

Az Ubuntu Server alapértelmezetten blokkolhatja a Wi-Fi kártyát (`unmanaged` állapot).
A NetworkManager engedélyezéséhez futtasd a következő parancsokat:

```bash
sudo sh -c 'echo "network:" > /etc/netplan/99-networkmanager.yaml'
sudo sh -c 'echo "  version: 2" >> /etc/netplan/99-networkmanager.yaml'
sudo sh -c 'echo "  renderer: NetworkManager" >> /etc/netplan/99-networkmanager.yaml'

sudo netplan apply
sudo systemctl restart NetworkManager
sudo nmcli device wifi connect "HALOZAT_NEVE" password "JELSZO" hidden yes
```

Közvetlen (router nélküli) Ethernet kapcsolathoz link-local profil kell — lásd a
fő `README.md` 7.1 szakaszát.

### 2. Szükséges ROS 2 csomagok

```bash
sudo apt update
sudo apt install ros-jazzy-foxglove-bridge -y
sudo apt install ros-jazzy-rplidar-ros -y
```

A `rosbridge_suite` és a `ros2` alapcsomagok szintén kellenek (a launch fájl
`rosbridge_server`-t indít): `sudo apt install ros-jazzy-rosbridge-suite -y`.

### 3. LiDAR soros port

```bash
echo 'KERNEL=="ttyUSB*", MODE="0666"' | sudo tee /etc/udev/rules.d/99-lidar.rules
sudo udevadm control --reload-rules && sudo udevadm trigger
```

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
