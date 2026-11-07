"use strict";

/* ------------------------------------------------------------------
   Static file hosting with the server-side page gate.

   Protected pages are only served with a valid session; /auth.html
   redirects to / only when the readable hint cookie is also present
   (redirect-loop protection). Path traversal, dotfiles and symlink
   escapes are rejected before any file is read.
   ------------------------------------------------------------------ */

const fsp = require("node:fs").promises;
const path = require("node:path");

const cookies = require("./cookies");

const PUBLIC_PREFIXES = ["/src/", "/assets/", "/js/", "/mock/"];
const PROTECTED_PATHS = { "/": true, "/index.html": true, "/workspace.html": true };
const AUTH_PATH = "/auth.html";
const FAVICON_PATH = "/favicon.ico";

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
    ".map": "application/json; charset=utf-8"
};

function mimeType(filePath) {
    return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function isHead(res) {
    return !!(res.req && res.req.method === "HEAD");
}

function sendText(res, status, message, cacheControl, extraHeaders) {
    const body = Buffer.from(message + "\n", "utf8");

    res.statusCode = status;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", cacheControl || "no-store");
    res.setHeader("Content-Length", String(body.length));

    if (extraHeaders) {
        Object.keys(extraHeaders).forEach(function (name) {
            res.setHeader(name, extraHeaders[name]);
        });
    }

    if (isHead(res)) {
        res.end();
        return;
    }

    res.end(body);
}

function redirect(res, location) {
    res.statusCode = 302;
    res.setHeader("Location", location);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Length", "0");
    res.end();
}

function routeKind(pathname) {
    if (PROTECTED_PATHS[pathname]) {
        return "protected";
    }

    if (pathname === AUTH_PATH) {
        return "auth";
    }

    if (pathname === FAVICON_PATH) {
        return "favicon";
    }

    for (let i = 0; i < PUBLIC_PREFIXES.length; i += 1) {
        if (pathname.startsWith(PUBLIC_PREFIXES[i])) {
            return "public";
        }
    }

    return "unknown";
}

/* Returns the decoded, normalized path or an error status. The routing
   decision is made on the normalized path so /src/../index.html cannot
   bypass the gate. */
function normalizePathname(pathname) {
    if (/%00/i.test(pathname)) {
        return { error: 400 };
    }

    let decoded;

    try {
        decoded = decodeURIComponent(pathname);
    } catch (error) {
        return { error: 400 };
    }

    if (decoded.indexOf("\0") !== -1) {
        return { error: 400 };
    }

    const normalized = path.posix.normalize("/" + decoded);

    if (normalized.split("/").indexOf("..") !== -1) {
        return { error: 400 };
    }

    return { path: normalized };
}

async function safeFile(webRoot, pathname) {
    const segments = pathname.split("/").filter(Boolean);

    if (segments.some(function (segment) { return segment.startsWith("."); })) {
        return { error: 404 };
    }

    const resolved = path.resolve(webRoot, "." + pathname);
    const prefix = webRoot.endsWith(path.sep) ? webRoot : webRoot + path.sep;

    if (resolved !== webRoot && !resolved.startsWith(prefix)) {
        return { error: 403 };
    }

    let realRoot;

    try {
        realRoot = await fsp.realpath(webRoot);
    } catch (error) {
        return { error: 404 };
    }

    let realFile;

    try {
        realFile = await fsp.realpath(resolved);
    } catch (error) {
        return { error: 404 };
    }

    const realPrefix = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;

    if (realFile !== realRoot && !realFile.startsWith(realPrefix)) {
        return { error: 403 };
    }

    let stat;

    try {
        stat = await fsp.stat(realFile);
    } catch (error) {
        return { error: 404 };
    }

    if (!stat.isFile()) {
        return { error: 404 };
    }

    return { file: realFile, size: stat.size };
}

function createStaticHandler(config, deps) {
    const findSession = deps.findSession;

    function refreshSessionCookies(res, session, token) {
        const remaining = Math.max(1, Math.ceil((session.expiresAt - Date.now()) / 1000));
        const ttl = session.remember ? remaining : undefined;

        cookies.appendSetCookie(res, cookies.sessionCookie(config, token, ttl));
        cookies.appendSetCookie(res, cookies.authHintCookie(config, ttl));
    }

    function clearSessionCookies(res) {
        cookies.clearSessionCookies(config).forEach(function (cookie) {
            cookies.appendSetCookie(res, cookie);
        });
    }

    async function serveFile(req, res, pathname) {
        const safe = await safeFile(config.webRoot, pathname);

        if (safe.error) {
            sendText(res, safe.error, safe.error === 403 ? "Forbidden" : "Not found");
            return;
        }

        let body;

        try {
            body = await fsp.readFile(safe.file);
        } catch (error) {
            sendText(res, 404, "Not found");
            return;
        }

        const contentType = mimeType(safe.file);
        const cacheControl = contentType.startsWith("text/html") ? "no-store" : "no-cache";

        res.statusCode = 200;
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", cacheControl);
        res.setHeader("Content-Length", String(body.length));

        if (isHead(res)) {
            res.end();
            return;
        }

        res.end(body);
    }

    async function handleStatic(req, res, ctx, rawPathname) {
        if (req.method !== "GET" && req.method !== "HEAD") {
            sendText(res, 405, "Method not allowed", "no-store", { Allow: "GET, HEAD" });
            return;
        }

        const normalized = normalizePathname(rawPathname);

        if (normalized.error) {
            sendText(res, normalized.error, normalized.error === 400 ? "Bad request" : "Not found");
            return;
        }

        const pathname = normalized.path;
        const kind = routeKind(pathname);

        if (kind === "favicon") {
            res.statusCode = 204;
            res.setHeader("Cache-Control", "no-store");
            res.end();
            return;
        }

        if (kind === "unknown") {
            sendText(res, 404, "Not found");
            return;
        }

        const parsedCookies = cookies.parseCookies(req.headers.cookie);
        const token = parsedCookies[cookies.SESSION_COOKIE];
        const session = findSession(token);

        if (kind === "protected") {
            if (!session) {
                if (token) {
                    clearSessionCookies(res);
                }

                redirect(res, "/auth.html#/auth");
                return;
            }

            refreshSessionCookies(res, session, token);
            await serveFile(req, res, pathname === "/" ? "/index.html" : pathname);
            return;
        }

        if (kind === "auth") {
            if (session) {
                refreshSessionCookies(res, session, token);

                /* Redirect only with the readable hint; otherwise a blocked
                   cookie would bounce forever between / and /auth.html. */
                if (parsedCookies[cookies.AUTH_COOKIE] === "1") {
                    redirect(res, "/");
                    return;
                }
            }

            await serveFile(req, res, pathname);
            return;
        }

        await serveFile(req, res, pathname);
    }

    return handleStatic;
}

module.exports = {
    MIME_TYPES,
    createStaticHandler,
    mimeType,
    normalizePathname,
    routeKind
};
