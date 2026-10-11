## Rendszerkövetelmények és Beállítások (Raspberry Pi)

### 1. Hálózatkezelés (Netplan javítás)
Az Ubuntu Server alapértelmezetten blokkolhatja a Wi-Fi kártyát (`unmanaged` állapot). A NetworkManager engedélyezéséhez futtasd a következő parancsokat:

```bash
sudo sh -c 'echo "network:" > /etc/netplan/99-networkmanager.yaml'
sudo sh -c 'echo "  version: 2" >> /etc/netplan/99-networkmanager.yaml'
sudo sh -c 'echo "  renderer: NetworkManager" >> /etc/netplan/99-networkmanager.yaml'

sudo netplan apply
sudo systemctl restart NetworkManager
sudo nmcli device wifi connect "HALOZAT_NEVE" password "JELSZO" hidden yes



sudo apt update
sudo apt install ros-jazzy-foxglove-bridge -y
sudo apt install ros-jazzy-rplidar-ros -y



