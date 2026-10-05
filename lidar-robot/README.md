# LiDAR-Controlled Autonomous Mobile Robot

## 1. Overview

This project aims to develop a Raspberry Pi-controlled mobile robot. Utilizing a LiDAR sensor and encoder-equipped motors, the robot can autonomously map its environment and navigate to designated waypoints via a web interface. Each mapped environment features a saved "base point" to which the robot can automatically return. The architecture is designed to support parallel development, dividing the workload into two main streams: hardware/robotics and web interface development.

## 2. Key Features

- Environment mapping using LiDAR (SLAM).
- Autonomous navigation to arbitrary user-defined points on the mapped layout.
- Saved base points for each map, enabling automated return-to-home functionality.
- Web-based user interface for map editing and defining no-go zones (keepout masks).
- Live LiDAR scan visualization on the web interface, alongside the generated map.

## 3. Hardware Requirements

**Control & Processing**
- Raspberry Pi 5
- microSD card (64GB, A2 class)

**Sensors**
- LiDAR: RFLidar
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

## 4. Software Architecture & Technologies

**Core Technologies**
- **ROS 2** (Humble or Jazzy on Ubuntu 22.04/24.04 ARM64)
- **Nav2** for navigation and path planning
- **slam_toolbox** for SLAM and mapping
- **Node-RED** for telemetry routing, automation workflows, and bridging ROS 2 data with high-level system logic.

**System Structure**

*Raspberry Pi (Robot Side)*
- LiDAR driver (`rplidar_ros` / `ldlidar_stl_ros2`)
- Motor control node and encoder reading
- `robot_localization` (EKF: encoder and IMU fusion)
- `slam_toolbox` (Map building)
- `nav2` (AMCL, planner, controller, keepout_filter)
- Map manager (saving/loading maps and base points)
- `rosbridge_suite` (WebSocket communication for the web UI)
- Node-RED (automation layer and logic integration)

*Web Application*
- `roslibjs` / `ros2djs` (Map rendering and ROS communication)
- No-go zone editor (Publishing keepout masks)
- Live `/scan` processing and rendering
- "Go Home" functionality (triggering `navigate_to_pose` for the base point)
- Map switching interface

## 5. Development Interface

To enable parallel development, the hardware and web teams rely on a predefined data structure documented in `docs/interface.md`. 

- **ROS 2 Topics & Types:** `/map` (OccupancyGrid), `/scan` (LaserScan), `/odom`, `/goal_pose` (PoseStamped), `/keepout_mask`, `/battery_state`
- **Connection:** `rosbridge_suite` WebSocket address and port
- **Map Data Structure:** `{map_name, map_file, home_pose: {x, y, theta}}`

While the physical robot is under development, the web team utilizes simulated/mock data based on this schema. Once the hardware is ready, the frontend is simply pointed to the Raspberry Pi's IP address.

## 6. Repository Structure

```text
lidar-robot/
├── README.md
├── docs/
│   ├── interface.md
│   ├── architecture.md
│   └── hardware-parts.md
├── robot/              # Hardware and ROS 2 workspace
│   ├── launch/
│   ├── src/
│   │   ├── motor_driver/
│   │   ├── lidar_bringup/
│   │   ├── localization/
│   │   └── nav2_config/
│   └── README.md
├── web/                # Web interface application
│   ├── src/
│   ├── public/
│   ├── mock/           # Simulated ROS data for frontend testing
│   └── README.md
├── PROJECT_BOARD.md
└── .github/
    └── ISSUE_TEMPLATE.md
```

## 7. Team Division

| Area | Responsibilities |
|---|---|
| **Hardware / Robot Side** | Chassis assembly, motor controller node, encoder and IMU fusion, LiDAR driver, SLAM and Nav2 integration, configuring rosbridge and Node-RED. |
| **Web Side** | UI framework, roslibjs/ros2djs integration, live LiDAR and map rendering, no-go zone drawing tool, map management interface. |

**Workflow:** The initial phase requires establishing `interface.md` and populating the project board. Following this, both sides will develop on independent branches using mock data, with regular synchronization meetings.

## 8. Proposed Web Features (Pending Prioritization)

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
