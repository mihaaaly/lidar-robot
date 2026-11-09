# Hardware parts — LiDAR robot

Ez a lista a tényleges alkatrészek és a hozzájuk tartozó szoftver-beállítások
kapcsolata. Ami itt szerepel, azt a `README.md` 3. szakasza és a deploy
konfiguráció is megerősíti; ami nincs a listán, az nincs beépítve.

## 1. Alkatrészlista (BOM)

| Kategória | Alkatrész | Menny. | Szoftver-kapcsolat |
| :-- | :-- | :-- | :-- |
| Feldolgozás | Raspberry Pi 5 | 1 | Ubuntu 24.04 ARM64, ROS 2 Jazzy, Node ≥ 22.16 |
| Tárolás | microSD 64 GB (A2) | 1 | OS + ROS + `auth.db` / `robot.db` (a DB-k a projekt könyvtárban) |
| Szenzor | RPLiDAR (rplidar_ros kompatibilis) | 1 | `/dev/ttyUSB0`, `rplidar.launch.py` → `/scan`; udev: `KERNEL=="ttyUSB*", MODE="0666"` |
| Szenzor | MPU6050 IMU | 1 | I²C, `robot_localization` EKF bemenet (⬜ nincs bekötve kód szinten) |
| Hajtás | DC motor enkóderrel | 2 | differenciálhajtás, `/odom` forrás (⬜) |
| Hajtás | DRV8833 motor driver | 1 | PWM + direction GPIO (⬜) |
| Mechanika | szabadonfutó kaster kerék | 1 | — |
| Tápellátás | LiPo akkumulátor (motoroknak) | 1 | `/battery_state` forrás (⬜) |
| Tápellátás | DC-DC step-down (Pi-nek) | 1 | 5 V stabil a Pi 5-hez (5 A terhelés!) |
| Tápellátás | BMS / töltő | 1 | — |
| Mechanika | lézervágott / 3D nyomtatott váz | 1 | — |
| Biztonság | ütközésgátló + vészstop kapcsoló | opcionális | ha bekerül, a motor node-nak kell kezelnie |

## 2. Kötelező rendszerbeállítások

```bash
# LiDAR soros port írási joga boot után (a projekt által dokumentált szabály)
echo 'KERNEL=="ttyUSB*", MODE="0666"' | sudo tee /etc/udev/rules.d/99-lidar.rules
sudo udevadm control --reload-rules && sudo udevadm trigger

# a szolgáltatást futtató felhasználó a dialout csoportban legyen
sudo usermod -aG dialout admin
```

Hálózat: NetworkManager renderer (`/etc/netplan/99-networkmanager.yaml`), közvetlen
kártyás kapcsolathoz link-local profil (`nmcli connection add … ipv4.method link-local`).
A Pi a deploy dokumentáció szerint `192.168.1.50`, a deploy mappa
`/home/admin/lidar-robot/lidar-robot`.

## 3. Ami hiányzik a listáról (nyitott kérdés)

- Valós LiPo feszültség/kapacitás mérés (osztó + ADC) — enélkül a `/battery_state` ⬜ marad.
- Vészstop visszacsatolás (a motor driver enable lábára kötve) — biztonsági követelmény,
  ha a robotot beltéren, emberek között használod.
- Enkóder pin-kiosztás dokumentálása: a motor node megírásakor ide kell kerülnie,
  különben a bekötés és a kód külön életet él.
