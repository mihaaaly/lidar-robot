"use strict";

/* ------------------------------------------------------------------
   Cookie parsing and Set-Cookie serialization.

   The session cookie is HttpOnly; lidar_auth and lidar_backend are
   readable hints for the frontend. All cookies are host-only (no
   Domain attribute) and use Path=/ and SameSite=Lax.
   ------------------------------------------------------------------ */

const SESSION_COOKIE = "lidar_session";
const AUTH_COOKIE = "lidar_auth";
const BACKEND_COOKIE = "lidar_backend";
const BACKEND_COOKIE_MAX_AGE = 24 * 60 * 60;

function parseCookies(header) {
    const result = Object.create(null);

    if (!header) {
        return result;
    }

    String(header).split(";").forEach(function (part) {
        const index = part.indexOf("=");

        if (index < 0) {
            return;
        }

        const name = part.slice(0, index).trim();

        if (!name) {
            return;
        }

        let value = part.slice(index + 1).trim();

        if (value.length >= 2 && value[0] === "\"" && value[value.length - 1] === "\"") {
            value = value.slice(1, -1);
        }

        try {
            value = decodeURIComponent(value);
        } catch (error) {
            /* keep the raw value */
        }

        /* The first occurrence wins: browsers send the more specific
           (longer Path) cookie first and attackers can only append. */
        if (!(name in result)) {
            result[name] = value;
        }
    });

    return result;
}

function serializeCookie(name, value, options) {
    const opts = options || {};
    const parts = [name + "=" + String(value)];

    if (opts.maxAge !== undefined && opts.maxAge !== null) {
        parts.push("Max-Age=" + Math.floor(opts.maxAge));
    }

    parts.push("Path=" + (opts.path || "/"));

    if (opts.httpOnly) {
        parts.push("HttpOnly");
    }

    if (opts.secure) {
        parts.push("Secure");
    }

    parts.push("SameSite=" + (opts.sameSite || "Lax"));

    return parts.join("; ");
}

function appendSetCookie(res, cookie) {
    const existing = res.getHeader("Set-Cookie");

    if (!existing) {
        res.setHeader("Set-Cookie", [cookie]);
        return;
    }

    if (Array.isArray(existing)) {
        res.setHeader("Set-Cookie", existing.concat(cookie));
        return;
    }

    res.setHeader("Set-Cookie", [existing, cookie]);
}

function sessionCookie(config, token, maxAgeSeconds) {
    return serializeCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: !!config.cookieSecure,
        sameSite: "Lax",
        path: "/",
        maxAge: maxAgeSeconds === undefined ? null : maxAgeSeconds
    });
}

function authHintCookie(config, maxAgeSeconds) {
    return serializeCookie(AUTH_COOKIE, "1", {
        httpOnly: false,
        secure: !!config.cookieSecure,
        sameSite: "Lax",
        path: "/",
        maxAge: maxAgeSeconds === undefined ? null : maxAgeSeconds
    });
}

function backendCookie(config) {
    return serializeCookie(BACKEND_COOKIE, "1", {
        httpOnly: false,
        secure: !!config.cookieSecure,
        sameSite: "Lax",
        path: "/",
        maxAge: BACKEND_COOKIE_MAX_AGE
    });
}

function clearCookie(config, name, httpOnly) {
    return serializeCookie(name, "", {
        httpOnly: !!httpOnly,
        secure: !!config.cookieSecure,
        sameSite: "Lax",
        path: "/",
        maxAge: 0
    });
}

function clearSessionCookies(config) {
    return [
        clearCookie(config, SESSION_COOKIE, true),
        clearCookie(config, AUTH_COOKIE, false)
    ];
}

module.exports = {
    AUTH_COOKIE,
    BACKEND_COOKIE,
    BACKEND_COOKIE_MAX_AGE,
    SESSION_COOKIE,
    appendSetCookie,
    authHintCookie,
    backendCookie,
    clearCookie,
    clearSessionCookies,
    parseCookies,
    serializeCookie,
    sessionCookie
};
