# LiDAR-Controlled Autonomous Mobile Robot

## 1. Overview

This project aims to develop a self-contained (On-Board / Edge architecture), Raspberry Pi 5-controlled autonomous mobile robot. Utilizing a LiDAR sensor and encoder-equipped motors, the robot can autonomously map its environment and navigate to designated waypoints via a web interface. Each mapped environment features a saved "base point" to which the robot can automatically return.

The entire software stack—including the ROS 2 backend, Node-RED automation engine, communication bridges, and the Nginx web server hosting the user interface—runs directly on the Raspberry Pi 5. Client devices (laptops, tablets, or smartphones) require no local software installation and can access the control interface via any modern web browser using the robot's IP address. The system architecture is designed to support parallel development, dividing the workload into two main streams: hardware/robotics and web interface development.

---

## 2. Key Features

- Environment mapping using LiDAR (SLAM).
- Autonomous navigation to arbitrary user-defined points on the mapped layout.
- Saved base points for each map, enabling automated return-to-home functionality.
- On-board web-based user interface (served via Nginx) for map editing and defining no-go zones (keepout masks).
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
- **Nginx** for serving the static web control interface (Web UI) directly from the Raspberry Pi

### Data Flow Diagram

<img width="500" height="1001" alt="Untitled diagram-2026-10-18-194754" src="https://github.com/user-attachments/assets/ad2d1692-350f-4aae-86bd-9822883ebfc3" />

### Data Flow Diagram

<img width="800" height="800" alt="architektura_kozepre_igazitva" src="https://github.com/user-attachments/assets/d2fa2cfc-0e5e-481e-882b-d3510a1523f1" />


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

**4. Web Server & Web Application (Nginx & Frontend)**
- Nginx web server (port `80`) serving the frontend directly from `web/public`
- `roslibjs` / `ros2djs` (Map rendering and ROS communication)
- No-go zone editor (Publishing keepout masks)
- Live `/scan` processing and rendering
- "Go Home" functionality (triggering `navigate_to_pose` for the base point)
- Map switching interface

**5. Database Diagramm Data-Flow Diagram**

<img width="1305" height="1116" alt="Lidar_Robot_Diagram" src="https://github.com/user-attachments/assets/04dbe159-63c5-4895-8526-e06647dc9a67" />

---

## 5. Development Interface & Network Ports

To enable parallel development, the hardware and web teams rely on a predefined data structure documented in `docs/interface.md`

### 5.1. ROS 2 Topics & Data Structures
- **ROS 2 Topics & Types:** `/map` (`OccupancyGrid`), `/scan` (`LaserScan`), `/odom`, `/goal_pose` (`PoseStamped`), `/keepout_mask`, `/battery_state`
- **ROS 2 Domain:** `ROS_DOMAIN_ID=10` for network isolation
- **Connection:** `rosbridge_suite` WebSocket address and port (`ws://<PI_IP>:9090`)
- **Map Data Structure:** `{map_name, map_file, home_pose: {x, y, theta}}`

While the physical robot is under development, the web team utilizes simulated/mock data based on this schema. Once deployed on the Raspberry Pi, the frontend dynamically connects to the local `rosbridge_suite` endpoint via `ws://${window.location.hostname}:9090`.

### 5.2. On-Board Network Services & Ports

| Service | Port / Endpoint | Description |
| :--- | :--- | :--- |
| **Web UI (Nginx)** | `http://<PI_IP>:80` | Main web-based robot control interface. |
| **Node-RED** | `http://<PI_IP>:1880` | Visual automation, telemetry routing, and logic editor. |
| **rosbridge_suite** | `ws://<PI_IP>:9090` | WebSocket bridge for the `roslibjs` web app and Node-RED. |
| **foxglove_bridge** | `ws://<PI_IP>:8765` | Developer WebSocket bridge for 3D diagnostics in Foxglove Studio.|

---

## 6. Repository Structure

```text
lidar-robot/
├── README.md
├── docs/
│   ├── interface.md
│   ├── architecture.md
│   └── hardware-parts.md
├── robot/                        # Hardware, ROS 2 workspace, and system configs
│   ├── launch/
│   │   └── robot_bringup.launch.py  # Master launch file (LiDAR, rosbridge, foxglove, Nav2)
│   ├── systemd/                  # Autostart services and hardware udev rules
│   │   ├── lidar-robot.service
│   │   └── 99-lidar.rules
│   ├── nodered/                  # Version-controlled Node-RED flows (flows.json)
│   ├── src/
│   │   ├── motor_driver/
│   │   ├── lidar_bringup/
│   │   ├── localization/
│   │   └── nav2_config/
│   └── README.md
├── web/                          # Web interface application served by Nginx
│   ├── src/
│   ├── public/                   # Static web root symlinked to /var/www/html
│   ├── mock/                     # Simulated ROS data for frontend testing
│   └── README.md
├── server/                       # Local-only auth backend (Node.js + SQLite)
│   ├── server.js
│   ├── lib/
│   ├── test/
│   └── README.md
├── PROJECT_BOARD.md
└── .github/
    └── ISSUE_TEMPLATE.md
```

### 6.1. Web UI Auth Layer

The web UI has an auth layer with three screens (`auth.html`) for start / log in /
create account, hash routes (`#/auth`, `#/auth/login`, `#/auth/register`) and two
runtime modes:

| Mode | Where | Session |
| :--- | :--- | :--- |
| **Static demo** | `web/public` on the Raspberry Pi / any static server | `localStorage` or `sessionStorage` (client-side UX gate) |
| **Local backend** | `server/` on this development machine only | HttpOnly `lidar_session` cookie + hashed password in SQLite |

| Piece | Where |
| :--- | :--- |
| Screens, hash router, validation | `web/public/auth.html`, `src/auth.js`, `src/auth.css` |
| Session helpers (`window.Session`) | `web/public/src/session.js` |
| Dashboard guard + `Sign out` | `web/public/index.html`, `src/app.js`, `src/style.css` |
| Real auth API, SQLite, scrypt, rate limit | `server/` (see [`server/README.md`](lidar-robot/server/README.md)) |

- **Static demo session:** `lidar.session` in `localStorage` (remember me, 7 days)
  or `sessionStorage` (tab lifetime, max 24 h). Only e-mail, display name and
  timestamps are stored — never a password.
- **Backend session:** 32-byte random token, stored as SHA-256; the browser gets
  an HttpOnly cookie. Remember me = 7 days, otherwise a session cookie with a
  24 h server-side expiry. Passwords use scrypt + per-user salt.
- **Mode detection:** the backend sets a non-sensitive `lidar_backend=1` cookie;
  without it the frontend runs the old static demo and does not probe the API.
- **Demo mode:** `lidar.demoMode` (`"1"` / `"0"`) is shared between the auth
  screens and the dashboard.
- **Password policy (register):** 12+ characters with at least one number and
  one symbol; a 4-segment strength meter gives live feedback.
- **Static demo login:** any valid e-mail plus any non-empty password signs in,
  and registration logs in immediately.

> ⚠️ **The static Pi deployment is still demo-only.** Its guard is client-side,
> so anyone can bypass it by disabling JavaScript or editing storage. The new
> `server/` backend is the real protection, but it is **local-only in this
> repository and was not deployed to the Pi**.

Details, routes, storage schema and asset regeneration:
[`lidar-robot/docs/auth.md`](lidar-robot/docs/auth.md). Backend run/test
instructions: [`lidar-robot/server/README.md`](lidar-robot/server/README.md).

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

### 7.3. Installing ROS 2 Packages, Node-RED, and Nginx
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
3. **Install Nginx and link the `web/public` directory:**
   ```bash
   sudo apt install nginx -y
   sudo rm -rf /var/www/html
   sudo ln -s /home/admin/lidar-robot/web/public /var/www/html
   sudo chmod -R 755 /home/admin/lidar-robot/web
   ```

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
| **Hardware / Robot Side** | Chassis assembly, motor controller node, encoder and IMU fusion, LiDAR driver, SLAM and Nav2 integration, configuring `rosbridge`, Nginx, and Node-RED on the Pi[cite: 5, 17]. |
| **Web Side** | UI framework, `roslibjs`/`ros2djs` integration, live LiDAR and map rendering, no-go zone drawing tool, map management interface[cite: 5, 17]. |

**Workflow:**
1. The initial phase requires establishing `docs/interface.md` and populating `PROJECT_BOARD.md`.
2. Both sides develop on independent branches using simulated data in `web/mock/` where needed, with regular synchronization meetings.
3. Once pushed to the repository and pulled onto the Raspberry Pi (`git pull`), Nginx immediately serves the updated frontend connected to live robot telemetry.

---

## 9. Development Roadmap (5-Phase Implementation Plan)

| Phase | Focus Area | Key Tasks | Milestone |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **Infrastructure & Web Foundations** | - Finalize network and `udev` rules<br>- Install `rosbridge_suite`, `Node-RED`, and `Nginx`<br>- Create master `robot_bringup.launch.py` | Nginx (`:80`) and Node-RED (`:1880`) are accessible via browser; `rosbridge` (`:9090`) streams live `/scan` data. |
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
