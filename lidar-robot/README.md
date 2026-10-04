# LiDAR-Guided Autonomous Mobile Robot 🤖🚗

## 🎯 Project Goal
The goal of this project is to build and program a mobile robot that uses a LiDAR sensor to autonomously map its environment (SLAM), avoid obstacles, and navigate to user-defined points via a web-based control interface. Additionally, the robot is capable of saving a "base point" (home position) and automatically returning to it once its tasks are completed.

## 📁 File Structure
The repository is structured to allow parallel development of the hardware/robot software and the web interface without conflicts.

* 📂 **`docs/`** - Project documentation.
  * `interface.md`: **CRITICAL FILE!** Defines the ROS topics and JSON structures for communication between the robot and the web interface.
  * `architecture.md`: Detailed description of the software architecture.
  * `hardware-parts.md`: List of hardware components and wiring plans.
* 📂 **`robot/`** - ROS 2 (Humble/Jazzy) based robot control software and configurations (LiDAR, motor drivers, SLAM, Nav2).
* 📂 **`web/`** - Web-based control interface (client side). Contains the UI source code and simulated (`mock`) data for testing without hardware.

## 🛠️ Technologies Used

**Robot (Server) Side:**
* **OS:** Ubuntu (ARM64) on Raspberry Pi
* **Framework:** ROS 2 (Nav2, slam_toolbox, robot_localization)
* **Sensors:** LiDAR (RPLidar / LD19), Motor encoders, IMU

**Web (Client) Side:**
* **Communication:** `rosbridge_suite` (WebSocket)
* **ROS Integration:** `roslibjs`, `ros2djs`
