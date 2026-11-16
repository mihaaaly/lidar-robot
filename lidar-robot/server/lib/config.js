"use strict";

/* ------------------------------------------------------------------
   Environment parsing and startup validation.

   Every value has a safe default; an invalid value stops the process
   with an understandable error instead of a half-running service.
   ------------------------------------------------------------------ */

const fs = require("node:fs");
const path = require("node:path");

const SERVER_DIR = path.resolve(__dirname, "..");
const MIN_NODE = [22, 16, 0];
const SERVICE_VERSION = "1.0.0";
const LOG_LEVELS = ["debug", "info", "warn", "error", "silent"];

class ConfigError extends Error {
    constructor(messages) {
        super(messages.join("\n"));
        this.name = "ConfigError";
        this.messages = messages;
    }
}

function envValue(env, key, fallback) {
    const value = env[key];

    if (value === undefined || value === null || value === "") {
        return fallback;
    }

    return String(value);
}

function parseIntValue(env, key, fallback, errors) {
    const raw = envValue(env, key, null);

    if (raw === null) {
        return fallback;
    }

    if (!/^\d+$/.test(raw)) {
        errors.push(`${key} must be a non-negative integer (got "${raw}").`);
        return fallback;
    }

    return Number.parseInt(raw, 10);
}

function parseFlag(env, key, fallback, errors) {
    const raw = envValue(env, key, null);

    if (raw === null) {
        return fallback;
    }

    if (raw === "0") {
        return 0;
    }

    if (raw === "1") {
        return 1;
    }

    errors.push(`${key} must be 0 or 1 (got "${raw}").`);
    return fallback;
}

function resolveFromServerDir(value) {
    return path.isAbsolute(value) ? path.normalize(value) : path.resolve(SERVER_DIR, value);
}

function nodeVersionParts() {
    return String(process.versions.node || "0.0.0")
        .split(".")
        .map(function (part) {
            return Number.parseInt(part, 10) || 0;
        });
}

function nodeVersionAtLeast(minimum) {
    const current = nodeVersionParts();

    for (let i = 0; i < minimum.length; i += 1) {
        if (current[i] > minimum[i]) {
            return true;
        }

        if (current[i] < minimum[i]) {
            return false;
        }
    }

    return true;
}

function parseOrigin(value) {
    let url;

    try {
        url = new URL(value);
    } catch (error) {
        return null;
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        return null;
    }

    if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
        return null;
    }

    return url.origin;
}

function loadConfig(env) {
    const source = env || process.env;
    const errors = [];
    const warnings = [];

    if (!nodeVersionAtLeast(MIN_NODE)) {
        errors.push(
            `Node.js >= ${MIN_NODE.join(".")} is required (running ${process.versions.node}). ` +
            "Install Node 22 LTS from NodeSource, then start the service again."
        );
    }

    const port = parseIntValue(source, "AUTH_PORT", 8787, errors);

    if (port < 1 || port > 65535) {
        errors.push(`AUTH_PORT must be between 1 and 65535 (got ${port}).`);
    }

    const host = envValue(source, "AUTH_HOST", "127.0.0.1");
    const dbPath = resolveFromServerDir(envValue(source, "AUTH_DB_PATH", "./data/auth.db"));
    const webRoot = resolveFromServerDir(envValue(source, "WEB_ROOT", "../web/public"));

    let webRootStat = null;

    try {
        webRootStat = fs.statSync(webRoot);
    } catch (error) {
        webRootStat = null;
    }

    if (!webRootStat || !webRootStat.isDirectory()) {
        errors.push(`WEB_ROOT does not exist or is not a directory: ${webRoot}`);
    }

    const rawOrigin = envValue(source, "PUBLIC_ORIGIN", "");
    const publicOrigin = rawOrigin ? parseOrigin(rawOrigin) : "";

    if (rawOrigin && !publicOrigin) {
        errors.push(
            `PUBLIC_ORIGIN must be a valid origin without path, query or hash (got "${rawOrigin}").`
        );
    }

    const trustProxy = parseFlag(source, "TRUST_PROXY", 0, errors);
    const cookieSecure = parseFlag(source, "COOKIE_SECURE", 0, errors);
    const allowRegistration = parseFlag(source, "ALLOW_REGISTRATION", 1, errors);

    if (cookieSecure === 1 && publicOrigin && publicOrigin.startsWith("http://")) {
        warnings.push(
            "COOKIE_SECURE=1 but PUBLIC_ORIGIN uses http://; browsers will drop the Secure cookies."
        );
    }

    if (trustProxy === 1 && host === "0.0.0.0") {
        warnings.push(
            "TRUST_PROXY=1 while AUTH_HOST=0.0.0.0: clients can spoof X-Forwarded-For and bypass the IP rate limit."
        );
    }

    const logLevel = envValue(source, "LOG_LEVEL", "info");

    if (LOG_LEVELS.indexOf(logLevel) === -1) {
        errors.push(`LOG_LEVEL must be one of ${LOG_LEVELS.join(", ")} (got "${logLevel}").`);
    }

    const nodeEnv = envValue(source, "NODE_ENV", "production");
    const scryptN = parseIntValue(source, "SCRYPT_N", 16384, errors);

    if (scryptN < 2 || (scryptN & (scryptN - 1)) !== 0) {
        errors.push(`SCRYPT_N must be a power of two greater than 1 (got ${scryptN}).`);
    }

    const bodyLimitBytes = parseIntValue(source, "BODY_LIMIT_BYTES", 16384, errors);

    if (bodyLimitBytes < 1) {
        errors.push(`BODY_LIMIT_BYTES must be a positive integer (got ${bodyLimitBytes}).`);
    }

    const config = {
        serverDir: SERVER_DIR,
        serviceVersion: SERVICE_VERSION,
        nodeEnv: nodeEnv,
        production: nodeEnv === "production",
        host: host,
        port: port,
        dbPath: dbPath,
        webRoot: webRoot,
        publicOrigin: publicOrigin,
        trustProxy: trustProxy === 1,
        cookieSecure: cookieSecure === 1,
        allowRegistration: allowRegistration === 1,
        sessionRememberMs: parseIntValue(source, "SESSION_REMEMBER_DAYS", 7, errors) * 24 * 60 * 60 * 1000,
        sessionMs: parseIntValue(source, "SESSION_HOURS", 24, errors) * 60 * 60 * 1000,
        loginIpLimit: parseIntValue(source, "LOGIN_IP_LIMIT", 20, errors),
        loginEmailLimit: parseIntValue(source, "LOGIN_EMAIL_LIMIT", 10, errors),
        loginWindowMs: parseIntValue(source, "LOGIN_WINDOW_MIN", 15, errors) * 60 * 1000,
        registerIpLimit: parseIntValue(source, "REGISTER_IP_LIMIT", 10, errors),
        registerWindowMs: parseIntValue(source, "REGISTER_WINDOW_MIN", 60, errors) * 60 * 1000,
        bodyLimitBytes: bodyLimitBytes,
        logLevel: logLevel,
        scryptN: scryptN
    };

    if (config.sessionRememberMs <= 0) {
        errors.push("SESSION_REMEMBER_DAYS must be at least 1.");
    }

    if (config.sessionMs <= 0) {
        errors.push("SESSION_HOURS must be at least 1.");
    }

    if (errors.length > 0) {
        throw new ConfigError(errors);
    }

    return { config: config, warnings: warnings };
}

module.exports = {
    ConfigError,
    LOG_LEVELS,
    MIN_NODE,
    SERVER_DIR,
    SERVICE_VERSION,
    loadConfig,
    parseOrigin
};
