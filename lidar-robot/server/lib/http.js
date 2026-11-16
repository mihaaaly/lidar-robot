"use strict";

/* ------------------------------------------------------------------
   Small HTTP helpers: JSON responses, the error envelope, security
   headers and a size-limited JSON body reader.
   ------------------------------------------------------------------ */

const SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "geolocation=(), camera=(), microphone=()"
};

const ERROR_MESSAGES = {
    validation_error: "Check the highlighted fields.",
    invalid_json: "The request body is not valid JSON.",
    bad_request: "The request could not be processed.",
    invalid_credentials: "Invalid email or password.",
    registration_disabled: "Registration is disabled on this robot.",
    forbidden_origin: "Request origin is not allowed.",
    not_found: "Not found.",
    method_not_allowed: "Method not allowed.",
    email_taken: "An account with this email already exists.",
    payload_too_large: "Request body is too large.",
    unsupported_media_type: "Content-Type must be application/json.",
    rate_limited: "Too many attempts. Try again later.",
    internal_error: "Internal server error.",
    unavailable: "Service unavailable."
};

function setSecurityHeaders(res) {
    Object.keys(SECURITY_HEADERS).forEach(function (name) {
        res.setHeader(name, SECURITY_HEADERS[name]);
    });
}

function isHead(res) {
    return !!(res.req && res.req.method === "HEAD");
}

function sendJson(res, status, payload, options) {
    const opts = options || {};
    const body = Buffer.from(JSON.stringify(payload), "utf8");

    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Length", String(body.length));

    if (opts.headers) {
        Object.keys(opts.headers).forEach(function (name) {
            res.setHeader(name, opts.headers[name]);
        });
    }

    if (isHead(res)) {
        res.end();
        return;
    }

    res.end(body);
}

function sendError(res, status, code, options) {
    const opts = options || {};
    const error = {
        code: code,
        message: opts.message || ERROR_MESSAGES[code] || ERROR_MESSAGES.internal_error
    };

    if (opts.fields && Object.keys(opts.fields).length > 0) {
        error.fields = opts.fields;
    }

    if (opts.requestId) {
        error.requestId = opts.requestId;
    }

    sendJson(res, status, { error: error }, { headers: opts.headers });
}

function sendNoContent(res, options) {
    const opts = options || {};

    res.statusCode = 204;
    res.setHeader("Cache-Control", "no-store");

    if (opts.headers) {
        Object.keys(opts.headers).forEach(function (name) {
            res.setHeader(name, opts.headers[name]);
        });
    }

    res.end();
}

/* Reads a JSON request body with a hard size limit.

   Resolves to { value } on success or { error: "payload_too_large" |
   "invalid_json" | "bad_request" }. The connection is not parsed past
   the limit; the caller answers 413 and should close the connection. */
function readJsonBody(req, limit, options) {
    const opts = options || {};

    return new Promise(function (resolve) {
        const declared = Number(req.headers["content-length"]);
        let settled = false;
        let size = 0;
        const chunks = [];

        function finish(result) {
            if (settled) {
                return;
            }

            settled = true;
            resolve(result);
        }

        if (Number.isFinite(declared) && declared > limit) {
            req.resume();
            finish({ error: "payload_too_large" });
            return;
        }

        req.on("data", function (chunk) {
            if (settled) {
                return;
            }

            size += chunk.length;

            if (size > limit) {
                chunks.length = 0;
                finish({ error: "payload_too_large" });
                return;
            }

            chunks.push(chunk);
        });

        req.on("end", function () {
            const text = Buffer.concat(chunks).toString("utf8");
            let value;

            if (!text.trim()) {
                if (opts.allowEmpty) {
                    finish({ value: {} });
                    return;
                }

                finish({ error: "invalid_json" });
                return;
            }

            try {
                value = JSON.parse(text);
            } catch (error) {
                finish({ error: "invalid_json" });
                return;
            }

            if (!value || typeof value !== "object" || Array.isArray(value)) {
                finish({ error: "bad_request" });
                return;
            }

            finish({ value: value });
        });

        req.on("error", function () {
            finish({ error: "bad_request" });
        });
    });
}

function clientIp(req, config) {
    const options = config || {};

    if (options.trustProxy && req.headers["x-forwarded-for"]) {
        const first = String(req.headers["x-forwarded-for"]).split(",")[0].trim();

        if (first) {
            return first;
        }
    }

    const address = (req.socket && req.socket.remoteAddress) || "";

    return address.replace(/^::ffff:/, "");
}

module.exports = {
    ERROR_MESSAGES,
    SECURITY_HEADERS,
    clientIp,
    isHead,
    readJsonBody,
    sendError,
    sendJson,
    sendNoContent,
    setSecurityHeaders
};
