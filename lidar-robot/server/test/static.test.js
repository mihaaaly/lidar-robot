"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createStaticHandler, mimeType, normalizePathname } = require("../lib/static");
const { makeConfig } = require("./helpers");

const SESSION = {
    userId: 1,
    expiresAt: Date.now() + 60 * 60 * 1000,
    remember: true,
    user: { email: "alex@example.com", name: "Alex Morgan" }
};

function findSession(token) {
    return token === "good" ? SESSION : null;
}

function createFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lidar-static-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "lidar-static-outside-"));

    fs.mkdirSync(path.join(root, "src"));
    fs.mkdirSync(path.join(root, "assets"));
    fs.mkdirSync(path.join(root, "js"));
    fs.mkdirSync(path.join(root, "mock"));
    fs.writeFileSync(path.join(root, "index.html"), "<!doctype html><title>Map Selection</title>");
    fs.writeFileSync(path.join(root, "workspace.html"), "<!doctype html><title>Sensor Workspace</title>");
    fs.writeFileSync(path.join(root, "auth.html"), "<!doctype html><title>Sign in</title>");
    fs.writeFileSync(path.join(root, "src", "app.js"), "console.log('app');\n");
    fs.writeFileSync(path.join(root, "src", "app.xyz"), "unknown extension\n");
    fs.writeFileSync(path.join(root, "src", ".hidden.js"), "dotfile\n");
    fs.writeFileSync(path.join(root, "assets", "icon.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");
    fs.writeFileSync(path.join(root, "js", "roslib.min.js"), "roslib\n");
    fs.writeFileSync(path.join(root, "mock", "data.json"), "{}\n");
    fs.writeFileSync(path.join(outside, "secret.txt"), "secret\n");
    fs.symlinkSync(path.join(outside, "secret.txt"), path.join(root, "src", "evil.js"));

    const config = makeConfig({ WEB_ROOT: root });
    const handler = createStaticHandler(config, { findSession: findSession });

    return {
        root: root,
        outside: outside,
        handler: handler,
        cleanup() {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(outside, { recursive: true, force: true });
        }
    };
}

function fakeRequest(options) {
    const opts = options || {};
    const headers = {};

    if (opts.cookie) {
        headers.cookie = opts.cookie;
    }

    return {
        method: opts.method || "GET",
        url: opts.pathname || "/",
        headers: headers
    };
}

function fakeResponse(req) {
    const headers = Object.create(null);

    return {
        req: req,
        statusCode: 200,
        body: null,
        headers: headers,
        setHeader(name, value) {
            headers[name.toLowerCase()] = value;
        },
        getHeader(name) {
            return headers[name.toLowerCase()];
        },
        end(body) {
            this.body = body === undefined ? null : body;
        }
    };
}

async function call(fixture, options) {
    const req = fakeRequest(options);
    const res = fakeResponse(req);

    await fixture.handler(req, res, { requestId: "test-request" }, req.url);

    return res;
}

function setCookieList(res) {
    const value = res.getHeader("set-cookie");

    if (!value) {
        return [];
    }

    return Array.isArray(value) ? value : [value];
}

function withFixture(t) {
    const fixture = createFixture();

    t.after(function () {
        fixture.cleanup();
    });

    return fixture;
}

test("the protected root redirects to the login page without a session", async function (t) {
    const fixture = withFixture(t);
    const res = await call(fixture, { pathname: "/" });

    assert.equal(res.statusCode, 302);
    assert.equal(res.getHeader("location"), "/auth.html#/auth");
    assert.equal(res.getHeader("cache-control"), "no-store");
});

test("the protected pages are served with a valid session and refresh the hint", async function (t) {
    const fixture = withFixture(t);
    const res = await call(fixture, {
        pathname: "/workspace.html",
        cookie: "lidar_session=good"
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.getHeader("content-type"), "text/html; charset=utf-8");
    assert.equal(res.getHeader("cache-control"), "no-store");
    assert.match(String(res.body), /Sensor Workspace/);

    const setCookies = setCookieList(res);

    assert.ok(setCookies.some(function (cookie) { return /^lidar_session=good; .*HttpOnly/.test(cookie); }));
    assert.ok(setCookies.some(function (cookie) { return cookie.startsWith("lidar_auth=1; Max-Age="); }));
});

test("a stale session cookie is cleared on the protected redirect", async function (t) {
    const fixture = withFixture(t);
    const res = await call(fixture, {
        pathname: "/",
        cookie: "lidar_session=stale"
    });

    assert.equal(res.statusCode, 302);
    assert.ok(setCookieList(res).some(function (cookie) {
        return /^lidar_session=; Max-Age=0/.test(cookie);
    }));
});

test("/auth.html is public without a session", async function (t) {
    const fixture = withFixture(t);
    const res = await call(fixture, { pathname: "/auth.html" });

    assert.equal(res.statusCode, 200);
    assert.match(String(res.body), /Sign in/);
    assert.equal(res.getHeader("cache-control"), "no-store");
});

test("/auth.html redirects with a session and the hint cookie", async function (t) {
    const fixture = withFixture(t);
    const res = await call(fixture, {
        pathname: "/auth.html",
        cookie: "lidar_session=good; lidar_auth=1"
    });

    assert.equal(res.statusCode, 302);
    assert.equal(res.getHeader("location"), "/");
});

test("/auth.html does not redirect with a session but no hint (loop protection)", async function (t) {
    const fixture = withFixture(t);
    const res = await call(fixture, {
        pathname: "/auth.html",
        cookie: "lidar_session=good"
    });

    assert.equal(res.statusCode, 200);
    assert.match(String(res.body), /Sign in/);
    assert.ok(setCookieList(res).some(function (cookie) {
        return cookie.startsWith("lidar_auth=1; Max-Age=");
    }));
});

test("public assets get their MIME type and revalidate cache headers", async function (t) {
    const fixture = withFixture(t);
    const js = await call(fixture, { pathname: "/src/app.js" });
    const svg = await call(fixture, { pathname: "/assets/icon.svg" });
    const json = await call(fixture, { pathname: "/mock/data.json" });
    const unknown = await call(fixture, { pathname: "/src/app.xyz" });

    assert.equal(js.statusCode, 200);
    assert.equal(js.getHeader("content-type"), "text/javascript; charset=utf-8");
    assert.equal(js.getHeader("cache-control"), "no-cache");
    assert.match(String(js.body), /console\.log/);

    assert.equal(svg.getHeader("content-type"), "image/svg+xml");
    assert.equal(json.getHeader("content-type"), "application/json; charset=utf-8");
    assert.equal(unknown.getHeader("content-type"), "application/octet-stream");
});

test("HEAD returns the headers without a body", async function (t) {
    const fixture = withFixture(t);
    const res = await call(fixture, { pathname: "/src/app.js", method: "HEAD" });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body, null);
    assert.equal(Number(res.getHeader("content-length")), fs.statSync(path.join(fixture.root, "src", "app.js")).size);
});

test("path traversal is normalized before routing and cannot bypass the gate", async function (t) {
    const fixture = withFixture(t);
    const plain = await call(fixture, { pathname: "/src/../index.html" });
    const encoded = await call(fixture, { pathname: "/src/%2e%2e/index.html" });
    const deep = await call(fixture, { pathname: "/src/%2e%2e/%2e%2e/etc/passwd" });

    assert.equal(plain.statusCode, 302);
    assert.equal(plain.getHeader("location"), "/auth.html#/auth");
    assert.equal(encoded.statusCode, 302);
    assert.equal(deep.statusCode, 404);
});

test("dotfiles, directories and unknown paths are 404", async function (t) {
    const fixture = withFixture(t);
    const dotfile = await call(fixture, { pathname: "/src/.hidden.js" });
    const directory = await call(fixture, { pathname: "/src/" });
    const unknown = await call(fixture, { pathname: "/nope" });

    assert.equal(dotfile.statusCode, 404);
    assert.equal(directory.statusCode, 404);
    assert.equal(unknown.statusCode, 404);
});

test("a symlink escape is refused with 403", async function (t) {
    const fixture = withFixture(t);
    const res = await call(fixture, { pathname: "/src/evil.js" });

    assert.equal(res.statusCode, 403);
    assert.doesNotMatch(String(res.body), /secret/);
});

test("malformed percent encoding and NUL bytes are rejected", async function (t) {
    const fixture = withFixture(t);
    const badEncoding = await call(fixture, { pathname: "/src/%ZZ.js" });
    const nul = await call(fixture, { pathname: "/src/%00.js" });

    assert.equal(badEncoding.statusCode, 400);
    assert.equal(nul.statusCode, 400);
});

test("non-GET methods on static paths answer 405 with Allow", async function (t) {
    const fixture = withFixture(t);
    const res = await call(fixture, { pathname: "/src/app.js", method: "POST" });

    assert.equal(res.statusCode, 405);
    assert.equal(res.getHeader("allow"), "GET, HEAD");
});

test("favicon answers 204", async function (t) {
    const fixture = withFixture(t);
    const res = await call(fixture, { pathname: "/favicon.ico" });

    assert.equal(res.statusCode, 204);
    assert.equal(res.body, null);
});

test("normalizePathname and mimeType are deterministic", function () {
    assert.deepEqual(normalizePathname("/src/app.js"), { path: "/src/app.js" });
    assert.deepEqual(normalizePathname("/src/../index.html"), { path: "/index.html" });
    assert.equal(normalizePathname("/src/%ZZ").error, 400);
    assert.equal(normalizePathname("/a/%00").error, 400);
    assert.equal(mimeType("a.js"), "text/javascript; charset=utf-8");
    assert.equal(mimeType("a.bin"), "application/octet-stream");
});
