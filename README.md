# LiDAR-Controlled Autonomous Mobile Robot

## 1. Overview

This project aims to develop a self-contained (On-Board / Edge architecture), Raspberry Pi 5-controlled autonomous mobile robot[cite: 5, 17]. Utilizing a LiDAR sensor and encoder-equipped motors, the robot can autonomously map its environment and navigate to designated waypoints via a web interface[cite: 5, 17]. Each mapped environment features a saved "base point" to which the robot can automatically return[cite: 5, 17].

The entire software stack—including the ROS 2 backend, Node-RED automation engine, communication bridges, and the Nginx web server hosting the user interface—runs directly on the Raspberry Pi 5[cite: 5, 17]. Client devices (laptops, tablets, or smartphones) require no local software installation and can access the control interface via any modern web browser using the robot's IP address. The system architecture is designed to support parallel development, dividing the workload into two main streams: hardware/robotics and web interface development[cite: 5, 17].

---

## 2. Key Features

- Environment mapping using LiDAR (SLAM)[cite: 5, 17].
- Autonomous navigation to arbitrary user-defined points on the mapped layout[cite: 5, 17].
- Saved base points for each map, enabling automated return-to-home functionality[cite: 5, 17].
- On-board web-based user interface (served via Nginx) for map editing and defining no-go zones (keepout masks)[cite: 5, 17].
- Live LiDAR scan visualization on the web interface, alongside the generated map[cite: 5, 17].
- On-board Node-RED automation engine for telemetry routing, battery monitoring, and high-level system logic[cite: 5, 17].

---

## 3. Hardware Requirements

**Control & Processing**
- Raspberry Pi 5[cite: 5, 17]
- microSD card (64GB, A2 class)[cite: 5, 17]

**Sensors**
- LiDAR: RPLiDAR (`rplidar_ros` compatible)[cite: 5, 7, 17]
- IMU: MPU6050 (for odometry fusion)[cite: 5, 17]

**Drivetrain**
- 2x DC motors with built-in encoders[cite: 5, 17]
- 1x free-spinning caster wheel (differential drive setup)[cite: 5, 17]
- Motor driver: DRV8833[cite: 5, 17]

**Power Supply**
- LiPo battery (dedicated power for motors)[cite: 5, 17]
- DC-DC step-down converter (to provide stable power to the Raspberry Pi)[cite: 5, 17]
- BMS / Battery charger[cite: 5, 17]

**Mechanical**
- Laser-cut or 3D-printed chassis[cite: 5, 17]
- Collision bumper with emergency stop switch (optional)[cite: 5, 17]

---

## 4. Software Architecture & Technologies (On-Board Edge Model)

### Core Technologies
- **ROS 2** (Jazzy on Ubuntu 24.04/22.04 ARM64)[cite: 5, 9, 17]
- **Nav2** for navigation and path planning[cite: 5, 17]
- **slam_toolbox** for SLAM and mapping[cite: 5, 17]
- **Node-RED** for telemetry routing, automation workflows, and bridging ROS 2 data with high-level system logic[cite: 5, 17]
- **Nginx** for serving the static web control interface (Web UI) directly from the Raspberry Pi

### 4-Layer System Architecture on the Raspberry Pi 5

```text
+-------------------------------------------------------------------------+
|                    CLIENT DEVICES (Laptop / Tablet / Phone)             |
|   [ Browser: Web UI (:80) ]   [Node-RED (:1880)]   [Foxglove (:8765)]   |
+-----------------|-----------------------|--------------------|----------+
                  | HTTP & WS (:9090)     | HTTP               | WS
+-----------------|-----------------------|--------------------|----------+
| RASPBERRY PI 5  v                       v                    v          |
|  4. WEB SERVER LAYER (Nginx - Port 80)                                  |
|     - Serves static HTML/JS (roslibjs/ros2djs) UI from /web/public      |
|                                                                         |
|  3. AUTOMATION LAYER (Node-RED - Port 1880)                             |
|     - Telemetry routing, battery monitor, "Go Home" logic, map manager  |
|                                                                         |
|  2. COMMUNICATION BRIDGE LAYER (Middleware Bridges)                     |
|     - rosbridge_suite (Port 9090): WebSocket bridge for Web UI &        |
|       Node-RED                                                          |
|     - foxglove_bridge (Port 8765): 3D developer diagnostics             |
|                                                                         |
|  1. ROS 2 JAZZY CORE (Robot Backend)                                    |
|     - Hardware: rplidar_ros (/scan), motor_driver, MPU6050 IMU          |
|     - Localization & Nav: robot_localization (EKF), slam_toolbox, nav2  |
+-------------------------------------------------------------------------+
```

### System Structure

**1. ROS 2 Core (Raspberry Pi Backend)**
- LiDAR driver (`rplidar_ros` / `ldlidar_stl_ros2`)[cite: 5, 7, 17]
- Motor control node and encoder reading[cite: 5, 17]
- `robot_localization` (EKF: encoder and IMU fusion)[cite: 5, 17]
- `slam_toolbox` (Map building)[cite: 5, 17]
- `nav2` (AMCL, planner, controller, `keepout_filter`)[cite: 5, 17]
- Map manager (saving/loading maps and base points)[cite: 5, 17]

**2. Communication Bridge Layer (Middleware Bridges)**
- `rosbridge_suite` (WebSocket communication on port `9090` for the web UI and Node-RED)[cite: 5, 17]
- `foxglove_bridge` (WebSocket server on port `8765` for 3D developer visualization and diagnostics)[cite: 8, 9]

**3. Automation Layer (Node-RED)**
- Local Node-RED server (port `1880`) providing the automation layer and logic integration[cite: 5, 17]
- Interfaces with ROS 2 locally via `ws://127.0.0.1:9090` and executes system-level tasks (e.g., map saving, remote reboot)[cite: 5, 17]

**4. Web Server & Web Application (Nginx & Frontend)**
- Nginx web server (port `80`) serving the frontend directly from `web/public`[cite: 6, 17]
- `roslibjs` / `ros2djs` (Map rendering and ROS communication)[cite: 5, 17]
- No-go zone editor (Publishing keepout masks)[cite: 5, 17]
- Live `/scan` processing and rendering[cite: 5, 17]
- "Go Home" functionality (triggering `navigate_to_pose` for the base point)[cite: 5, 17]
- Map switching interface[cite: 5, 17]

---

## 5. Development Interface & Network Ports

To enable parallel development, the hardware and web teams rely on a predefined data structure documented in `docs/interface.md`[cite: 5, 17].

### 5.1. ROS 2 Topics & Data Structures
- **ROS 2 Topics & Types:** `/map` (`OccupancyGrid`), `/scan` (`LaserScan`), `/odom`, `/goal_pose` (`PoseStamped`), `/keepout_mask`, `/battery_state`[cite: 5, 17]
- **ROS 2 Domain:** `ROS_DOMAIN_ID=10` for network isolation
- **Connection:** `rosbridge_suite` WebSocket address and port (`ws://<PI_IP>:9090`)[cite: 5, 17]
- **Map Data Structure:** `{map_name, map_file, home_pose: {x, y, theta}}`[cite: 5, 17]

While the physical robot is under development, the web team utilizes simulated/mock data based on this schema[cite: 5, 17]. Once deployed on the Raspberry Pi, the frontend dynamically connects to the local `rosbridge_suite` endpoint via `ws://${window.location.hostname}:9090`[cite: 5, 17].

### 5.2. On-Board Network Services & Ports

| Service | Port / Endpoint | Description |
| :--- | :--- | :--- |
| **Web UI (Nginx)** | `http://<PI_IP>:80` | Main web-based robot control interface[cite: 5, 17]. |
| **Node-RED** | `http://<PI_IP>:1880` | Visual automation, telemetry routing, and logic editor[cite: 5, 17]. |
| **rosbridge_suite** | `ws://<PI_IP>:9090` | WebSocket bridge for the `roslibjs` web app and Node-RED[cite: 5, 17]. |
| **foxglove_bridge** | `ws://<PI_IP>:8765` | Developer WebSocket bridge for 3D diagnostics in Foxglove Studio[cite: 8, 9]. |

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
├── PROJECT_BOARD.md
└── .github/
    └── ISSUE_TEMPLATE.md
```

---

## 7. System Setup & Deployment (Raspberry Pi 5)

### 7.1. Network Management (NetworkManager & Direct Ethernet Link)
To resolve default Ubuntu Server `unmanaged` interface states, `NetworkManager` is configured as the primary renderer[cite: 1, 2, 3]:

```bash
sudo sh -c 'echo "network:" > /etc/netplan/99-networkmanager.yaml'
sudo sh -c 'echo "  version: 2" >> /etc/netplan/99-networkmanager.yaml'
sudo sh -c 'echo "  renderer: NetworkManager" >> /etc/netplan/99-networkmanager.yaml'
sudo netplan apply
sudo systemctl restart NetworkManager
```

For direct (routerless) Ethernet cable connections between the host laptop and the Raspberry Pi, a link-local profile is used[cite: 16]:

```bash
sudo nmcli connection add type ethernet ifname eth0 ipv4.method link-local con-name "DirectMAC"
sudo nmcli connection up DirectMAC
```

### 7.2. Persistent USB Permissions (`udev`)
To automatically grant read/write access to the LiDAR serial port (`/dev/ttyUSB0`) on boot without manual intervention[cite: 7]:

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
3. **Install Nginx and link the `web/public` directory[cite: 6, 17]:**
   ```bash
   sudo apt install nginx -y
   sudo rm -rf /var/www/html
   sudo ln -s /home/admin/lidar-robot/web/public /var/www/html
   sudo chmod -R 755 /home/admin/lidar-robot/web
   ```

### 7.4. Manual Bringup (Testing)
To manually start the LiDAR driver and Foxglove WebSocket bridge on the Raspberry Pi[cite: 7, 9]:

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
1. The initial phase requires establishing `docs/interface.md` and populating `PROJECT_BOARD.md`[cite: 5, 17].
2. Both sides develop on independent branches using simulated data in `web/mock/` where needed, with regular synchronization meetings[cite: 5, 6, 17].
3. Once pushed to the repository and pulled onto the Raspberry Pi (`git pull`), Nginx immediately serves the updated frontend connected to live robot telemetry[cite: 5, 17].

---

## 9. Development Roadmap (5-Phase Implementation Plan)

| Phase | Focus Area | Key Tasks | Milestone |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **Infrastructure & Web Foundations** | - Finalize network and `udev` rules<br>- Install `rosbridge_suite`, `Node-RED`, and `Nginx`[cite: 5, 17]<br>- Create master `robot_bringup.launch.py` | Nginx (`:80`) and Node-RED (`:1880`) are accessible via browser; `rosbridge` (`:9090`) streams live `/scan` data[cite: 5, 9, 17]. |
| **Phase 2** | **Live LiDAR on Web UI & Node-RED Bridge** | - Deploy base HTML + `roslibjs` client in `web/`[cite: 5, 6, 17]<br>- Connect Node-RED to `rosbridge`<br>- Finalize `docs/interface.md`[cite: 5, 17] | Live LiDAR `/scan` points render directly inside the custom web UI hosted on the Pi[cite: 5, 17]. |
| **Phase 3** | **Drivetrain, IMU & Odometry** | - Wire DRV8833, encoders, and MPU6050[cite: 5, 17]<br>- Implement `motor_driver` node[cite: 6, 17]<br>- Configure `robot_localization` (EKF -> `/odom`)[cite: 5, 17] | Robot can be driven via web teleop controls and outputs fused `/odom` telemetry[cite: 5, 17]. |
| **Phase 4** | **SLAM Mapping & Nav2** | - Configure `slam_toolbox` (`/map`)[cite: 5, 17]<br>- Set up `nav2_config` (`/goal_pose`, `/keepout_mask`)[cite: 5, 6, 17] | Live occupancy grid map renders in the browser; clicking a point triggers autonomous navigation[cite: 5, 17]. |
| **Phase 5** | **Automation & Systemd Autostart** | - Build map manager and "Go Home" (`home_pose`) workflows in Node-RED[cite: 5, 17]<br>- Implement no-go zone editor on the web UI[cite: 5, 17]<br>- Enable `systemd` boot service | Robot boots into full operational state automatically, supporting map switching and return-to-home[cite: 5, 17]. |

---

## 10. Proposed Web Features (Pending Prioritization)

**Mapping & Navigation**
- Click-to-navigate, waypoint lists, and manual teleop control[cite: 5, 17].
- Zoom/pan mechanics, map switching, and map export/import[cite: 5, 17].
- "Go Home" button and automatic return on low battery[cite: 5, 17].
- Preferred routing zones and patrol modes[cite: 5, 17].

**Live Status & Monitoring**
- Live LiDAR overlay, robot position/heading, and current speed[cite: 5, 17].
- Battery level, motor load, connection status, and error logs[cite: 5, 17].
- Optional camera stream[cite: 5, 17].

**History & Analytics**
- Route history, operation statistics (distance, uptime), map versioning, and log exporting[cite: 5, 17].

**Control & Security**
- Emergency stop, speed limits, user access control, and geofencing[cite: 5, 17].

**Configuration & UX**
- Nav2 parameter tuning via UI, calibration wizard, and remote reboot[cite: 5, 17].
- Mobile-friendly responsive design, dark/light themes, and read-only shareable links[cite: 5, 17].

**Developer Tools**
- Raw topic inspector, rosbag recording triggers, and simulated mode toggles[cite: 5, 17].
