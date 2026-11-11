/* ------------------------------------------------------------------
   LiDAR Autonomous Robot · selected-map storage

   Single reader/writer for the `lidar.map` key shared by the map
   selection screen (index.html) and the sensor workspace.

   DOM-free on purpose: it can be unit tested by loading this file into a
   bare `vm` context with a fake storage object. Every failure mode
   (blocked storage, corrupt JSON, unknown map) resolves to `null` /
   `false` instead of throwing, so the screens keep working.
   ------------------------------------------------------------------ */
/* global window */
(function (window) {
    "use strict";

    var KEY = "lidar.map";

    function read(storage) {
        var raw;
        var data;

        try {
            raw = storage.getItem(KEY);
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

        if (!data || typeof data !== "object" || typeof data.id !== "string" || !data.id) {
            return null;
        }

        return data;
    }

    function resolve(storage, maps) {
        var data = read(storage);
        var list = maps || [];
        var i;

        if (!data) {
            return null;
        }

        for (i = 0; i < list.length; i += 1) {
            if (list[i] && list[i].id === data.id) {
                return list[i];
            }
        }

        return null;
    }

    function save(storage, map) {
        try {
            storage.setItem(KEY, JSON.stringify({
                id: map.id,
                name: map.name,
                at: Date.now()
            }));
        } catch (error) {
            return false;
        }

        return true;
    }

    window.MapStorage = {
        KEY: KEY,
        read: read,
        resolve: resolve,
        save: save
    };
})(window);
