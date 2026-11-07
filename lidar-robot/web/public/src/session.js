/* ------------------------------------------------------------------
   LiDAR Autonomous Robot · demo session helpers

   ⚠️  DEMO ONLY. This is a client-side UX gate, NOT a security control.
   Anyone can read/forge localStorage, skip the guard, or disable JS.
   Real protection needs a server-side session (Nginx auth_request +
   Node-RED or a dedicated auth service), HttpOnly cookies and TLS.

   Storage schema (kept in sync with the inline guard in index.html —
   if the key or the shape changes, update BOTH places):
     lidar.session  -> { v: 1, email, name, createdAt, expiresAt, remember }
     lidar.demoMode -> "1" | "0"
   ------------------------------------------------------------------ */
/* global window */
(function (window) {
    "use strict";

    var SESSION_KEY = "lidar.session";
    var DEMO_KEY = "lidar.demoMode";
    var HINT_COOKIE = "lidar_auth";
    var BACKEND_COOKIE = "lidar_backend";
    var HEALTH_URL = "/api/auth/health";
    var DAY_MS = 24 * 60 * 60 * 1000;
    var REMEMBER_MS = 7 * DAY_MS;
    var SESSION_MS = 1 * DAY_MS;
    var backendPromise = null;

    function store(kind) {
        try {
            return window[kind];
        } catch (error) {
            return null;
        }
    }

    function readStore(kind) {
        var storage = store(kind);
        var raw;
        var session;

        if (!storage) {
            return null;
        }

        try {
            raw = storage.getItem(SESSION_KEY);
        } catch (error) {
            return null;
        }

        if (!raw) {
            return null;
        }

        try {
            session = JSON.parse(raw);
        } catch (error) {
            removeKey(storage);
            return null;
        }

        if (!session || typeof session.email !== "string") {
            removeKey(storage);
            return null;
        }

        if (session.expiresAt && session.expiresAt <= Date.now()) {
            removeKey(storage);
            return null;
        }

        return session;
    }

    function removeKey(storage) {
        try {
            storage.removeItem(SESSION_KEY);
        } catch (error) {
            /* storage unavailable — nothing else to do */
        }
    }

    function getSession() {
        var local = readStore("localStorage");
        var temporary = readStore("sessionStorage");

        if (local && temporary) {
            return (temporary.expiresAt || 0) > (local.expiresAt || 0) ? temporary : local;
        }

        return local || temporary || null;
    }

    function setSession(data, remember) {
        var targetKind = remember ? "localStorage" : "sessionStorage";
        var otherKind = remember ? "sessionStorage" : "localStorage";
        var target = store(targetKind);
        var other = store(otherKind);
        var now = Date.now();
        var session;

        if (!target) {
            return false;
        }

        session = {
            v: 1,
            email: String(data.email || ""),
            name: String(data.name || ""),
            createdAt: now,
            expiresAt: now + (remember ? REMEMBER_MS : SESSION_MS),
            remember: !!remember
        };

        try {
            target.setItem(SESSION_KEY, JSON.stringify(session));
        } catch (error) {
            return false;
        }

        if (other) {
            removeKey(other);
        }

        return true;
    }

    function clearSession() {
        var local = store("localStorage");
        var temporary = store("sessionStorage");

        if (local) {
            removeKey(local);
        }

        if (temporary) {
            removeKey(temporary);
        }
    }

    function isAuthenticated() {
        return !!getSession();
    }

    function cookieValue(name) {
        var pairs;
        var i;
        var index;

        try {
            pairs = String(window.document.cookie || "").split(";");
        } catch (error) {
            return null;
        }

        for (i = 0; i < pairs.length; i += 1) {
            index = pairs[i].indexOf("=");

            if (index < 0) {
                continue;
            }

            if (pairs[i].slice(0, index).trim() === name) {
                try {
                    return decodeURIComponent(pairs[i].slice(index + 1).trim());
                } catch (error) {
                    return pairs[i].slice(index + 1).trim();
                }
            }
        }

        return null;
    }

    /* The backend sets this readable cookie on every HTML response. It never
       contains a secret; it only tells the demo JS that a real auth API exists. */
    function hasBackend() {
        return cookieValue(BACKEND_COOKIE) === "1";
    }

    /* Readable companion of the HttpOnly session cookie. The server clears it
       together with the session; it is used only to avoid redirect loops. */
    function hasServerHint() {
        return cookieValue(HINT_COOKIE) === "1";
    }

    function clearServerHint() {
        try {
            window.document.cookie = HINT_COOKIE + "=; Max-Age=0; Path=/; SameSite=Lax";
        } catch (error) {
            /* cookies unavailable — nothing to do */
        }
    }

    function detectBackend() {
        if (backendPromise) {
            return backendPromise;
        }

        /* Static demo (the Raspberry Pi deployment) has no backend marker;
           do not probe /api/auth/health there, so the console stays clean. */
        if (!hasBackend()) {
            backendPromise = Promise.resolve(false);
            return backendPromise;
        }

        if (typeof window.fetch !== "function") {
            backendPromise = Promise.resolve(false);
            return backendPromise;
        }

        backendPromise = window.fetch(HEALTH_URL, {
            method: "GET",
            credentials: "same-origin",
            headers: { Accept: "application/json" }
        }).then(function (response) {
            if (!response.ok) {
                backendPromise = null;
                return false;
            }

            return response.json().then(function (data) {
                if (!data || data.service !== "lidar-auth") {
                    backendPromise = null;
                    return false;
                }

                return true;
            }, function () {
                backendPromise = null;
                return false;
            });
        }, function () {
            backendPromise = null;
            return false;
        });

        return backendPromise;
    }

    function api(path, body, options) {
        var settings = options || {};
        var request = {
            method: settings.method || "POST",
            credentials: "same-origin",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            body: body === undefined ? undefined : JSON.stringify(body)
        };

        if (settings.keepalive) {
            request.keepalive = true;
        }

        if (typeof window.fetch !== "function") {
            return Promise.reject(new Error("fetch is not available"));
        }

        return window.fetch(path, request).then(function (response) {
            return response.text().then(function (text) {
                var data = null;

                if (text) {
                    try {
                        data = JSON.parse(text);
                    } catch (error) {
                        data = null;
                    }
                }

                return {
                    ok: response.ok,
                    status: response.status,
                    data: data,
                    retryAfter: response.headers.get("Retry-After")
                };
            });
        });
    }

    function logout() {
        if (!hasBackend()) {
            clearServerHint();
            return Promise.resolve(true);
        }

        return api("/api/auth/logout", {}, { keepalive: true }).then(function (result) {
            clearServerHint();
            return result.ok;
        }, function () {
            clearServerHint();
            return false;
        });
    }

    function requireAuth() {
        if (!getSession() && !hasServerHint()) {
            window.location.replace("auth.html#/auth");
            return false;
        }

        return true;
    }

    function getDemoMode() {
        var storage = store("localStorage");
        var raw;

        if (!storage) {
            return true;
        }

        try {
            raw = storage.getItem(DEMO_KEY);
        } catch (error) {
            return true;
        }

        return raw !== "0";
    }

    function setDemoMode(value) {
        var storage = store("localStorage");

        if (!storage) {
            return false;
        }

        try {
            storage.setItem(DEMO_KEY, value ? "1" : "0");
        } catch (error) {
            return false;
        }

        return true;
    }

    window.Session = {
        key: SESSION_KEY,
        demoKey: DEMO_KEY,
        hintCookie: HINT_COOKIE,
        backendCookie: BACKEND_COOKIE,
        getSession: getSession,
        setSession: setSession,
        clearSession: clearSession,
        isAuthenticated: isAuthenticated,
        hasBackend: hasBackend,
        hasServerHint: hasServerHint,
        clearServerHint: clearServerHint,
        detectBackend: detectBackend,
        api: api,
        logout: logout,
        requireAuth: requireAuth,
        getDemoMode: getDemoMode,
        setDemoMode: setDemoMode
    };
})(window);
