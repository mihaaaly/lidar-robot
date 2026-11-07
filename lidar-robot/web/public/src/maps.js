/* ------------------------------------------------------------------
   LiDAR Autonomous Robot · Map selection (main screen)

   Renders the demo map library from window.MAP_LIBRARY, keeps the
   selected-map panel in sync and stores the selection in localStorage.

   ⚠️  DEMO ONLY: there is no robot behind this screen. "Open in Sensor
   Workspace" only stores the choice and navigates to workspace.html.
   ------------------------------------------------------------------ */
/* global window, document, MAP_LIBRARY */
(function (window, document) {
    "use strict";

    var SVG_NS = "http://www.w3.org/2000/svg";
    var library = window.MAP_LIBRARY || { maps: [] };
    var maps = (library.maps || []).slice();
    var STORAGE_KEY = library.storageKey || "lidar.map";
    var HERO_LABEL_OFFSET = 9;
    var TOAST_MS = 4200;

    var state = {
        query: "",
        filter: "all",
        sort: "updated",
        view: "grid",
        selectedId: null
    };

    var toastTimer = null;

    var els = {
        grid: document.getElementById("map-grid"),
        empty: document.getElementById("map-empty"),
        clearSearch: document.getElementById("clear-search"),
        search: document.getElementById("map-search"),
        sort: document.getElementById("map-sort"),
        filterAll: document.getElementById("filter-all"),
        filterRecent: document.getElementById("filter-recent"),
        countAll: document.getElementById("count-all"),
        countRecent: document.getElementById("count-recent"),
        libraryCount: document.getElementById("library-count"),
        viewGrid: document.getElementById("view-grid"),
        viewList: document.getElementById("view-list"),
        importButton: document.getElementById("import-map"),
        fileInput: document.getElementById("map-file"),
        openWorkspace: document.getElementById("open-workspace"),
        contextSvg: document.getElementById("context-map-svg"),
        contextName: document.getElementById("context-name"),
        contextId: document.getElementById("context-id"),
        contextDescription: document.getElementById("context-description"),
        metaArea: document.getElementById("meta-area"),
        metaDimensions: document.getElementById("meta-dimensions"),
        metaResolution: document.getElementById("meta-resolution"),
        metaFrame: document.getElementById("meta-frame"),
        metaBase: document.getElementById("meta-base"),
        metaUpdated: document.getElementById("meta-updated"),
        fileName: document.getElementById("file-name"),
        fileFormat: document.getElementById("file-format"),
        modeToggle: document.getElementById("mode-toggle"),
        modeLabel: document.getElementById("mode-label"),
        connectionBadge: document.getElementById("connection-badge"),
        connectionText: document.getElementById("connection-text"),
        statusLabel: document.getElementById("status-label"),
        statusCopy: document.getElementById("status-copy"),
        statusRight: document.getElementById("status-right"),
        signOut: document.getElementById("sign-out"),
        toast: document.getElementById("toast")
    };

    /* ------------------------------------------------------------ helpers */

    function svgNode(name, attrs) {
        var node = document.createElementNS(SVG_NS, name);
        var key;

        for (key in attrs) {
            if (Object.prototype.hasOwnProperty.call(attrs, key)) {
                node.setAttribute(key, attrs[key]);
            }
        }

        return node;
    }

    function findMap(id) {
        var i;

        for (i = 0; i < maps.length; i += 1) {
            if (maps[i].id === id) {
                return maps[i];
            }
        }

        return null;
    }

    function pad2(value) {
        return value < 10 ? "0" + value : String(value);
    }

    function jitter(seed) {
        var value = Math.sin(seed * 12.9898) * 43758.5453;

        return (value - Math.floor(value) - 0.5) * 0.8;
    }

    function walkSegment(from, to, spacing, out) {
        var dx = to[0] - from[0];
        var dy = to[1] - from[1];
        var length = Math.sqrt(dx * dx + dy * dy);
        var steps = Math.max(1, Math.round(length / spacing));
        var i;
        var t;

        for (i = 0; i < steps; i += 1) {
            t = (i + 0.5) / steps;
            out.push([from[0] + dx * t, from[1] + dy * t]);
        }
    }

    /* LiDAR-like dots: sampled along the mapped boundary and, slightly
       offset outward, around every wall — the same "scan halo" the Figma
       previews draw. Dots are rendered under the walls, so overlapping
       points stay invisible. */
    function scanPoints(geo) {
        var points = [];
        var outline = geo.outline.points;
        var spacing = (geo.dots && geo.dots.spacing) || 4.2;
        var offset = 1.1;
        var edge = [];
        var centreX = 0;
        var centreY = 0;
        var i;

        outline.forEach(function (point) {
            centreX += point[0];
            centreY += point[1];
        });

        centreX /= outline.length;
        centreY /= outline.length;

        /* Boundary dots sit just inside the mapped area, like the Figma
           preview, so the 1.5px outline does not swallow them. */
        for (i = 0; i < outline.length; i += 1) {
            edge = [];
            walkSegment(outline[i], outline[(i + 1) % outline.length], spacing, edge);

            edge.forEach(function (point) {
                var dx = centreX - point[0];
                var dy = centreY - point[1];
                var length = Math.sqrt(dx * dx + dy * dy) || 1;
                var inset = Math.min(offset, length * 0.5);

                points.push([
                    point[0] + (dx / length) * inset,
                    point[1] + (dy / length) * inset
                ]);
            });
        }

        geo.walls.forEach(function (wall) {
            var x0 = wall[0];
            var y0 = wall[1];
            var x1 = wall[0] + wall[2];
            var y1 = wall[1] + wall[3];

            walkSegment([x0, y0 - offset], [x1, y0 - offset], spacing, points);
            walkSegment([x0, y1 + offset], [x1, y1 + offset], spacing, points);
            walkSegment([x0 - offset, y0], [x0 - offset, y1], spacing, points);
            walkSegment([x1 + offset, y0], [x1 + offset, y1], spacing, points);
        });

        return points.map(function (point, index) {
            return [point[0] + jitter(index + 1), point[1] + jitter(index + 41)];
        });
    }

    function outlinePath(points) {
        return "M " + points.map(function (point) {
            return point[0] + " " + point[1];
        }).join(" L ") + " Z";
    }

    function geometryBounds(geo) {
        var minX = Infinity;
        var minY = Infinity;
        var maxX = -Infinity;
        var maxY = -Infinity;

        geo.outline.points.forEach(function (point) {
            minX = Math.min(minX, point[0]);
            minY = Math.min(minY, point[1]);
            maxX = Math.max(maxX, point[0]);
            maxY = Math.max(maxY, point[1]);
        });

        return {
            width: maxX - minX,
            height: maxY - minY
        };
    }

    /* Card geometry fitted into the 520 × 260 hero box (maps without an
       explicit Figma hero drawing). */
    function fittedHero(map) {
        var geo = map.preview;
        var bounds = geometryBounds(geo);
        var boxX = 94;
        var boxY = 48;
        var boxW = 332;
        var boxH = 164;
        var scale = Math.min(boxW / bounds.width, boxH / bounds.height);
        var offsetX = boxX + (boxW - bounds.width * scale) / 2;
        var offsetY = boxY + (boxH - bounds.height * scale) / 2;

        return {
            width: 520,
            height: 260,
            outline: geo.outline,
            walls: geo.walls,
            base: geo.base,
            dots: geo.dots,
            labels: [],
            transform: "translate(" + offsetX + " " + offsetY + ") scale(" + scale + ")"
        };
    }

    function heroGeometry(map) {
        if (map.hero) {
            return {
                width: map.hero.width,
                height: map.hero.height,
                outline: map.hero.outline,
                walls: map.hero.walls,
                base: map.hero.base,
                dots: map.hero.dots,
                labels: map.hero.labels || [],
                transform: "translate(" + map.hero.outline.x + " " + map.hero.outline.y + ")"
            };
        }

        return fittedHero(map);
    }

    function cardGeometry(map) {
        return {
            width: map.preview.width,
            height: map.preview.height,
            outline: map.preview.outline,
            walls: map.preview.walls,
            base: map.preview.base,
            dots: map.preview.dots,
            labels: [],
            transform: "translate(" + map.preview.outline.x + " " + map.preview.outline.y + ")"
        };
    }

    /* --------------------------------------------------------- map artwork */

    function renderGeometry(svg, geo) {
        var radius = (geo.dots && geo.dots.radius) || 0.75;
        var group = svgNode("g", { transform: geo.transform });
        var outline = svgNode("path", {
            d: outlinePath(geo.outline.points),
            "class": "map-outline"
        });
        var dotGroup = svgNode("g", {});
        var baseX = geo.base[0];
        var baseY = geo.base[1];

        while (svg.firstChild) {
            svg.removeChild(svg.firstChild);
        }

        svg.setAttribute("viewBox", "0 0 " + geo.width + " " + geo.height);

        group.appendChild(outline);

        scanPoints(geo).forEach(function (point) {
            dotGroup.appendChild(svgNode("circle", {
                cx: point[0].toFixed(2),
                cy: point[1].toFixed(2),
                r: radius,
                "class": "map-dot"
            }));
        });

        group.appendChild(dotGroup);

        geo.walls.forEach(function (wall) {
            group.appendChild(svgNode("rect", {
                x: wall[0],
                y: wall[1],
                width: wall[2],
                height: wall[3],
                "class": wall[4] === 1 ? "map-area" : "map-wall"
            }));
        });

        /* The Figma frame places the 6px base point below the 28px range
           circle, so the ring covers it — keep that layer order. */
        group.appendChild(svgNode("circle", {
            cx: baseX,
            cy: baseY,
            r: 3,
            "class": "map-base-dot"
        }));

        group.appendChild(svgNode("circle", {
            cx: baseX,
            cy: baseY,
            r: 14,
            "class": "map-base-range"
        }));

        (geo.labels || []).forEach(function (label) {
            var text = svgNode("text", {
                x: label.x,
                y: label.y + HERO_LABEL_OFFSET,
                "class": label.tone === "accent" ? "map-label map-label--accent" : "map-label"
            });

            text.textContent = label.text;
            group.appendChild(text);
        });

        svg.appendChild(group);
    }

    /* ------------------------------------------------------------ the grid */

    function visibleMaps() {
        var query = state.query.trim().toLowerCase();
        var list = maps.filter(function (map) {
            var matchesFilter = state.filter !== "recent" || map.recent;
            var haystack = (map.name + " " + map.id).toLowerCase();

            return matchesFilter && (!query || haystack.indexOf(query) !== -1);
        });

        list.sort(function (a, b) {
            if (state.sort === "name") {
                return a.name.localeCompare(b.name);
            }

            if (state.sort === "area") {
                return b.areaValue - a.areaValue;
            }

            return a.order - b.order;
        });

        return list;
    }

    function buildCard(map) {
        var card = document.createElement("article");
        var preview = document.createElement("div");
        var svg = document.createElementNS(SVG_NS, "svg");
        var idChip = document.createElement("span");
        var mark = document.createElement("span");
        var check = document.createElement("img");
        var info = document.createElement("div");
        var nameRow = document.createElement("div");
        var name = document.createElement("h3");
        var cardState = document.createElement("span");
        var props = document.createElement("p");
        var area = document.createElement("span");
        var separator = document.createElement("span");
        var resolution = document.createElement("span");
        var updated = document.createElement("p");

        card.className = "map-card";
        card.setAttribute("role", "option");
        card.setAttribute("data-map-id", map.id);
        card.setAttribute("aria-selected", "false");
        card.tabIndex = -1;

        preview.className = "map-preview";
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", "Occupancy map preview of " + map.name);
        renderGeometry(svg, cardGeometry(map));
        preview.appendChild(svg);

        idChip.className = "map-id mono";
        idChip.textContent = map.id;
        preview.appendChild(idChip);

        mark.className = "map-select-mark";
        mark.setAttribute("aria-hidden", "true");
        check.src = "assets/icons/check.svg";
        check.alt = "";
        check.width = 14;
        check.height = 14;
        mark.appendChild(check);
        preview.appendChild(mark);

        info.className = "map-info";
        nameRow.className = "map-name-row";
        name.textContent = map.name;
        cardState.className = "map-state mono";
        cardState.textContent = "SAMPLE MAP";
        nameRow.appendChild(name);
        nameRow.appendChild(cardState);

        props.className = "map-props mono";
        area.className = "map-area";
        area.textContent = map.area;
        separator.className = "map-sep";
        separator.setAttribute("aria-hidden", "true");
        resolution.textContent = map.resolution;
        props.appendChild(area);
        props.appendChild(separator);
        props.appendChild(resolution);

        updated.className = "map-updated";
        updated.textContent = map.updated;

        info.appendChild(nameRow);
        info.appendChild(props);
        info.appendChild(updated);

        card.appendChild(preview);
        card.appendChild(info);

        return card;
    }

    function markSelection() {
        var cards = els.grid.querySelectorAll(".map-card");

        Array.prototype.forEach.call(cards, function (card) {
            var selected = card.getAttribute("data-map-id") === state.selectedId;
            var cardState = card.querySelector(".map-state");

            card.classList.toggle("is-selected", selected);
            card.setAttribute("aria-selected", selected ? "true" : "false");
            card.tabIndex = selected ? 0 : -1;

            if (cardState) {
                cardState.textContent = selected ? "SELECTED" : "SAMPLE MAP";
            }
        });
    }

    function renderGrid() {
        var list = visibleMaps();
        var fragment = document.createDocumentFragment();

        while (els.grid.firstChild) {
            els.grid.removeChild(els.grid.firstChild);
        }

        if (!list.length) {
            els.grid.hidden = true;
            els.empty.hidden = false;
            return;
        }

        els.grid.hidden = false;
        els.empty.hidden = true;

        list.forEach(function (map) {
            fragment.appendChild(buildCard(map));
        });

        els.grid.appendChild(fragment);
        els.grid.classList.toggle("is-list", state.view === "list");
        markSelection();
    }

    /* ------------------------------------------------------ selected panel */

    function updateContext(map) {
        els.contextName.textContent = map.name;
        els.contextId.textContent = map.id;
        els.contextDescription.textContent = map.description;
        els.metaArea.textContent = map.area;
        els.metaDimensions.textContent = map.dimensions;
        els.metaResolution.textContent = map.resolution;
        els.metaFrame.textContent = map.frame;
        els.metaBase.textContent = map.baseCoordinates;
        els.metaUpdated.textContent = map.updatedShort;
        els.fileName.textContent = map.file.name;
        els.fileFormat.textContent = map.file.format;

        els.contextSvg.setAttribute("aria-label", "Occupancy map preview of " + map.name);
        renderGeometry(els.contextSvg, heroGeometry(map));
    }

    function persistSelection(map) {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
                id: map.id,
                name: map.name,
                at: Date.now()
            }));
        } catch (error) {
            /* Storage can be blocked; the screen keeps working without it. */
        }
    }

    function restoreSelection() {
        var raw;
        var data;

        try {
            raw = window.localStorage.getItem(STORAGE_KEY);
        } catch (error) {
            return null;
        }

        if (!raw) {
            return null;
        }

        try {
            data = JSON.parse(raw);
        } catch (error) {
            return null;
        }

        return data && data.id && findMap(data.id) ? data.id : null;
    }

    function selectMap(id, options) {
        var map = findMap(id);

        if (!map || state.selectedId === id) {
            if (map && options && options.focus) {
                focusCard(id);
            }
            return;
        }

        state.selectedId = id;
        updateContext(map);
        persistSelection(map);
        markSelection();

        if (options && options.focus) {
            focusCard(id);
        }
    }

    function focusCard(id) {
        var card = els.grid.querySelector('.map-card[data-map-id="' + id + '"]');

        if (card) {
            card.focus();
        }
    }

    /* ---------------------------------------------------------- interaction */

    function onGridClick(event) {
        var card = event.target.closest(".map-card");

        if (card) {
            selectMap(card.getAttribute("data-map-id"));
        }
    }

    function onGridKeydown(event) {
        var card = event.target.closest(".map-card");
        var cards;
        var index;
        var next;

        if (!card) {
            return;
        }

        if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
            event.preventDefault();
            selectMap(card.getAttribute("data-map-id"), { focus: true });
            return;
        }

        if (event.key === "Home" || event.key === "End" ||
                event.key === "ArrowRight" || event.key === "ArrowLeft" ||
                event.key === "ArrowDown" || event.key === "ArrowUp") {
            cards = Array.prototype.slice.call(els.grid.querySelectorAll(".map-card"));

            if (!cards.length) {
                return;
            }

            index = cards.indexOf(card);

            if (event.key === "Home") {
                next = 0;
            } else if (event.key === "End") {
                next = cards.length - 1;
            } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                next = (index + 1) % cards.length;
            } else {
                next = (index - 1 + cards.length) % cards.length;
            }

            event.preventDefault();
            selectMap(cards[next].getAttribute("data-map-id"), { focus: true });
        }
    }

    function setFilter(filter) {
        state.filter = filter;
        els.filterAll.classList.toggle("is-active", filter === "all");
        els.filterRecent.classList.toggle("is-active", filter === "recent");
        els.filterAll.setAttribute("aria-pressed", filter === "all" ? "true" : "false");
        els.filterRecent.setAttribute("aria-pressed", filter === "recent" ? "true" : "false");
        renderGrid();
    }

    function setView(view) {
        state.view = view;
        els.viewGrid.classList.toggle("is-active", view === "grid");
        els.viewList.classList.toggle("is-active", view === "list");
        els.viewGrid.setAttribute("aria-pressed", view === "grid" ? "true" : "false");
        els.viewList.setAttribute("aria-pressed", view === "list" ? "true" : "false");
        els.grid.classList.toggle("is-list", view === "list");
    }

    function showToast(message) {
        if (!els.toast) {
            return;
        }

        window.clearTimeout(toastTimer);
        els.toast.textContent = message;
        els.toast.hidden = false;
        toastTimer = window.setTimeout(function () {
            els.toast.hidden = true;
        }, TOAST_MS);
    }

    /* ------------------------------------------------------------- chrome */

    function setMode(isDemoMode) {
        els.modeToggle.setAttribute("aria-checked", String(isDemoMode));
        els.connectionBadge.classList.toggle("is-live", !isDemoMode);
        els.statusLabel.classList.toggle("is-live", !isDemoMode);

        if (isDemoMode) {
            els.modeLabel.textContent = "Design / Mock Mode";
            els.connectionText.textContent = "Demo mode · No live connection";
            els.statusLabel.textContent = "DEMO SESSION";
            els.statusCopy.textContent = "The displayed environment is an illustration.";
            els.statusRight.textContent = "ROS /scan · Live data stream disabled";
        } else {
            els.modeLabel.textContent = "Live Mode";
            els.connectionText.textContent = "Live mode · Connects in the workspace";
            els.statusLabel.textContent = "LIVE OFFLINE";
            els.statusCopy.textContent = "No robot connected. The map library stays illustrative.";
            els.statusRight.textContent = "ROS /scan · Waiting for the workspace";
        }
    }

    function signOut() {
        var finished = false;
        var failed = false;
        var timer = null;

        function finish() {
            if (finished || failed) {
                return;
            }

            finished = true;

            if (window.Session) {
                window.Session.clearSession();
                window.Session.clearServerHint();
            }

            window.location.replace("auth.html#/auth");
        }

        function fail() {
            if (finished || failed) {
                return;
            }

            failed = true;
            els.signOut.disabled = false;
            showToast("Could not sign out. Check the connection and try again.");
        }

        els.signOut.disabled = true;

        if (window.Session && typeof window.Session.logout === "function") {
            timer = window.setTimeout(fail, 5000);
            window.Session.logout().then(function (ok) {
                window.clearTimeout(timer);
                if (ok) {
                    finish();
                } else {
                    fail();
                }
            }, function () {
                window.clearTimeout(timer);
                fail();
            });
            return;
        }

        finish();
    }

    /* ---------------------------------------------------------------- init */

    function init() {
        var total = maps.length;
        var recent = maps.filter(function (map) {
            return map.recent;
        }).length;
        var saved = restoreSelection();

        state.selectedId = saved || (maps.length ? maps[0].id : null);

        els.libraryCount.textContent = pad2(total) + " MAPS";
        els.countAll.textContent = String(total);
        els.countRecent.textContent = String(recent);

        renderGrid();

        if (state.selectedId) {
            updateContext(findMap(state.selectedId));
        }

        els.grid.addEventListener("click", onGridClick);
        els.grid.addEventListener("keydown", onGridKeydown);

        els.search.addEventListener("input", function () {
            state.query = els.search.value;
            renderGrid();
        });

        els.clearSearch.addEventListener("click", function () {
            els.search.value = "";
            state.query = "";
            renderGrid();
            els.search.focus();
        });

        els.sort.addEventListener("change", function () {
            state.sort = els.sort.value;
            renderGrid();
        });

        els.filterAll.addEventListener("click", function () {
            setFilter("all");
        });

        els.filterRecent.addEventListener("click", function () {
            setFilter("recent");
        });

        els.viewGrid.addEventListener("click", function () {
            setView("grid");
        });

        els.viewList.addEventListener("click", function () {
            setView("list");
        });

        els.importButton.addEventListener("click", function () {
            els.fileInput.click();
        });

        els.fileInput.addEventListener("change", function () {
            var file = els.fileInput.files && els.fileInput.files[0];

            if (file) {
                showToast("Demo mode — \u201c" + file.name + "\u201d was not imported. The map library is read-only.");
            }

            els.fileInput.value = "";
        });

        els.openWorkspace.addEventListener("click", function () {
            var map = findMap(state.selectedId);

            if (map) {
                persistSelection(map);
            }
        });

        els.signOut.addEventListener("click", signOut);

        els.modeToggle.addEventListener("click", function () {
            var nextDemo = els.modeToggle.getAttribute("aria-checked") !== "true";

            setMode(nextDemo);

            if (window.Session) {
                window.Session.setDemoMode(nextDemo);
            }
        });

        if (window.Session) {
            setMode(window.Session.getDemoMode());
        }
    }

    init();
})(window, document);
