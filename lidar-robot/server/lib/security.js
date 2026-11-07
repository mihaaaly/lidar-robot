"use strict";

/* ------------------------------------------------------------------
   CSRF / Origin / Content-Type checks for state-changing requests.

   The session cookie is SameSite=Lax, but a same-site POST from another
   port would still be sent, so every POST must be JSON and its Origin
   (when present) must match the expected origin exactly.
   ------------------------------------------------------------------ */

function contentType(req) {
    return String(req.headers["content-type"] || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
}

function isJsonContentType(req) {
    return contentType(req) === "application/json";
}

function expectedOrigin(req, config) {
    if (config.publicOrigin) {
        return config.publicOrigin;
    }

    return "http://" + String(req.headers.host || "");
}

function checkOrigin(req, config) {
    const fetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();

    if (fetchSite === "cross-site") {
        return { ok: false, reason: "sec_fetch_site" };
    }

    const origin = req.headers.origin;

    if (origin !== undefined && String(origin) !== expectedOrigin(req, config)) {
        return { ok: false, reason: "origin_mismatch" };
    }

    return { ok: true, reason: null };
}

module.exports = {
    checkOrigin,
    contentType,
    expectedOrigin,
    isJsonContentType
};
