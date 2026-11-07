# Deploy és indítás a Raspberry-n

Minden parancsot abból a mappából futtass, ahol a `robot/`, `web/`, `deploy/`,
`server/` mappák vannak, vagyis:

    cd /home/admin/lidar-robot/lidar-robot

Előfeltételek (egyszer kell telepíteni):
- ROS 2 (Humble vagy Jazzy) + `rplidar_ros`, `rosbridge_server` (rosbridge_suite), `foxglove_bridge`
- Node-RED + `node-red-contrib-sqlitedb` bővítmény
- Node.js **>= 22.16** az auth service-hez (NodeSource Node 22 LTS)
- Python 3 (csak a statikus demó fallbackhoz)

---

## 1. Web UI — két mód

A web UI kétféleképpen szolgálható ki. **Egyszerre soha ne fusson a kettő**: a
`lidar-auth.service` `Conflicts=webui.service`-t tartalmaz, de a portot is
ütköztetnék.

| Mód | Service | Port | Login |
| :--- | :--- | :--- | :--- |
| **Auth service (ajánlott)** | `lidar-auth.service` (Node) | 8080 | valódi szerveroldali session, SQLite, scrypt |
| Statikus demó (fallback) | `webui.service` (python) | 8080 | kliensoldali demó login, nincs API |

A backend részletei: [`../server/README.md`](../server/README.md).

### 1.1. Auth service telepítése (ajánlott)

**1. Node 22 LTS (>= 22.16):**

    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
    node --version    # >= 22.16.0

> A Node-RED szintén Node-ot használ. A NodeSource Node 22 LTS-sel a Node-RED
> 4.x-nek működnie kell. Ha a meglévő Node-RED verzió nem támogatja a Node 22-t,
> előbb frissítsd a Node-RED-et, vagy használj külön Node-ot a service-hez. A
> service induláskor ellenőrzi a verziót, és érthető hibával leáll, ha túl régi.

**2. Env fájl:**

    sudo install -m 640 -o root -g admin deploy/lidar-auth.env.example /etc/lidar-auth.env
    sudo editor /etc/lidar-auth.env

- Állítsd be a `PUBLIC_ORIGIN`-t a Pi elérhetőségére (pl.
  `http://192.168.1.50:8080`), vagy hagyd üresen (a `Host` headerből derivál).
- A Pi-n `ALLOW_REGISTRATION=0` ajánlott; a fiókot admin CLI-vel hozd létre.
- A `PUBLIC_ORIGIN`-nek **pontosan** egyeznie kell a böngésző címsorában látható
  originnal (séma + host + port), különben a POST-ok `403 forbidden_origin`-t
  kapnak. Ha DHCP-vel változhat az IP, hagyd üresen.

**3. DB könyvtár (a service indulása előtt):**

    sudo install -d -m 700 -o admin -g admin \
      /home/admin/lidar-robot/lidar-robot/robot/data

> A Node-RED `robot.db`-je is ebben a mappában van; ellenőrizd a tulajdonost.
> A systemd `ReadWritePaths` csak ezt a mappát engedi írni.

**4. Service:**

    sudo cp deploy/systemd/lidar-auth.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl disable --now webui.service     # a statikus demo le
    sudo systemctl enable --now lidar-auth.service
    sudo systemctl status lidar-auth.service
    sudo journalctl -u lidar-auth.service -f

> A `ProtectHome=read-only` + `ReadWritePaths` kombinációt a Pi-n tesztelni kell;
> ha a DB nem írható, a `ProtectHome` sor elhagyható a unitból. A
> `--disable-warning=ExperimentalWarning` csak a journal zaját csökkenti.

**5. CLI wrapper és az első fiók:**

    sudo install -m 755 deploy/lidar-auth-users.sh /usr/local/bin/lidar-auth-users

    read -rsp "Password: " PW; echo
    printf '%s' "$PW" | sudo -u admin /usr/local/bin/lidar-auth-users add \
      --email alex@example.com --name "Alex Morgan" --password-stdin
    unset PW

> A wrapper betölti a `/etc/lidar-auth.env`-et, így a CLI ugyanazt a DB-t
> használja, mint a service. A fájl `0640 root:admin`, ezért `sudo -u admin`
> olvasni tudja.

**6. Böngésző:** `http://<pi-ip>:8080/auth.html#/auth`

### 1.2. Statikus demó (fallback)

Ha nincs Node 22, vagy csak a design demót akarod megmutatni:

    sudo systemctl disable --now lidar-auth.service
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

> A statikus demóban nincs `lidar_backend` marker, ezért a frontend a
> kliensoldali demó loginra esik vissza. A demó session **nem** biztonsági
> kontroll.

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

## 4. Nginx / 80-as port — bypass figyelmeztetés

Ha az Nginx a 80-as porton **közvetlenül** a `web/public`-t szolgálja ki, akkor
a szerveroldali gate megkerülhető a 80-as porton (a login kihagyható). Ezért:

- vagy tiltsd le az Nginx statikus site-ját, és használd a Node service-t a
  8080-on;
- vagy állítsd be az Nginxet **reverse proxy**-nak a Node service felé
  (`proxy_pass http://127.0.0.1:8787;`), és a `web/public`-ot ne szolgáld ki
  közvetlenül.

Ellenőrzés (ha van Nginx a 80-on):

    curl -I http://<pi>/

A gyökérnek a Node gate-hez kell irányítania (`302` vagy proxy), **nem** adhat
`200`-at a statikus `index.html`-re. Ha 200-at ad, a login megkerülhető.

A `webui.service` (python) és a `lidar-auth.service` ne fusson egyszerre.

---

## 5. Karbantartás

### 5.1. Admin CLI

    sudo -u admin /usr/local/bin/lidar-auth-users list

    read -rsp "Password: " PW; echo
    printf '%s' "$PW" | sudo -u admin /usr/local/bin/lidar-auth-users passwd \
      --email alex@example.com --password-stdin
    unset PW

    sudo -u admin /usr/local/bin/lidar-auth-users remove \
      --email alex@example.com --yes

A `passwd` visszavonja a felhasználó összes sessionjét. A `remove` a
sessionöket is törli (FK cascade).

### 5.2. Backup

    sudo -u admin mkdir -p /home/admin/backups
    sudo -u admin /usr/local/bin/lidar-auth-users backup \
      --out /home/admin/backups/auth-$(date +%F).db
    chmod 600 /home/admin/backups/auth-*.db

A backup jelszó-hasheket tartalmaz: kezeld úgy, mint a DB-t.

### 5.3. Restore

    sudo systemctl stop lidar-auth.service
    sudo rm -f /home/admin/lidar-robot/lidar-robot/robot/data/auth.db-wal \
               /home/admin/lidar-robot/lidar-robot/robot/data/auth.db-shm
    sudo cp /home/admin/backups/auth-2026-01-01.db \
      /home/admin/lidar-robot/lidar-robot/robot/data/auth.db
    sudo chown admin:admin /home/admin/lidar-robot/lidar-robot/robot/data/auth.db
    sudo chmod 600 /home/admin/lidar-robot/lidar-robot/robot/data/auth.db
    sudo systemctl start lidar-auth.service

A WAL/SHM fájlokat a restore előtt törölni kell, ha maradtak (a service
stopped állapotában). Ha a backup régebbi sémájú, a service induláskor migrálja.

### 5.4. Upgrade

    cd /home/admin/lidar-robot && git pull
    sudo systemctl restart lidar-auth.service

A séma-migráció induláskor fut; előtte készíts backupot. A statikus fájlok
`no-cache`-el mennek, így a böngésző frissít.

### 5.5. Uninstall

    sudo systemctl disable --now lidar-auth.service
    sudo rm /etc/systemd/system/lidar-auth.service
    sudo systemctl daemon-reload
    # a DB-t csak akkor töröld, ha nem kell:
    # sudo rm /home/admin/lidar-robot/lidar-robot/robot/data/auth.db*

---

## 6. Offline ellenőrzés

- A backend **nem** hív külső szolgáltatást: nincs CDN, nincs npm, nincs e-mail,
  nincs DNS-alapú függőség.
- A Pi a saját SQLite fájljából dolgozik; a fejlesztőgép lecsatlakoztatása után
  is működik.
- A UI Google Fontsot tölt be; internet nélkül fallback fontra vált (ez a
  frontend meglévő viselkedése, nem a backend függősége).

Teszt:

1. Bontsd a fejlesztőgép hálózatát, és a Pi-t külön elérve nyisd meg:
   `http://<pi-ip>:8080/auth.html#/auth`.
2. Regisztrálj vagy lépj be az admin CLI-vel létrehozott fiókkal.
3. A Map Selection és a workspace betölt; a Sign out után a login jelenik meg.
4. Indítsd újra a service-t (`sudo systemctl restart lidar-auth.service`), majd a
   böngészőt: a remember session megmarad.
5. Indítsd újra a Pi-t: a service automatikusan indul, a session megmarad.

---

## Összefoglaló sorrend

1. Web UI auth service (ajánlott):
   `sudo systemctl disable --now webui.service` +
   `sudo systemctl enable --now lidar-auth.service`
   (vagy statikus demó: `webui.service`)
2. Node-RED:  `sudo systemctl enable --now nodered`  + flows.json importálása
3. ROS:       `sudo systemctl enable --now robot-bringup.service`

Böngésző: http://<raspberry-ip>:8080  ->  Design/Mock Mode kapcsoló -> Live mód
