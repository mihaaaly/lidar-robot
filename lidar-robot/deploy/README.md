# Deploy és indítás a Raspberry-n

Minden parancsot abból a mappából futtass, ahol a `robot/`, `web/`, `deploy/`
mappák vannak, vagyis:

    cd /home/admin/lidar-robot/lidar-robot

Előfeltételek (egyszer kell telepíteni):
- ROS 2 (Humble vagy Jazzy) + `rplidar_ros`, `rosbridge_server` (rosbridge_suite), `foxglove_bridge`
- Node-RED + `node-red-contrib-sqlitedb` bővítmény
- Python 3

---

## 1. Web UI — automatikus indulás (boot után is)

    sudo cp deploy/systemd/webui.service /etc/systemd/system/webui.service
    sudo systemctl daemon-reload
    sudo systemctl enable --now webui.service

A web UI ezután folyamatosan fut és újraindítás után is elindul:

    http://<raspberry-ip>:8080

Ellenőrzés / log:

    sudo systemctl status webui.service
    sudo journalctl -u webui.service -f

Megjegyzés: ha a felhasználóneved nem `admin`, írd át a service fájlban a
`User=admin` sort. A portot is átírhatod (alapértelmezett: 8080).

---

## 2. Node-RED (go-home + SQLite)

    sudo systemctl enable --now nodered

Böngészőben nyisd meg a Node-RED editort, és importáld a flow-kat:

    http://<raspberry-ip>:1880  ->  Menü -> Import -> robot/nodered/flows.json -> Deploy

A flow SQLite adatbázist használ ezen az úton:

    /home/admin/lidar-robot/lidar-robot/robot/data/robot.db

Ha az adatbázis még nem létezik, hozd létre a táblákat egyszer:

    sqlite3 /home/admin/lidar-robot/lidar-robot/robot/data/robot.db \
      "CREATE TABLE IF NOT EXISTS maps (map_name TEXT, map_file TEXT, home_x REAL, home_y REAL, home_theta REAL, is_active INTEGER); \
       CREATE TABLE IF NOT EXISTS system_logs (level TEXT, source TEXT, message TEXT);"

---

## 3. ROS 2 bringup (LiDAR + rosbridge + foxglove)

Automatikus (boot utáni) indítás:

    sudo cp deploy/systemd/robot-bringup.service /etc/systemd/system/robot-bringup.service
    sudo systemctl daemon-reload
    sudo systemctl enable --now robot-bringup.service

Fontos: a robot-bringup.service-ben állítsd a ROS disztrót a sajátodra
(humble vagy jazzy). Ha a rplidar_ros / foxglove_bridge-t forrásból építetted,
a workspace `install/setup.bash`-ját is be kell source-olni az ExecStart sorban.
A LiDAR soros portjához add a felhasználót a dialout csoporthoz:

    sudo usermod -aG dialout admin

Manuális indítás:

    source /opt/ros/humble/setup.bash     # vagy jazzy
    ros2 launch /home/admin/lidar-robot/lidar-robot/robot/launch/robot_bringup.launch.py

Ellenőrzés:

    ros2 topic list          # /scan latszania kell
    ros2 topic echo /scan --once

---

## Összefoglaló sorrend

1. Web UI:    sudo systemctl enable --now webui.service
2. Node-RED:  sudo systemctl enable --now nodered  + flows.json importálása
3. ROS:       sudo systemctl enable --now robot-bringup.service

Böngésző: http://<raspberry-ip>:8080  ->  Design/Mock Mode kapcsoló -> Live mód
