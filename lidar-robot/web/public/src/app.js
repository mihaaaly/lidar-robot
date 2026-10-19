/* global window, document */
(function () {
    "use strict";

    var CX = 512;
    var CY = 320;
    var BASE_PPM = 80;
    var ZOOM_LEVELS = [0.5, 0.625, 0.75, 0.875, 1, 1.25, 1.5, 1.75, 2];
    var DEFAULT_ZOOM_INDEX = 4;
    var CLOSEST_POINT = { x: 594, y: 269 };
    var FREE_SPACE = [
        [252, 135], [362, 135], [362, 85], [642, 85], [642, 135], [782, 135],
        [782, 490], [692, 490], [692, 550], [282, 550], [282, 430], [232, 430],
        [232, 220], [252, 220]
    ];
    var RING_DISTANCES = [
        { radius: 80, label: "1 m" },
        { radius: 160, label: "2 m" },
        { radius: 240, label: "3 m" }
    ];

    var scanPoints = Array.isArray(window.SCAN_POINTS) ? window.SCAN_POINTS : [];
    var closestDistance = Math.hypot(
        CLOSEST_POINT.x - CX,
        CLOSEST_POINT.y - CY
    ) / BASE_PPM;
    var closestText = closestDistance.toFixed(2).replace(".", ",");
    var zoomIndex = DEFAULT_ZOOM_INDEX;

    var elements = {
        svg: document.getElementById("radar-svg"),
        modeToggle: document.getElementById("mode-toggle"),
        connectionBadge: document.getElementById("connection-badge"),
        connectionText: document.getElementById("connection-text"),
        modeLabel: document.getElementById("mode-label"),
        pointCount: document.getElementById("point-count"),
        closestDistance: document.getElementById("closest-distance"),
        scaleValue: document.getElementById("scale-value"),
        zoomIn: document.getElementById("zoom-in"),
        zoomOut: document.getElementById("zoom-out"),
        goHome: document.getElementById("go-home"),
        navNote: document.getElementById("nav-note"),
        statusLabel: document.getElementById("status-label"),
        statusCopy: document.getElementById("status-copy"),
        statusRight: document.getElementById("status-right")
    };

    function scaled(value, origin, zoom) {
        return origin + (value - origin) * zoom;
    }

    function fixed(value) {
        return (Math.round(value * 100) / 100).toFixed(2);
    }

    function buildPoints(zoom) {
        var markup = [];

        for (var i = 0; i < scanPoints.length; i += 1) {
            var point = scanPoints[i];
            var x = scaled(point[0], CX, zoom);
            var y = scaled(point[1], CY, zoom);
            markup.push(
                '<circle cx="' + fixed(x) + '" cy="' + fixed(y) + '" r="1.29" fill="#5BD9ED"/>'
            );
        }

        return markup.join("");
    }

    function buildFreeSpace(zoom) {
        var coords = [];

        for (var i = 0; i < FREE_SPACE.length; i += 1) {
            coords.push(
                fixed(scaled(FREE_SPACE[i][0], CX, zoom)) + "," +
                fixed(scaled(FREE_SPACE[i][1], CY, zoom))
            );
        }

        return '<polygon points="' + coords.join(" ") + '" fill="#5BD9ED" opacity="0.025"/>';
    }

    function buildRings(zoom) {
        var circles = [
            '<circle cx="' + CX + '" cy="' + CY + '" r="' + fixed(304 * zoom) +
                '" fill="none" stroke="#34444E" stroke-dasharray="3 7" opacity="0.6"/>'
        ];
        for (var i = 0; i < RING_DISTANCES.length; i += 1) {
            var ring = RING_DISTANCES[i];
            circles.push(
                '<circle cx="' + CX + '" cy="' + CY + '" r="' + fixed(ring.radius * zoom) +
                '" fill="none" stroke="#34444E"/>'
            );
        }

        return '<g>' + circles.join("") + "</g>";
    }

    function buildRingLabels(zoom) {
        var labels = [];

        for (var i = 0; i < RING_DISTANCES.length; i += 1) {
            var ring = RING_DISTANCES[i];
            labels.push(
                '<text class="radar-ring-label" x="' + (CX + 11) + '" y="' +
                fixed(CY - ring.radius * zoom + 15) + '">' + ring.label + "</text>"
            );
        }

        return '<g>' + labels.join("") + "</g>";
    }

    function buildCallout(zoom) {
        var hx = scaled(CLOSEST_POINT.x, CX, zoom);
        var hy = scaled(CLOSEST_POINT.y, CY, zoom);
        var elbowX = hx + 42;
        var elbowY = hy - 23;
        var endX = elbowX + 76;
        var labelX = hx + 58;
        var labelY = hy - 34;
        var line = [
            CX + "," + CY,
            fixed(hx) + "," + fixed(hy),
            fixed(elbowX) + "," + fixed(elbowY),
            fixed(endX) + "," + fixed(elbowY)
        ].join(" ");

        return [
            '<g id="closest-callout">',
            '<polyline points="' + line + '" fill="none" stroke="#5BD9ED" stroke-width="1" stroke-dasharray="4 4" stroke-dashoffset="1.5"/>',
            '<circle cx="' + fixed(hx) + '" cy="' + fixed(hy) + '" r="5.5" fill="none" stroke="#5BD9ED" stroke-width="1.5"/>',
            '<text class="radar-text--accent" x="' + fixed(labelX) + '" y="' + fixed(labelY) + '">' +
                closestText + " m</text>",
            "</g>"
        ].join("");
    }

    function buildScaleBar(zoom, ppm) {
        var barEnd = 26 + BASE_PPM * zoom;

        return [
            '<g id="radar-scale">',
            '<line x1="26" y1="581" x2="' + fixed(barEnd) + '" y2="581" stroke="#A8B4BD" stroke-width="1"/>',
            '<line x1="26" y1="577" x2="26" y2="586" stroke="#A8B4BD" stroke-width="1"/>',
            '<line x1="' + fixed(barEnd) + '" y1="577" x2="' + fixed(barEnd) + '" y2="586" stroke="#A8B4BD" stroke-width="1"/>',
            '<text x="26" y="606">1 meter</text>',
            '<text x="918" y="606">' + ppm + " px / m</text>",
            "</g>"
        ].join("");
    }
    function renderRadar() {
        var zoom = ZOOM_LEVELS[zoomIndex];
        var ppm = Math.round(BASE_PPM * zoom);
        var markup = [
            '<defs>',
            '<pattern id="radar-grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">',
            '<path d="M40 0H0V40" fill="none" stroke="#202B32" stroke-width="0.6"/>',
            '</pattern>',
            '<clipPath id="robot-clip"><circle cx="512" cy="320" r="20.2"/></clipPath>',
            '<linearGradient id="radar-sweep" x1="512" y1="320" x2="512" y2="74" gradientUnits="userSpaceOnUse">',
            '<stop stop-color="#5BD9ED" stop-opacity="0"/>',
            '<stop offset="1" stop-color="#5BD9ED" stop-opacity="0.0705882"/>',
            '</linearGradient>',
            '</defs>',
            '<rect width="1024" height="640" fill="#11171B"/>',
            '<rect width="1024" height="640" fill="url(#radar-grid-pattern)"/>',
            buildFreeSpace(zoom),
            buildRings(zoom),
            '<g stroke="#34444E" stroke-dasharray="4 6" stroke-dashoffset="2">',
            '<line x1="512" y1="16" x2="512" y2="624"/>',
            '<line x1="32" y1="320" x2="992" y2="320"/>',
            '</g>',
            '<path d="M512 320L690 74C749.566 117.11 791.488 180.349 808 252L512 320Z" fill="url(#radar-sweep)"/>',
            '<g class="radar-points">' + buildPoints(zoom) + '</g>',
            buildRingLabels(zoom),
            buildCallout(zoom),
            '<g id="robot-marker">',
            '<circle cx="512" cy="320" r="20.5" fill="#183740" stroke="#5BD9ED" stroke-width="1"/>',
            '</g>',
            '<g clip-path="url(#robot-clip)" stroke="#34444E" stroke-dasharray="4 6" stroke-dashoffset="2" opacity="0.6">',
            '<line x1="512" y1="16" x2="512" y2="624" stroke-dashoffset="-2"/>',
            '<line x1="32" y1="320" x2="992" y2="320"/>',
            '</g>',
            '<text class="radar-text--muted" x="509" y="362" text-anchor="middle">ROBOT</text>',
            '<text x="24" y="32">SAMPLE / 001</text>',
            '<text x="24" y="53">LOCAL VIEW</text>',
            '<text class="radar-direction" x="515" y="33" text-anchor="middle">0° / FORWARD</text>',
            '<text class="radar-direction" x="978" y="340" text-anchor="end">90°</text>',
            '<text class="radar-direction" x="28" y="340">270°</text>',
            '<text class="radar-direction" x="511" y="612" text-anchor="middle">180°</text>',
            buildScaleBar(zoom, ppm)
        ].join("");

        elements.svg.innerHTML = markup;
        elements.pointCount.textContent = String(scanPoints.length || 720);
        elements.closestDistance.textContent = closestText;
        elements.scaleValue.textContent = String(ppm);
        elements.zoomIn.disabled = zoomIndex >= ZOOM_LEVELS.length - 1;
        elements.zoomOut.disabled = zoomIndex <= 0;
        elements.svg.setAttribute(
            "aria-label",
            "Illustrative LiDAR scan of a room with " + (scanPoints.length || 720) +
            " measurement points, the robot at the origin and the closest object " +
            closestText.replace(",", ".") + " metres away. Scale: " + ppm + " pixels per metre."
        );
    }

    function changeZoom(step) {
        var next = zoomIndex + step;

        if (next < 0 || next > ZOOM_LEVELS.length - 1 || next === zoomIndex) {
            return;
        }

        zoomIndex = next;
        renderRadar();
    }

    function setMode(isDemo) {
        elements.modeToggle.setAttribute("aria-checked", String(isDemo));
        elements.connectionBadge.classList.toggle("is-live", !isDemo);
        elements.statusLabel.classList.toggle("is-live", !isDemo);

        if (isDemo) {
            elements.modeLabel.textContent = "Design / Mock Mode";
            elements.connectionText.textContent = "Demo mode · No live connection";
            elements.statusLabel.textContent = "DEMO SESSION";
            elements.statusCopy.textContent = "The displayed environment is an illustration.";
            elements.statusRight.textContent = "ROS /scan · Live data stream disabled";
            elements.navNote.textContent = "In demo mode, commands cannot be sent. A live robot connection is required.";
        } else {
            elements.modeLabel.textContent = "Live Mode (offline)";
            elements.connectionText.textContent = "Live mode · No live connection";
            elements.statusLabel.textContent = "LIVE OFFLINE";
            elements.statusCopy.textContent = "No ROS bridge connection. The sample scan is still shown.";
            elements.statusRight.textContent = "ROS /scan · Bridge unreachable";
            elements.navNote.textContent = "No live robot connection. Commands remain disabled.";
        }

        elements.goHome.disabled = true;
        elements.goHome.title = "Requires a live robot connection.";
    }

    elements.modeToggle.addEventListener("click", function () {
        setMode(elements.modeToggle.getAttribute("aria-checked") !== "true");
    });

    elements.zoomIn.addEventListener("click", function () {
        changeZoom(1);
    });

    elements.zoomOut.addEventListener("click", function () {
        changeZoom(-1);
    });

    setMode(true);
    renderRadar();
})();
