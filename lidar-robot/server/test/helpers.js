"use strict";

/* ------------------------------------------------------------------
   Test helpers: temp databases, an app on an ephemeral port, a tiny
   cookie jar and a fetch wrapper.
   ------------------------------------------------------------------ */

const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const { createApp } = require("../app");
const { loadConfig } = require("../lib/config");
const { createLogger } = require("../lib/log");

const WEB_ROOT = path.resolve(__dirname, "..", "..", "web", "public");
const TEST_LOGGER = createLogger("silent");

function makeConfig(envOverrides) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lidar-auth-test-"));
    const env = Object.assign(
        {
            AUTH_HOST: "127.0.0.1",
            AUTH_PORT: "8787",
            AUTH_DB_PATH: path.join(dir, "auth.db"),
            WEB_ROOT: WEB_ROOT,
            LOG_LEVEL: "silent",
            SCRYPT_N: "1024",
            ALLOW_REGISTRATION: "1",
            COOKIE_SECURE: "0",
            TRUST_PROXY: "0",
            PUBLIC_ORIGIN: ""
        },
        envOverrides || {}
    );

    return loadConfig(env).config;
}

async function startApp(config) {
    const app = createApp(config, { logger: TEST_LOGGER });
    const server = http.createServer(app.handle);

    await new Promise(function (resolve, reject) {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();
    const base = "http://127.0.0.1:" + address.port;

    return {
        app: app,
        config: config,
        server: server,
        base: base,
        jar: createJar(),
        async stop() {
            await new Promise(function (resolve) {
                server.close(resolve);
            });
            app.close();
        }
    };
}

async function setup(envOverrides) {
    return startApp(makeConfig(envOverrides));
}

function createJar() {
    const store = new Map();

    return {
        store: store,
        header() {
            return Array.from(store.entries())
                .map(function (entry) {
                    return entry[0] + "=" + entry[1];
                })
                .join("; ");
        },
        update(setCookies) {
            (setCookies || []).forEach(function (cookie) {
                const pair = cookie.split(";")[0];
                const index = pair.indexOf("=");

                if (index < 0) {
                    return;
                }

                const name = pair.slice(0, index).trim();
                const value = pair.slice(index + 1).trim();
                const maxAge = /Max-Age=(-?\d+)/i.exec(cookie);

                if (maxAge && Number(maxAge[1]) <= 0) {
                    store.delete(name);
                    return;
                }

                store.set(name, value);
            });
        },
        get(name) {
            return store.get(name);
        },
        has(name) {
            return store.has(name);
        },
        clear() {
            store.clear();
        }
    };
}

async function request(base, pathname, options) {
    const opts = options || {};
    const headers = Object.assign({}, opts.headers || {});
    let body = opts.body;

    if (body !== undefined && typeof body !== "string" && !Buffer.isBuffer(body)) {
        body = JSON.stringify(body);
    }

    if (body !== undefined && !headers["Content-Type"] && !headers["content-type"]) {
        headers["Content-Type"] = "application/json";
    }

    if (opts.jar) {
        const cookie = opts.jar.header();

        if (cookie) {
            headers.Cookie = cookie;
        }
    }

    if (!opts.noOrigin && headers.Origin === undefined && headers.origin === undefined) {
        headers.Origin = base;
    }

    const method = opts.method || (body === undefined ? "GET" : "POST");
    const response = await fetch(base + pathname, {
        method: method,
        headers: headers,
        body: body,
        redirect: "manual"
    });
    const setCookies = typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [];
    const text = await response.text();

    if (opts.jar) {
        opts.jar.update(setCookies);
    }

    let json = null;

    if (text) {
        try {
            json = JSON.parse(text);
        } catch (error) {
            json = null;
        }
    }

    return {
        status: response.status,
        headers: response.headers,
        setCookies: setCookies,
        text: text,
        json: json
    };
}

function rawRequest(port, payload) {
    return new Promise(function (resolve, reject) {
        const socket = net.connect(port, "127.0.0.1");
        let data = "";

        socket.setTimeout(3000);
        socket.on("connect", function () {
            socket.write(payload);
        });
        socket.on("data", function (chunk) {
            data += chunk.toString("utf8");
        });
        socket.on("end", function () {
            resolve(data);
        });
        socket.on("timeout", function () {
            socket.destroy();
            resolve(data);
        });
        socket.on("error", reject);
    });
}

function registerBody(overrides) {
    return Object.assign(
        {
            name: "Alex Morgan",
            email: "alex.morgan@robotics.io",
            password: "correct-horse-9!",
            consent: true
        },
        overrides || {}
    );
}

module.exports = {
    WEB_ROOT,
    createJar,
    makeConfig,
    rawRequest,
    registerBody,
    request,
    setup,
    startApp
};
