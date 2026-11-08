#!/usr/bin/env node
"use strict";

/* ------------------------------------------------------------------
   Entry point: validate configuration, open the database, listen.

   The process never stays half-running: a failed config check, database
   open or listen exits with a non-zero status and an understandable
   message on stderr.
   ------------------------------------------------------------------ */

const http = require("node:http");
const { createApp } = require("./app");
const { ConfigError, loadConfig } = require("./lib/config");
const { createLogger } = require("./lib/log");

/* The database and its -wal/-shm files contain password hashes. SQLite creates
   those side files with the process umask, so tighten it here as well as in the
   systemd unit (UMask=0077). */
process.umask(0o077);

const REQUEST_TIMEOUT_MS = 15000;
const HEADERS_TIMEOUT_MS = 10000;
const KEEP_ALIVE_TIMEOUT_MS = 5000;
const SHUTDOWN_TIMEOUT_MS = 5000;

function createAppSafely(config, logger) {
    try {
        return createApp(config, { logger: logger });
    } catch (error) {
        logger.error("database_open_error", {
            dbPath: config.dbPath,
            message: error && error.message,
            stack: error && error.stack
        });
        process.exit(1);
    }
}

function main() {
    let loaded;

    try {
        loaded = loadConfig(process.env);
    } catch (error) {
        if (error instanceof ConfigError) {
            process.stderr.write("lidar-auth: configuration error\n");
            error.messages.forEach(function (message) {
                process.stderr.write("  - " + message + "\n");
            });
            process.exit(1);
        }

        throw error;
    }

    const config = loaded.config;
    const logger = createLogger(config.logLevel);

    loaded.warnings.forEach(function (message) {
        logger.warn("config_warning", { message: message });
    });

    const app = createAppSafely(config, logger);
    const server = http.createServer(app.handle);

    server.maxHeadersCount = 100;
    server.requestTimeout = REQUEST_TIMEOUT_MS;
    server.headersTimeout = HEADERS_TIMEOUT_MS;
    server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;

    let shuttingDown = false;

    function shutdown(signal) {
        if (shuttingDown) {
            return;
        }

        shuttingDown = true;
        logger.info("shutdown", { signal: signal });

        const forced = setTimeout(function () {
            logger.error("shutdown_forced", { afterMs: SHUTDOWN_TIMEOUT_MS });
            process.exit(1);
        }, SHUTDOWN_TIMEOUT_MS);

        forced.unref();

        server.close(function () {
            logger.info("shutdown_complete", {});
            clearTimeout(forced);
            app.close();
            process.exit(0);
        });
    }

    process.on("SIGTERM", function () { shutdown("SIGTERM"); });
    process.on("SIGINT", function () { shutdown("SIGINT"); });

    process.on("uncaughtException", function (error) {
        logger.error("uncaught_exception", {
            message: error && error.message,
            stack: error && error.stack
        });
        process.exit(1);
    });

    process.on("unhandledRejection", function (error) {
        logger.error("unhandled_rejection", {
            message: error && error.message,
            stack: error && error.stack
        });
        process.exit(1);
    });

    server.on("error", function (error) {
        logger.error("listen_error", {
            message: error && error.message,
            host: config.host,
            port: config.port
        });
        app.close();
        process.exit(1);
    });

    server.listen(config.port, config.host, function () {
        logger.info("listening", {
            host: config.host,
            port: config.port,
            webRoot: config.webRoot,
            dbPath: config.dbPath
        });
    });
}

main();
