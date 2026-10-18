const statusEl = document.getElementById('conn-status');
const canvas = document.getElementById('lidarCanvas');
const ctx = canvas.getContext('2d');
let pixelsPerMeter = 80;
let isMockMode = false;
let mockInterval = null;
let mockAngleOffset = 0;

// 1. ROS 2 WebSocket kapcsolat (Éles robot mód)
const wsHost = window.location.hostname || 'pi5-ros.local';
const wsUrl = ws://:9090;
let ros = null;

function connectROS() {
    if (typeof ROSLIB === 'undefined') {
        enableMockMode();
        return;
    }
    ros = new ROSLIB.Ros({ url: wsUrl });

    ros.on('connection', () => {
        if (!isMockMode) {
            statusEl.textContent = 🟢 Élő kapcsolat ();
            statusEl.className = 'status-badge status-connected';
        }
    });

    ros.on('error', () => {
        if (!isMockMode) {
            statusEl.textContent = 🔴 Robot nem elérhető (Kapcsold be a Mock módot!);
            statusEl.className = 'status-badge status-error';
        }
    });

    const scanListener = new ROSLIB.Topic({
        ros: ros,
        name: '/scan',
        messageType: 'sensor_msgs/msg/LaserScan'
    });

    scanListener.subscribe((msg) => {
        if (!isMockMode) renderScan(msg);
    });
}

// 2. Radar rács kirajzolása
function drawRadarGrid() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#21262d';
    ctx.fillStyle = '#484f58';
    ctx.font = '12px sans-serif';
    ctx.lineWidth = 1;

    for (let m = 1; m <= 10; m++) {
        const radius = m * pixelsPerMeter;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.fillText(${m}m, cx + 4, cy - radius + 12);
    }

    ctx.beginPath();
    ctx.moveTo(0, cy); ctx.lineTo(canvas.width, cy);
    ctx.moveTo(cx, 0); ctx.lineTo(cx, canvas.height);
    ctx.stroke();

    // Robot középpont
    ctx.fillStyle = '#58a6ff';
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, 2 * Math.PI);
    ctx.fill();

    ctx.strokeStyle = '#58a6ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - 20);
    ctx.stroke();
}

// 3. Pontok kirajzolása (Éles és Szimulált módban is)
function renderScan(msg) {
    drawRadarGrid();
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    let validPoints = 0;
    let minDistance = Infinity;

    ctx.fillStyle = isMockMode ? '#ffcc00' : '#00ffcc';

    for (let i = 0; i < msg.ranges.length; i++) {
        const r = msg.ranges[i];
        if (r === null || isNaN(r) || r < msg.range_min || r > msg.range_max) continue;

        validPoints++;
        if (r < minDistance) minDistance = r;

        const angle = msg.angle_min + (i * msg.angle_increment);
        const x = cx - (r * Math.sin(angle)) * pixelsPerMeter;
        const y = cy - (r * Math.cos(angle)) * pixelsPerMeter;
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }

    document.getElementById('point-count').textContent = validPoints;
    document.getElementById('min-dist').textContent = minDistance !== Infinity ? minDistance.toFixed(2) : '-';
}

// 4. Szimulált (Mock) Mód a Web Dizájnernek (Robot nélkül is működik!)
function toggleMockMode() {
    isMockMode = !isMockMode;
    if (isMockMode) {
        statusEl.textContent = '🧪 Szimulált (Mock) Mód Aktív';
        statusEl.className = 'status-badge status-mock';
        mockInterval = setInterval(() => {
            mockAngleOffset += 0.03;
            const fakeRanges = [];
            for (let i = 0; i < 360; i++) {
                const rad = (i * Math.PI) / 180;
                // Szimulált szoba falak + egy mozgó tárgy
                let dist = 3.2 + 0.4 * Math.sin(rad * 4);
                if (i > 40 && i < 70) dist = 1.4 + 0.2 * Math.sin(mockAngleOffset);
                fakeRanges.push(dist + (Math.random() * 0.05));
            }
            renderScan({
                angle_min: 0,
                angle_increment: (2 * Math.PI) / 360,
                range_min: 0.15,
                range_max: 12.0,
                ranges: fakeRanges
            });
        }, 100);
    } else {
        clearInterval(mockInterval);
        statusEl.textContent = '⏳ Visszatérés élő módba...';
        drawRadarGrid();
    }
}

function changeZoom(delta) {
    pixelsPerMeter = Math.max(20, Math.min(250, pixelsPerMeter + delta));
    document.getElementById('scale-val').textContent = pixelsPerMeter;
}

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    changeZoom(e.deltaY < 0 ? 10 : -10);
});

drawRadarGrid();
connectROS();
