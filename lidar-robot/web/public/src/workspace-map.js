/* ------------------------------------------------------------------
   LiDAR Autonomous Robot · workspace map context

   Shows the map selected on the map selection screen in the workspace
   page-context bar. The selection is read through MapStorage — the same
   `lidar.map` key the map screen writes — and resolved against the demo
   library, so an unknown or removed map is an explicit empty state
   instead of a silent fallback to MAP-001.

   Every element lookup is guarded: missing markup must not throw.
   ------------------------------------------------------------------ */
/* global window, document */
(function (window, document) {
    "use strict";

    var EMPTY_NAME = "No map selected";
    var EMPTY_LINK = "Choose map";
    var SELECTED_LINK = "Change map";

    function byId(id) {
        return document.getElementById(id);
    }

    function storage() {
        try {
            return window.localStorage;
        } catch (error) {
            /* Blocked storage (private mode) reads as "no selection". */
            return null;
        }
    }

    function facts(map) {
        var parts = [];

        if (map.dimensions) {
            parts.push(map.dimensions);
        }

        if (map.baseCoordinates) {
            parts.push("base " + map.baseCoordinates);
        }

        return parts.join(" · ");
    }

    function render(selected) {
        var box = byId("workspace-map");
        var name = byId("workspace-map-name");
        var id = byId("workspace-map-id");
        var detail = byId("workspace-map-facts");
        var link = byId("workspace-map-link");

        if (!box || !name || !id || !detail || !link) {
            return;
        }

        box.setAttribute("data-state", selected ? "selected" : "empty");
        name.textContent = selected ? selected.name : EMPTY_NAME;
        id.textContent = selected ? selected.id : "";
        detail.textContent = selected ? facts(selected) : "";
        link.textContent = selected ? SELECTED_LINK : EMPTY_LINK;
    }

    function init() {
        var library = window.MAP_LIBRARY;
        var selected = null;

        if (window.MapStorage && library && library.maps) {
            selected = window.MapStorage.resolve(storage(), library.maps);
        }

        render(selected);
    }

    init();
})(window, document);
