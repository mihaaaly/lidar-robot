# LiDAR-Controlled Autonomous Mobile Robot

## 1. Overview

This project aims to develop a self-contained (On-Board / Edge architecture), Raspberry Pi 5-controlled autonomous mobile robot. Utilizing a LiDAR sensor and encoder-equipped motors, the robot can autonomously map its environment and navigate to designated waypoints via a web interface. Each mapped environment features a saved "base point" to which the robot can automatically return.

The entire software stack—including the ROS 2 backend, Node-RED automation engine, communication bridges, and the on-board Node.js web/auth service hosting the user interface—runs directly on the Raspberry Pi 5. Client devices (laptops, tablets, or smartphones) require no local software installation and can access the control interface via any modern web browser using the robot's IP address. The system architecture is designed to support parallel development, dividing the workload into two main streams: hardware/robotics and web interface development.

---

## 2. Key Features

- Environment mapping using LiDAR (SLAM).
- Autonomous navigation to arbitrary user-defined points on the mapped layout.
- Saved base points for each map, enabling automated return-to-home functionality.
- On-board web-based user interface (served by the Node auth service; Nginx optional) for map editing and defining no-go zones (keepout masks).
- Live LiDAR scan visualization on the web interface, alongside the generated map.
- On-board Node-RED automation engine for telemetry routing, battery monitoring, and high-level system logic.

---

## 3. Hardware Requirements

**Control & Processing**
- Raspberry Pi 5
- microSD card (64GB, A2 class)

**Sensors**
- LiDAR: RPLiDAR (`rplidar_ros` compatible)
- IMU: MPU6050 (for odometry fusion)

**Drivetrain**
- 2x DC motors with built-in encoders
- 1x free-spinning caster wheel (differential drive setup)
- Motor driver: DRV8833

**Power Supply**
- LiPo battery (dedicated power for motors)
- DC-DC step-down converter (to provide stable power to the Raspberry Pi)
- BMS / Battery charger

**Mechanical**
- Laser-cut or 3D-printed chassis
- Collision bumper with emergency stop switch (optional)

---

## 4. Software Architecture & Technologies (On-Board Edge Model)

### Core Technologies
- **ROS 2** (Jazzy on Ubuntu 24.04/22.04 ARM64)
- **Nav2** for navigation and path planning
- **slam_toolbox** for SLAM and mapping
- **Node-RED** for telemetry routing, automation workflows, and bridging ROS 2 data with high-level system logic
- **Node.js auth service** (`server/`, zero npm dependencies): serves the Web UI, the `/api/auth/*` API and the server-side session on port `8080`
- **Nginx** (optional): TLS termination or a reverse proxy in front of the Node service; it must not serve `web/public` directly

### Data Flow Diagram

<img width="500" height="1001" alt="Untitled diagram-2026-10-18-194754" src="https://github.com/user-attachments/assets/ad2d1692-350f-4aae-86bd-9822883ebfc3" />

### Architecture Diagram

<img width="800" height="800" alt="architecture" src="https://github.com/user-attachments/assets/7c8468b4-2667-44bc-9b1b-023b3e8622e6" />



### System Structure

**1. ROS 2 Core (Raspberry Pi Backend)**
- LiDAR driver (`rplidar_ros` / `ldlidar_stl_ros2`)
- Motor control node and encoder reading
- `robot_localization` (EKF: encoder and IMU fusion)
- `slam_toolbox` (Map building)
- `nav2` (AMCL, planner, controller, `keepout_filter`)
- Map manager (saving/loading maps and base points)

**2. Communication Bridge Layer (Middleware Bridges)**
- `rosbridge_suite` (WebSocket communication on port `9090` for the web UI and Node-RED)
- `foxglove_bridge` (WebSocket server on port `8765` for 3D developer visualization and diagnostics)

**3. Automation Layer (Node-RED)**
- Local Node-RED server (port `1880`) providing the automation layer and logic integration
- Interfaces with ROS 2 locally via `ws://127.0.0.1:9090` and executes system-level tasks (e.g., map saving, remote reboot)

**4. Web Server & Web Application (Node service & Frontend)**
- Zero-dependency Node service (port `8080`) serves the static UI from `web/public` **and** the auth API in one process, so the login gate cannot be bypassed on a second port
- Nginx (optional, port `80`) only terminates TLS / reverse-proxies to the Node service; it must never serve `web/public` directly
- `roslibjs` (`web/public/js/roslib.min.js`, vendored) for ROS communication and `/scan` rendering
- No-go zone editor (publishing keepout masks) — planned
- Live `/scan` processing and rendering — implemented
- "Go Home" — partially: the Node-RED flow builds `/goal_pose`, Nav2 execution is not wired yet
- Map switching interface — implemented as a static demo over `maps-data.js`

**5. Database Diagram**

<img width="1305" height="1116" alt="Lidar_Robot_Diagram" src="https://github.com/user-attachments/assets/04dbe159-63c5-4895-8526-e06647dc9a67" />

---

## 5. Development Interface & Network Ports

To enable parallel development, the hardware and web teams rely on a predefined data structure documented in `docs/interface.md`. That file marks every topic as implemented, prepared, or planned — keep it in sync with the code.

### 5.1. ROS 2 Topics & Data Structures
- **Implemented:** `/scan` (`sensor_msgs/msg/LaserScan`) — subscribed by `web/public/src/app.js`
- **Prepared:** `/goal_pose` (`geometry_msgs/msg/PoseStamped`) — built by the Node-RED flow; Nav2 is not running yet
- **Planned (no code yet):** `/map` (`OccupancyGrid`), `/odom` (`Odometry`), `/keepout_mask`, `/battery_state`
- **ROS 2 Domain:** `ROS_DOMAIN_ID=10` for network isolation
- **Connection:** `rosbridge_suite` WebSocket address and port (`ws://<PI_IP>:9090`)
- **Map Data Structure:** `{map_name, map_file, home_pose: {x, y, theta}}`

While the physical robot is under development the web UI runs on bundled demo data — `web/public/src/scan-points.js` for the scan and `web/public/src/maps-data.js` for the map library (`web/mock/` is empty, not a data source). Once deployed on the Raspberry Pi, the frontend dynamically connects to the local `rosbridge_suite` endpoint via `ws://${window.location.hostname}:9090` and falls back to the demo scan with a `LIVE OFFLINE` state when the bridge is unreachable.

### 5.2. On-Board Network Services & Ports

| Service | Port / Endpoint | Description |
| :--- | :--- | :--- |
| **Web UI + Auth API (Node)** | `http://<PI_IP>:8080` | Main web-based robot control interface with a server-side session. |
| **Nginx** (optional) | `http://<PI_IP>:80` | TLS / reverse proxy to the Node service; must not serve `web/public` directly. |
| **Node-RED** | `http://<PI_IP>:1880` | Visual automation, telemetry routing, and logic editor. |
| **rosbridge_suite** | `ws://<PI_IP>:9090` | WebSocket bridge for the `roslibjs` web app and Node-RED. |
| **foxglove_bridge** | `ws://<PI_IP>:8765` | Developer WebSocket bridge for 3D diagnostics in Foxglove Studio.|

---

## 6. Repository Structure

```text
lidar_project/lidar-robot/          # git root — this README lives here
├── .github/workflows/ci.yml        # tests + coverage gate + type check
└── lidar-robot/                    # the project (all git paths are prefixed with it)
    ├── deploy/
    │   ├── README.md
    │   ├── lidar-auth.env.example
    │   ├── lidar-auth-users.sh
    │   └── systemd/
    │       ├── lidar-auth.service   # Node auth service (:8080)
    │       ├── robot-bringup.service
    │       └── webui.service        # legacy static demo, conflicts with lidar-auth
    ├── docs/
    │   ├── architecture.md          # processes, ports, data flows, storage
    │   ├── interface.md             # robot ↔ web contract (status per topic)
    │   ├── hardware-parts.md        # BOM + required system setup
    │   ├── auth.md                  # auth layer, both modes
    │   ├── auth-backend-plan.md     # plan (history)
    │   ├── auth-startpage-plan.md   # plan (history)
    │   ├── map-selection.md
    │   └── map-selection-plan.md
    ├── robot/
    │   ├── README.md
    │   ├── data/                    # robot.db (gitignored)
    │   ├── launch/robot_bringup.launch.py   # rplidar + rosbridge + foxglove
    │   ├── maps/                    # saved maps (empty until SLAM works)
    │   ├── nodered/flows.json       # /api/maps, /api/go-home, /goal_pose
    │   └── src/                     # empty ROS package placeholders (only .gitkeep):
    │                                #   motor_driver, lidar_bringup,
    │                                #   localization, nav2_config
    ├── server/                      # zero-dependency Node auth service + static host
    │   ├── server.js                # entry point
    │   ├── app.js                   # API router + static page gate
    │   ├── lib/                     # config, db, users, passwords, sessions, cookies,
    │   │                            # validate, ratelimit, security, static, http, log
    │   ├── bin/users.js             # admin CLI (add, list, passwd, remove, backup)
    │   ├── test/                    # node:test suite (95 tests)
    │   ├── tsconfig.json            # checkJs type checking, no dependencies
    │   ├── package.json
    │   └── README.md
    └── web/
        ├── README.md
        ├── public/                  # served web root: auth.html, index.html,
        │                            # workspace.html, src/, assets/, js/roslib.min.js
        ├── src/                     # obsolete 2-line stub, not referenced anywhere
        └── mock/                    # empty; demo data lives in public/src
```

### 6.1. Web UI Auth Layer (Server-Side Session)

The web UI is gated by three screens (`auth.html`) for start / log in / create
account, hash routes (`#/auth`, `#/auth/login`, `#/auth/register`) and a real
server-side session when the Node service is running. Without the service
(plain static hosting) the same UI falls back to the client-side demo session.

| Piece | Where |
| :--- | :--- |
| Screens, hash router, validation | `web/public/auth.html`, `src/auth.js`, `src/auth.css` |
| Session helpers + backend detection (`window.Session`) | `web/public/src/session.js` |
| Map selection main screen (after sign-in) | `web/public/index.html`, `src/maps.js`, `src/maps-data.js`, `src/maps.css` |
| Sensor Workspace guard + `Sign out` | `web/public/workspace.html`, `src/app.js`, `src/style.css` |
| Auth API + server-side gate | `server/app.js`, `server/lib/*` |
| Admin CLI (accounts, passwords, backups) | `server/bin/users.js` |

**Server mode (recommended).** `lidar_backend=1` marks the deployment; the
frontend probes `/api/auth/health` and then uses the real API. The raw session
token lives in the HttpOnly `lidar_session` cookie; the database stores only its
SHA-256 hash. Passwords use scrypt (N=16384, r=8, p=1). Remember-me sessions
last 7 days, other sessions 24 hours, with absolute expiry (no sliding) and at
most 10 sessions per user. `lidar_auth=1` is the readable hint cookie used by
the guards.

```bash
# local development
cd lidar-robot/server
AUTH_PORT=8787 node server.js
# http://127.0.0.1:8787/auth.html#/auth

# first account
read -rsp "Password: " PW; echo
printf '%s' "$PW" | node bin/users.js add \
  --email alex@example.com --name "Alex Morgan" --password-stdin
unset PW
```

Configuration (`/etc/lidar-auth.env` on the Pi), the systemd unit, backups and
the admin CLI are documented in [`lidar-robot/server/README.md`](lidar-robot/server/README.md)
and [`lidar-robot/deploy/README.md`](lidar-robot/deploy/README.md). On the Pi the
service listens on `:8080`; `ALLOW_REGISTRATION=0` is recommended.

**Static demo.** Without the service, `lidar.session` in `localStorage`
(remember me, 7 days) or `sessionStorage` (max 24 h) is the only session. Only
e-mail, display name and timestamps are stored — never a password. `lidar.demoMode`
(`"1"` / `"0"`) is shared between the auth screens, map selection and workspace.
The register password policy is 12+ characters with at least one number and one
symbol; a 4-segment strength meter gives live feedback.

> ⚠️ **The static demo is not a security control.** The guard is client-side, so
> anyone can bypass it by disabling JavaScript or editing storage. The server
> mode replaces it with an HttpOnly session, scrypt hashes, rate limiting and a
> real page gate. TLS is still not included (trusted LAN only).

Details, routes, storage schema and asset regeneration:
[`lidar-robot/docs/auth.md`](lidar-robot/docs/auth.md).

### 6.2. Map Selection (main screen)

After sign-in the web UI opens the **Map selection** screen at the site root
(`web/public/index.html`): a library of saved maps plus a detail panel for the
selected one. It is a static demo over `src/maps-data.js`; nothing is read from
the robot yet.

| Piece | Where |
| :--- | :--- |
| Screen markup + session guard | `web/public/index.html` |
| Library data (Figma geometry + metadata) | `web/public/src/maps-data.js` |
| Rendering, selection, search, sort, filters | `web/public/src/maps.js` |
| Screen styles (reuses `style.css` tokens) | `web/public/src/maps.css` |
| Figma icons | `web/public/assets/icons/*.svg` |

- **Selection:** stored as `lidar.map` (`{ id, name, at }`) in `localStorage`;
  `Open in Sensor Workspace` navigates to `workspace.html`.
- **Filtering:** live search on name/ID, `All maps` / `Recent`, sort by last
  updated / name / area, grid and compact list view.
- **Figma:** `LiDAR · Map selection` frame `43:4131` (1440 × 1000).

Plan and measurements: [`lidar-robot/docs/map-selection-plan.md`](lidar-robot/docs/map-selection-plan.md).
Implementation notes: [`lidar-robot/docs/map-selection.md`](lidar-robot/docs/map-selection.md).

---

## 7. System Setup & Deployment (Raspberry Pi 5)

### 7.1. Network Management (NetworkManager & Direct Ethernet Link)
To resolve default Ubuntu Server `unmanaged` interface states, `NetworkManager` is configured as the primary renderer:

```bash
sudo sh -c 'echo "network:" > /etc/netplan/99-networkmanager.yaml'
sudo sh -c 'echo "  version: 2" >> /etc/netplan/99-networkmanager.yaml'
sudo sh -c 'echo "  renderer: NetworkManager" >> /etc/netplan/99-networkmanager.yaml'
sudo netplan apply
sudo systemctl restart NetworkManager
```

For direct (routerless) Ethernet cable connections between the host laptop and the Raspberry Pi, a link-local profile is used:

```bash
sudo nmcli connection add type ethernet ifname eth0 ipv4.method link-local con-name "DirectMAC"
sudo nmcli connection up DirectMAC
```

### 7.2. Persistent USB Permissions (`udev`)
To automatically grant read/write access to the LiDAR serial port (`/dev/ttyUSB0`) on boot without manual intervention:

```bash
echo 'KERNEL=="ttyUSB*", MODE="0666"' | sudo tee /etc/udev/rules.d/99-lidar.rules
sudo udevadm control --reload-rules && sudo udevadm trigger
```

### 7.3. Installing ROS 2 Packages, Node-RED, and the Node Auth Service
1. **Install ROS 2 bridges and LiDAR driver:**
   ```bash
   sudo apt update
   sudo apt install ros-jazzy-rplidar-ros ros-jazzy-foxglove-bridge ros-jazzy-rosbridge-suite -y
   ```
2. **Install and enable Node-RED:**
   ```bash
   bash <(curl -sL [https://raw.githubusercontent.com/node-red/linux-installers/master/deb/update-nodejs-and-nodered](https://raw.githubusercontent.com/node-red/linux-installers/master/deb/update-nodejs-and-nodered)) --confirm-root --confirm-install --skip-pi
   sudo systemctl enable nodered.service && sudo systemctl start nodered.service
   ```
3. **Install Node.js >= 22.16 and the auth service:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt install nodejs -y
   sudo install -m 640 -o root -g admin lidar-robot/deploy/lidar-auth.env.example /etc/lidar-auth.env
   sudo cp lidar-robot/deploy/systemd/lidar-auth.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl disable --now webui.service 2>/dev/null || true
   sudo systemctl enable --now lidar-auth.service
   ```
   Edit `/etc/lidar-auth.env` (`PUBLIC_ORIGIN`, `ALLOW_REGISTRATION=0`) and create
   the first account with the CLI; full steps in
   [`lidar-robot/deploy/README.md`](lidar-robot/deploy/README.md).

4. **Nginx (optional, TLS/reverse proxy only):**
   ```bash
   sudo apt install nginx -y
   ```
   Point the site at the Node service (`proxy_pass http://127.0.0.1:8787;`) instead
   of serving `web/public` directly. Serving the static directory from port 80
   would bypass the server-side login gate.

> The static demo fallback (`deploy/systemd/webui.service`, python on `:8080`)
> remains available but must not run at the same time as `lidar-auth.service`.

### 7.4. Manual Bringup (Testing)
To manually start the LiDAR driver and Foxglove WebSocket bridge on the Raspberry Pi:

```bash
# Terminal 1: Start Foxglove Bridge (Port 8765)
ros2 run foxglove_bridge foxglove_bridge

# Terminal 2: Start RPLiDAR Driver (/scan)
ros2 launch rplidar_ros rplidar.launch.py
```

---

## 8. Team Division & Workflow

| Area | Responsibilities |
| :--- | :--- |
| **Hardware / Robot Side** | Chassis assembly, motor controller node, encoder and IMU fusion, LiDAR driver, SLAM and Nav2 integration, configuring `rosbridge`, the auth service, and Node-RED on the Pi. |
| **Web Side** | UI framework, `roslibjs` integration, live LiDAR and map rendering, no-go zone drawing tool, map management interface. |

**Workflow:**
1. `docs/interface.md` is the contract between the two sides — it is the first file to update when a topic, endpoint or data shape changes. `docs/architecture.md` explains how the pieces fit together.
2. Both sides develop on independent branches, with demo data bundled in `web/public/src/` (`scan-points.js`, `maps-data.js`) while the robot side is incomplete.
3. Once pushed to the repository and pulled onto the Raspberry Pi (`git pull`), the auth service serves the updated frontend (and the real session) at `http://<PI_IP>:8080`; restart it with `sudo systemctl restart lidar-auth.service`. The static demo fallback (`webui.service`) must not run at the same time, and Nginx — if used at all — only reverse-proxies to the Node service.
4. Quality gate: `cd lidar-robot/server && npm run coverage` (tests + 90% line / 75% branch thresholds) and `npm run typecheck`, both enforced by CI on every push.

---

## 9. Development Roadmap (5-Phase Implementation Plan)

| Phase | Focus Area | Key Tasks | Milestone |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **Infrastructure & Web Foundations** | - Finalize network and `udev` rules<br>- Install `rosbridge_suite`, `Node-RED`, and Node.js 22 (auth service)<br>- Create master `robot_bringup.launch.py` | Auth service (`:8080`) and Node-RED (`:1880`) are accessible via browser; `rosbridge` (`:9090`) streams live `/scan` data. |
| **Phase 2** | **Live LiDAR on Web UI & Node-RED Bridge** | - Deploy base HTML + `roslibjs` client in `web/`<br>- Connect Node-RED to `rosbridge`<br>- Finalize `docs/interface.md` | Live LiDAR `/scan` points render directly inside the custom web UI hosted on the Pi. |
| **Phase 3** | **Drivetrain, IMU & Odometry** | - Wire DRV8833, encoders, and MPU6050<br>- Implement `motor_driver` node<br>- Configure `robot_localization` (EKF -> `/odom`) | Robot can be driven via web teleop controls and outputs fused `/odom` telemetry. |
| **Phase 4** | **SLAM Mapping & Nav2** | - Configure `slam_toolbox` (`/map`)<br>- Set up `nav2_config` (`/goal_pose`, `/keepout_mask`) | Live occupancy grid map renders in the browser; clicking a point triggers autonomous navigation. |
| **Phase 5** | **Automation & Systemd Autostart** | - Build map manager and "Go Home" (`home_pose`) workflows in Node-REDbr>- Implement no-go zone editor on the web UI<br>- Enable `systemd` boot service | Robot boots into full operational state automatically, supporting map switching and return-to-home. |

---

## 10. Proposed Web Features (Pending Prioritization)

**Mapping & Navigation**
- Click-to-navigate, waypoint lists, and manual teleop control.
- Zoom/pan mechanics, map switching, and map export/import.
- "Go Home" button and automatic return on low battery.
- Preferred routing zones and patrol modes.

**Live Status & Monitoring**
- Live LiDAR overlay, robot position/heading, and current speed.
- Battery level, motor load, connection status, and error logs.
- Optional camera stream.

**History & Analytics**
- Route history, operation statistics (distance, uptime), map versioning, and log exporting.

**Control & Security**
- Emergency stop, speed limits, user access control, and geofencing.

**Configuration & UX**
- Nav2 parameter tuning via UI, calibration wizard, and remote reboot.
- Mobile-friendly responsive design, dark/light themes, and read-only shareable links.

**Developer Tools**
- Raw topic inspector, rosbag recording triggers, and simulated mode toggles.
