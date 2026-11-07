"use strict";

/* ------------------------------------------------------------------
   Request router and middleware, kept as a factory so the integration
   tests can start an app on an ephemeral port with a temp database.
   ------------------------------------------------------------------ */

const cookies = require("./lib/cookies");
const { openDatabase } = require("./lib/db");
const http = require("./lib/http");
const { createLogger, newRequestId } = require("./lib/log");
const passwords = require("./lib/passwords");
const rateLimit = require("./lib/ratelimit");
const security = require("./lib/security");
const sessions = require("./lib/sessions");
const users = require("./lib/users");
const validate = require("./lib/validate");

const SESSION_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const API_PREFIX = "/api/";

function rememberTtlSeconds(config) {
    return Math.max(1, Math.floor(config.sessionRememberMs / 1000));
}

function createApp(config, options) {
    const opts = options || {};
    const logger = opts.logger || createLogger(config.logLevel);
    const db = opts.db || openDatabase(config.dbPath);
    const ownsDb = !opts.db;

    const loginIpLimiter = rateLimit.createRateLimiter({
        limit: config.loginIpLimit,
        windowMs: config.loginWindowMs
    });
    const loginEmailLimiter = rateLimit.createRateLimiter({
        limit: config.loginEmailLimit,
        windowMs: config.loginWindowMs
    });
    const registerIpLimiter = rateLimit.createRateLimiter({
        limit: config.registerIpLimit,
        windowMs: config.registerWindowMs
    });

    const timers = [];

    sessions.cleanupExpiredSessions(db);

    timers.push(sessions.startCleanupTimer(db, SESSION_CLEANUP_INTERVAL_MS, function (error) {
        logger.error("session_cleanup_error", { message: error && error.message });
    }));

    const rateLimitTimer = setInterval(function () {
        loginIpLimiter.cleanup();
        loginEmailLimiter.cleanup();
        registerIpLimiter.cleanup();
    }, RATE_LIMIT_CLEANUP_INTERVAL_MS);

    rateLimitTimer.unref();
    timers.push(rateLimitTimer);

    function fail(res, ctx, status, code, extra) {
        ctx.code = code;
        http.sendError(
            res,
            status,
            code,
            Object.assign({ requestId: ctx.requestId }, extra || {})
        );
    }

    function rateLimited(res, ctx, retryAfter) {
        ctx.code = "rate_limited";
        http.sendError(res, 429, "rate_limited", {
            requestId: ctx.requestId,
            headers: { "Retry-After": String(Math.max(1, Math.ceil(retryAfter))) }
        });
    }

    function allow(res, methods) {
        res.setHeader("Allow", methods.join(", "));
    }

    function methodAllowed(req, res, methods) {
        if (methods.indexOf(req.method) !== -1) {
            return true;
        }

        allow(res, methods);
        return false;
    }

    function precheckPost(req, res, ctx) {
        if (!security.isJsonContentType(req)) {
            fail(res, ctx, 415, "unsupported_media_type");
            return false;
        }

        if (!security.checkOrigin(req, config).ok) {
            fail(res, ctx, 403, "forbidden_origin");
            return false;
        }

        return true;
    }

    async function readBody(req, res, ctx, allowEmpty) {
        const result = await http.readJsonBody(req, config.bodyLimitBytes, {
            allowEmpty: !!allowEmpty
        });

        if (!result.error) {
            return { ok: true, value: result.value };
        }

        if (result.error === "payload_too_large") {
            fail(res, ctx, 413, "payload_too_large", { headers: { Connection: "close" } });
            res.once("finish", function () {
                if (!req.complete) {
                    req.destroy();
                }
            });
            return { ok: false };
        }

        const code = result.error === "bad_request" ? "bad_request" : "invalid_json";

        fail(res, ctx, 400, code);
        return { ok: false };
    }

    /* ------------------------------------------------------------ Health */

    function handleHealth(req, res, ctx) {
        try {
            db.prepare("SELECT 1").get();
        } catch (error) {
            logger.error("health_database_error", {
                requestId: ctx.requestId,
                message: error && error.message
            });
            ctx.code = "unavailable";
            http.sendJson(res, 503, { service: "lidar-auth", status: "error" });
            return;
        }

        http.sendJson(res, 200, {
            service: "lidar-auth",
            status: "ok",
            version: config.serviceVersion,
            time: Date.now()
        });
    }

    /* ---------------------------------------------------------- Register */

    async function handleRegister(req, res, ctx) {
        const ip = http.clientIp(req, config);
        const limit = registerIpLimiter.hit(ip);

        if (!limit.allowed) {
            rateLimited(res, ctx, limit.retryAfter);
            return;
        }

        if (!config.allowRegistration) {
            fail(res, ctx, 403, "registration_disabled");
            return;
        }

        if (!precheckPost(req, res, ctx)) {
            return;
        }

        const body = await readBody(req, res, ctx);

        if (!body.ok) {
            return;
        }

        const validation = validate.validateRegistration(body.value);

        if (Object.keys(validation.fields).length > 0) {
            fail(res, ctx, 400, "validation_error", { fields: validation.fields });
            return;
        }

        const passwordHash = await passwords.hashPassword(validation.values.password, {
            N: config.scryptN
        });
        const created = users.createUser(db, {
            email: validation.values.email,
            name: validation.values.name,
            passwordHash: passwordHash
        });

        if (!created) {
            fail(res, ctx, 409, "email_taken");
            return;
        }

        const session = sessions.createSession(db, {
            userId: created.id,
            remember: true,
            ip: ip,
            userAgent: req.headers["user-agent"] || null,
            rememberMs: config.sessionRememberMs,
            sessionMs: config.sessionMs
        });
        const ttl = rememberTtlSeconds(config);

        cookies.appendSetCookie(res, cookies.sessionCookie(config, session.token, ttl));
        cookies.appendSetCookie(res, cookies.authHintCookie(config, ttl));
        ctx.userId = created.id;

        http.sendJson(res, 201, {
            user: users.toPublicUser(created),
            expiresAt: session.expiresAt
        });
    }

    /* ------------------------------------------------------------- Login */

    async function handleLogin(req, res, ctx) {
        const ip = http.clientIp(req, config);
        const ipLimit = loginIpLimiter.hit(ip);

        if (!ipLimit.allowed) {
            rateLimited(res, ctx, ipLimit.retryAfter);
            return;
        }

        if (!precheckPost(req, res, ctx)) {
            return;
        }

        const body = await readBody(req, res, ctx);

        if (!body.ok) {
            return;
        }

        const validation = validate.validateLogin(body.value);
        const emailLimit = loginEmailLimiter.hit(validation.values.email || "");

        if (!emailLimit.allowed) {
            rateLimited(res, ctx, emailLimit.retryAfter);
            return;
        }

        if (Object.keys(validation.fields).length > 0) {
            fail(res, ctx, 400, "validation_error", { fields: validation.fields });
            return;
        }

        const user = users.findByEmail(db, validation.values.email);
        let valid = false;

        if (user) {
            valid = await passwords.verifyPassword(validation.values.password, user.password_hash);
        } else {
            await passwords.verifyDummy(validation.values.password, { N: config.scryptN });
        }

        if (!valid) {
            fail(res, ctx, 401, "invalid_credentials");
            return;
        }

        loginEmailLimiter.reset(validation.values.email);

        const oldToken = cookies.parseCookies(req.headers.cookie)[cookies.SESSION_COOKIE];

        if (oldToken) {
            sessions.deleteSessionByToken(db, oldToken);
        }

        const session = sessions.createSession(db, {
            userId: user.id,
            remember: validation.values.remember,
            ip: ip,
            userAgent: req.headers["user-agent"] || null,
            rememberMs: config.sessionRememberMs,
            sessionMs: config.sessionMs
        });
        const ttl = validation.values.remember ? rememberTtlSeconds(config) : undefined;

        cookies.appendSetCookie(res, cookies.sessionCookie(config, session.token, ttl));
        cookies.appendSetCookie(res, cookies.authHintCookie(config, ttl));
        ctx.userId = Number(user.id);

        http.sendJson(res, 200, {
            user: {
                email: user.email,
                name: user.name
            },
            expiresAt: session.expiresAt
        });
    }

    /* ----------------------------------------------------------- Session */

    function handleSession(req, res, ctx) {
        const token = cookies.parseCookies(req.headers.cookie)[cookies.SESSION_COOKIE];
        const session = sessions.findSession(db, token);

        if (!session) {
            if (token) {
                cookies.clearSessionCookies(config).forEach(function (cookie) {
                    cookies.appendSetCookie(res, cookie);
                });
            }

            http.sendJson(res, 200, { authenticated: false });
            return;
        }

        const remaining = Math.max(1, Math.ceil((session.expiresAt - Date.now()) / 1000));
        const ttl = session.remember ? remaining : undefined;

        cookies.appendSetCookie(res, cookies.sessionCookie(config, token, ttl));
        cookies.appendSetCookie(res, cookies.authHintCookie(config, ttl));
        ctx.userId = session.userId;

        http.sendJson(res, 200, {
            authenticated: true,
            user: session.user,
            expiresAt: session.expiresAt
        });
    }

    /* ------------------------------------------------------------ Logout */

    async function handleLogout(req, res, ctx) {
        if (!precheckPost(req, res, ctx)) {
            return;
        }

        const body = await readBody(req, res, ctx, true);

        if (!body.ok) {
            return;
        }

        const token = cookies.parseCookies(req.headers.cookie)[cookies.SESSION_COOKIE];

        if (token) {
            sessions.deleteSessionByToken(db, token);
        }

        cookies.clearSessionCookies(config).forEach(function (cookie) {
            cookies.appendSetCookie(res, cookie);
        });

        http.sendJson(res, 200, { ok: true });
    }

    const routes = {
        "/api/auth/health": {
            methods: ["GET", "HEAD"],
            handler: handleHealth
        },
        "/api/auth/register": {
            methods: ["POST"],
            handler: handleRegister
        },
        "/api/auth/login": {
            methods: ["POST"],
            handler: handleLogin
        },
        "/api/auth/session": {
            methods: ["GET", "HEAD"],
            handler: handleSession
        },
        "/api/auth/logout": {
            methods: ["POST"],
            handler: handleLogout
        }
    };

    async function handle(req, res) {
        const startedAt = Date.now();
        const requestId = newRequestId();
        const ctx = { requestId: requestId, code: null, userId: null };

        http.setSecurityHeaders(res);
        res.setHeader("X-Request-Id", requestId);
        cookies.appendSetCookie(res, cookies.backendCookie(config));

        res.on("finish", function () {
            const pathname = String(req.url || "").split("?")[0];

            logger.info("request", {
                method: req.method,
                path: pathname,
                status: res.statusCode,
                ms: Date.now() - startedAt,
                ip: http.clientIp(req, config),
                userId: ctx.userId,
                requestId: requestId,
                code: ctx.code || undefined
            });
        });

        try {
            if (!req.headers.host) {
                fail(res, ctx, 400, "bad_request");
                return;
            }

            let url;

            try {
                url = new URL(req.url, "http://" + req.headers.host);
            } catch (error) {
                fail(res, ctx, 400, "bad_request");
                return;
            }

            const pathname = url.pathname;
            const route = routes[pathname];

            if (route) {
                if (!methodAllowed(req, res, route.methods)) {
                    fail(res, ctx, 405, "method_not_allowed");
                    return;
                }

                await route.handler(req, res, ctx);
                return;
            }

            if (pathname.startsWith(API_PREFIX)) {
                fail(res, ctx, 404, "not_found");
                return;
            }

            fail(res, ctx, 404, "not_found");
        } catch (error) {
            logger.error("unhandled_request_error", {
                requestId: requestId,
                message: error && error.message,
                stack: error && error.stack
            });

            if (!res.headersSent) {
                fail(res, ctx, 500, "internal_error");
            } else {
                res.end();
            }
        }
    }

    function close() {
        timers.forEach(function (timer) {
            clearInterval(timer);
        });

        if (ownsDb) {
            try {
                db.close();
            } catch (error) {
                /* already closed by a test or shutdown path */
            }
        }
    }

    return {
        config: config,
        logger: logger,
        db: db,
        rateLimiters: {
            loginIp: loginIpLimiter,
            loginEmail: loginEmailLimiter,
            registerIp: registerIpLimiter
        },
        handle: handle,
        close: close
    };
}

module.exports = {
    createApp
};
