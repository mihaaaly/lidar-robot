"use strict";

/* ------------------------------------------------------------------
   JSON-lines logger for systemd/journald.

   Never log passwords, tokens, cookie values, request bodies or
   password hashes; the request logger in app.js only receives metadata.
   ------------------------------------------------------------------ */

const crypto = require("node:crypto");

const LEVELS = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
    silent: 100
};

function newRequestId() {
    return crypto.randomBytes(8).toString("hex");
}

function createLogger(level, sink) {
    const threshold = LEVELS[level] === undefined ? LEVELS.info : LEVELS[level];
    const output = sink || process.stdout;

    function emit(name, event, fields) {
        if (LEVELS[name] < threshold) {
            return;
        }

        const record = Object.assign(
            {
                ts: Date.now(),
                level: name,
                event: event
            },
            fields || {}
        );

        let line;

        try {
            line = JSON.stringify(record);
        } catch (error) {
            line = JSON.stringify({ ts: Date.now(), level: "error", event: "log_serialize_failed" });
        }

        try {
            output.write(line + "\n");
        } catch (error) {
            /* a broken stdout must not crash the service */
        }
    }

    return {
        debug: function (event, fields) { emit("debug", event, fields); },
        info: function (event, fields) { emit("info", event, fields); },
        warn: function (event, fields) { emit("warn", event, fields); },
        error: function (event, fields) { emit("error", event, fields); }
    };
}

module.exports = {
    LEVELS,
    createLogger,
    newRequestId
};
