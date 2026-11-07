"use strict";

/* ------------------------------------------------------------------
   Request router and middleware, kept as a factory so the integration
   tests can start an app on an ephemeral port with a temp database.
   ------------------------------------------------------------------ */

const http = require("./lib/http");
const { createLogger, newRequestId } = require("./lib/log");

const BACKEND_COOKIE_MAX_AGE = 24 * 60 * 60;

function backendCookie(config) {
    return "lidar_backend=1; Path=/; SameSite=Lax; Max-Age=" + BACKEND_COOKIE_MAX_AGE +
        (config.cookieSecure ? "; Secure" : "");
}

function createApp(config, options) {
    const opts = options || {};
    const logger = opts.logger || createLogger(config.logLevel);
    const checkDatabase = opts.checkDatabase || function () { return true; };

    function allowedMethods(res, methods) {
        res.setHeader("Allow", methods.join(", "));
    }

    function health(req, res, ctx) {
        let databaseOk = true;

        try {
            checkDatabase();
        } catch (error) {
            databaseOk = false;
            logger.error("health_database_error", {
                requestId: ctx.requestId,
                message: error && error.message
            });
        }

        if (!databaseOk) {
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

    async function handle(req, res) {
        const startedAt = Date.now();
        const requestId = newRequestId();
        const ctx = { requestId: requestId, code: null, userId: null };

        http.setSecurityHeaders(res);
        res.setHeader("X-Request-Id", requestId);
        res.setHeader("Set-Cookie", backendCookie(config));

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
                ctx.code = "bad_request";
                http.sendError(res, 400, "bad_request", { requestId: requestId });
                return;
            }

            let url;

            try {
                url = new URL(req.url, "http://" + req.headers.host);
            } catch (error) {
                ctx.code = "bad_request";
                http.sendError(res, 400, "bad_request", { requestId: requestId });
                return;
            }

            if (url.pathname === "/api/auth/health") {
                if (req.method !== "GET" && req.method !== "HEAD") {
                    ctx.code = "method_not_allowed";
                    allowedMethods(res, ["GET", "HEAD"]);
                    http.sendError(res, 405, "method_not_allowed", { requestId: requestId });
                    return;
                }

                health(req, res, ctx);
                return;
            }

            ctx.code = "not_found";
            http.sendError(res, 404, "not_found", { requestId: requestId });
        } catch (error) {
            ctx.code = "internal_error";
            logger.error("unhandled_request_error", {
                requestId: requestId,
                message: error && error.message,
                stack: error && error.stack
            });

            if (!res.headersSent) {
                http.sendError(res, 500, "internal_error", { requestId: requestId });
            } else {
                res.end();
            }
        }
    }

    return {
        config: config,
        logger: logger,
        handle: handle
    };
}

module.exports = {
    createApp
};
