"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { hashSessionToken } = require("../lib/sessions");
const {
    rawRequest,
    registerBody,
    request,
    setup
} = require("./helpers");

const DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * DAY_MS;

function findCookie(setCookies, name) {
    return (setCookies || []).find(function (cookie) {
        return cookie.startsWith(name + "=");
    }) || null;
}

async function start(t, env) {
    const ctx = await setup(env);

    t.after(function () {
        return ctx.stop();
    });

    return ctx;
}

test("health returns the service marker and security headers", async function (t) {
    const ctx = await start(t);
    const result = await request(ctx.base, "/api/auth/health");

    assert.equal(result.status, 200);
    assert.equal(result.json.service, "lidar-auth");
    assert.equal(result.json.status, "ok");
    assert.equal(result.json.version, "1.0.0");
    assert.equal(typeof result.json.time, "number");
    assert.match(result.headers.get("content-type"), /^application\/json; charset=utf-8$/);
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal(result.headers.get("x-content-type-options"), "nosniff");
    assert.equal(result.headers.get("x-frame-options"), "DENY");
    assert.equal(result.headers.get("referrer-policy"), "no-referrer");
    assert.match(result.headers.get("permissions-policy"), /geolocation=\(\)/);
    assert.equal(findCookie(result.setCookies, "lidar_backend"), "lidar_backend=1; Max-Age=86400; Path=/; SameSite=Lax");
});

test("health answers 503 when the database is unavailable", async function (t) {
    const ctx = await start(t);

    ctx.app.db.close();

    const result = await request(ctx.base, "/api/auth/health");

    assert.equal(result.status, 503);
    assert.deepEqual(result.json, { service: "lidar-auth", status: "error" });
});

test("register creates the user, the session and the cookies", async function (t) {
    const ctx = await start(t);
    const result = await request(ctx.base, "/api/auth/register", {
        body: registerBody({ email: "  Alex.Morgan@Robotics.IO  ", name: "  Alex Morgan  " }),
        jar: ctx.jar
    });

    assert.equal(result.status, 201);
    assert.deepEqual(result.json.user, {
        email: "alex.morgan@robotics.io",
        name: "Alex Morgan"
    });
    assert.equal(typeof result.json.expiresAt, "number");
    assert.ok(result.json.expiresAt > Date.now() + SEVEN_DAYS_MS - 60000);
    assert.equal(result.text.includes("correct-horse-9!"), false);
    assert.equal(result.text.includes("password_hash"), false);

    const session = findCookie(result.setCookies, "lidar_session");

    assert.ok(session);
    assert.match(session, /HttpOnly/);
    assert.match(session, /Path=\//);
    assert.match(session, /SameSite=Lax/);
    assert.match(session, /Max-Age=604800/);
    assert.equal(findCookie(result.setCookies, "lidar_auth"), "lidar_auth=1; Max-Age=604800; Path=/; SameSite=Lax");
    assert.ok(findCookie(result.setCookies, "lidar_backend"));

    const token = ctx.jar.get("lidar_session");
    const user = ctx.app.db.prepare("SELECT * FROM users").get();
    const sessionRow = ctx.app.db.prepare("SELECT * FROM sessions").get();

    assert.equal(user.email, "alex.morgan@robotics.io");
    assert.equal(user.name, "Alex Morgan");
    assert.match(user.password_hash, /^scrypt\$1024\$8\$1\$/);
    assert.equal(sessionRow.user_id, user.id);
    assert.equal(sessionRow.remember, 1);
    assert.equal(sessionRow.token_hash, hashSessionToken(token));
    assert.notEqual(sessionRow.token_hash, token);
});

test("register is race-safe about duplicate emails", async function (t) {
    const ctx = await start(t);
    const first = await request(ctx.base, "/api/auth/register", { body: registerBody() });

    assert.equal(first.status, 201);

    const second = await request(ctx.base, "/api/auth/register", {
        body: registerBody({ email: "ALEX.MORGAN@robotics.io" })
    });

    assert.equal(second.status, 409);
    assert.equal(second.json.error.code, "email_taken");
    assert.equal(ctx.app.db.prepare("SELECT COUNT(*) AS n FROM users").get().n, 1);
});

test("register reports each invalid field separately", async function (t) {
    const ctx = await start(t);
    const cases = [
        [{ name: " A " }, "name", "Enter your name."],
        [{ email: "not-an-email" }, "email", "Enter a valid email address."],
        [{ email: "" }, "email", "Enter your email address."],
        [{ password: "short-1!" }, "password", "Use at least 12 characters, including a number and a symbol."],
        [{ password: "alllettersonly" }, "password", "Use at least 12 characters, including a number and a symbol."],
        [{ consent: false }, "consent", "Accept the Terms of Service and Privacy Policy to continue."]
    ];

    for (const entry of cases) {
        const result = await request(ctx.base, "/api/auth/register", {
            body: registerBody(entry[0])
        });

        assert.equal(result.status, 400, JSON.stringify(entry[0]));
        assert.equal(result.json.error.code, "validation_error");
        assert.equal(result.json.error.message, "Check the highlighted fields.");
        assert.equal(result.json.error.fields[entry[1]], entry[2]);
    }

    assert.equal(ctx.app.db.prepare("SELECT COUNT(*) AS n FROM users").get().n, 0);
});

test("register is refused when ALLOW_REGISTRATION=0", async function (t) {
    const ctx = await start(t, { ALLOW_REGISTRATION: "0" });
    const result = await request(ctx.base, "/api/auth/register", { body: registerBody() });

    assert.equal(result.status, 403);
    assert.equal(result.json.error.code, "registration_disabled");
});

test("login verifies the password and rotates the old session token", async function (t) {
    const ctx = await start(t);
    await request(ctx.base, "/api/auth/register", { body: registerBody(), jar: ctx.jar });

    const oldToken = ctx.jar.get("lidar_session");
    const oldHash = hashSessionToken(oldToken);
    const login = await request(ctx.base, "/api/auth/login", {
        body: {
            email: "  ALEX.MORGAN@robotics.IO ",
            password: "correct-horse-9!",
            remember: true
        },
        jar: ctx.jar
    });

    assert.equal(login.status, 200);
    assert.deepEqual(login.json.user, {
        email: "alex.morgan@robotics.io",
        name: "Alex Morgan"
    });

    const newToken = ctx.jar.get("lidar_session");

    assert.ok(newToken);
    assert.notEqual(newToken, oldToken);
    assert.equal(findCookie(login.setCookies, "lidar_auth"), "lidar_auth=1; Max-Age=604800; Path=/; SameSite=Lax");

    const sessions = ctx.app.db.prepare("SELECT * FROM sessions").all();

    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].token_hash, hashSessionToken(newToken));
    assert.equal(
        ctx.app.db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE token_hash = ?").get(oldHash).n,
        0
    );
});

test("wrong password and unknown email give the same 401 response", async function (t) {
    const ctx = await start(t);
    await request(ctx.base, "/api/auth/register", { body: registerBody() });

    const wrongPassword = await request(ctx.base, "/api/auth/login", {
        body: { email: "alex.morgan@robotics.io", password: "wrong-horse-9!" }
    });
    const unknownEmail = await request(ctx.base, "/api/auth/login", {
        body: { email: "nobody@robotics.io", password: "correct-horse-9!" }
    });

    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.equal(wrongPassword.json.error.code, "invalid_credentials");
    assert.equal(unknownEmail.json.error.code, "invalid_credentials");
    assert.equal(wrongPassword.json.error.message, unknownEmail.json.error.message);
    assert.equal(wrongPassword.json.error.fields, undefined);
});

test("login without remember uses a browser-session cookie and 24h expiry", async function (t) {
    const ctx = await start(t);
    await request(ctx.base, "/api/auth/register", { body: registerBody(), jar: ctx.jar });

    const login = await request(ctx.base, "/api/auth/login", {
        body: {
            email: "alex.morgan@robotics.io",
            password: "correct-horse-9!",
            remember: false
        },
        jar: ctx.jar
    });

    assert.equal(login.status, 200);

    const session = findCookie(login.setCookies, "lidar_session");
    const hint = findCookie(login.setCookies, "lidar_auth");

    assert.ok(session);
    assert.doesNotMatch(session, /Max-Age/);
    assert.doesNotMatch(hint, /Max-Age/);

    const row = ctx.app.db.prepare("SELECT * FROM sessions").get();

    assert.equal(row.remember, 0);
    assert.ok(Math.abs(Number(row.expires_at) - (Date.now() + DAY_MS)) < 10000);
});

test("login with remember uses a 7 day cookie and DB expiry", async function (t) {
    const ctx = await start(t);
    await request(ctx.base, "/api/auth/register", { body: registerBody(), jar: ctx.jar });

    const login = await request(ctx.base, "/api/auth/login", {
        body: {
            email: "alex.morgan@robotics.io",
            password: "correct-horse-9!",
            remember: true
        },
        jar: ctx.jar
    });

    assert.equal(login.status, 200);
    assert.match(findCookie(login.setCookies, "lidar_session"), /Max-Age=604800/);
    assert.match(findCookie(login.setCookies, "lidar_auth"), /Max-Age=604800/);

    const row = ctx.app.db.prepare("SELECT * FROM sessions").get();

    assert.equal(row.remember, 1);
    assert.ok(Math.abs(Number(row.expires_at) - (Date.now() + SEVEN_DAYS_MS)) < 10000);
});

test("session endpoint reports the state and refreshes the hint TTL", async function (t) {
    const ctx = await start(t);
    const anonymous = await request(ctx.base, "/api/auth/session");

    assert.equal(anonymous.status, 200);
    assert.deepEqual(anonymous.json, { authenticated: false });

    await request(ctx.base, "/api/auth/register", { body: registerBody(), jar: ctx.jar });

    const signedIn = await request(ctx.base, "/api/auth/session", { jar: ctx.jar });

    assert.equal(signedIn.status, 200);
    assert.equal(signedIn.json.authenticated, true);
    assert.deepEqual(signedIn.json.user, {
        email: "alex.morgan@robotics.io",
        name: "Alex Morgan"
    });
    assert.equal(typeof signedIn.json.expiresAt, "number");

    const hint = findCookie(signedIn.setCookies, "lidar_auth");
    const session = findCookie(signedIn.setCookies, "lidar_session");

    assert.ok(hint);
    assert.match(hint, /Max-Age=\d+/);
    assert.doesNotMatch(hint, /HttpOnly/);
    assert.match(session, /HttpOnly/);
});

test("an unknown session token is rejected and the cookies are cleared", async function (t) {
    const ctx = await start(t);
    const jar = ctx.jar;

    jar.update(["lidar_session=bogus; Path=/", "lidar_auth=1; Path=/"]);

    const result = await request(ctx.base, "/api/auth/session", { jar: jar });

    assert.equal(result.status, 200);
    assert.deepEqual(result.json, { authenticated: false });
    assert.match(findCookie(result.setCookies, "lidar_session"), /Max-Age=0/);
    assert.match(findCookie(result.setCookies, "lidar_auth"), /Max-Age=0/);
    assert.ok(findCookie(result.setCookies, "lidar_backend"));
});

test("an expired session is deleted and the cookies are cleared", async function (t) {
    const ctx = await start(t);
    await request(ctx.base, "/api/auth/register", { body: registerBody(), jar: ctx.jar });

    const token = ctx.jar.get("lidar_session");

    ctx.app.db.prepare("UPDATE sessions SET expires_at = 1").run();

    const result = await request(ctx.base, "/api/auth/session", { jar: ctx.jar });

    assert.equal(result.status, 200);
    assert.deepEqual(result.json, { authenticated: false });
    assert.equal(ctx.app.db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n, 0);
    assert.match(findCookie(result.setCookies, "lidar_session"), /Max-Age=0/);
    assert.equal(hashSessionToken(token).length, 64);
});

test("logout deletes the session, clears the session cookies and keeps the marker", async function (t) {
    const ctx = await start(t);
    await request(ctx.base, "/api/auth/register", { body: registerBody(), jar: ctx.jar });

    const logout = await request(ctx.base, "/api/auth/logout", { body: {}, jar: ctx.jar });

    assert.equal(logout.status, 200);
    assert.deepEqual(logout.json, { ok: true });
    assert.equal(ctx.app.db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n, 0);
    assert.match(findCookie(logout.setCookies, "lidar_session"), /Max-Age=0/);
    assert.match(findCookie(logout.setCookies, "lidar_auth"), /Max-Age=0/);
    assert.ok(findCookie(logout.setCookies, "lidar_backend"));
    assert.equal(ctx.jar.has("lidar_session"), false);
    assert.equal(ctx.jar.has("lidar_auth"), false);
    assert.equal(ctx.jar.get("lidar_backend"), "1");

    const after = await request(ctx.base, "/api/auth/session", { jar: ctx.jar });

    assert.deepEqual(after.json, { authenticated: false });
});

test("logout is idempotent and accepts an empty body", async function (t) {
    const ctx = await start(t);
    const result = await request(ctx.base, "/api/auth/logout", {
        body: "",
        headers: { "Content-Type": "application/json" }
    });

    assert.equal(result.status, 200);
    assert.deepEqual(result.json, { ok: true });
});

test("login rate limit returns 429 with a parseable Retry-After", async function (t) {
    const ctx = await start(t, { LOGIN_IP_LIMIT: "2" });

    await request(ctx.base, "/api/auth/login", {
        body: { email: "a@example.com", password: "wrong-horse-9!" }
    });
    await request(ctx.base, "/api/auth/login", {
        body: { email: "b@example.com", password: "wrong-horse-9!" }
    });

    const limited = await request(ctx.base, "/api/auth/login", {
        body: { email: "c@example.com", password: "wrong-horse-9!" }
    });

    assert.equal(limited.status, 429);
    assert.equal(limited.json.error.code, "rate_limited");
    assert.match(limited.headers.get("retry-after"), /^\d+$/);
    assert.ok(Number.parseInt(limited.headers.get("retry-after"), 10) >= 1);
});

test("cross-origin and cross-site POSTs are refused", async function (t) {
    const ctx = await start(t);
    const evilOrigin = await request(ctx.base, "/api/auth/register", {
        body: registerBody(),
        headers: { Origin: "http://evil.example" }
    });

    assert.equal(evilOrigin.status, 403);
    assert.equal(evilOrigin.json.error.code, "forbidden_origin");

    const crossSite = await request(ctx.base, "/api/auth/register", {
        body: registerBody(),
        headers: { "Sec-Fetch-Site": "cross-site" }
    });

    assert.equal(crossSite.status, 403);
    assert.equal(crossSite.json.error.code, "forbidden_origin");
    assert.equal(ctx.app.db.prepare("SELECT COUNT(*) AS n FROM users").get().n, 0);
});

test("POST requires a JSON Content-Type", async function (t) {
    const ctx = await start(t);
    const result = await request(ctx.base, "/api/auth/login", {
        body: JSON.stringify({ email: "a@example.com", password: "correct-horse-9!" }),
        headers: { "Content-Type": "text/plain" }
    });

    assert.equal(result.status, 415);
    assert.equal(result.json.error.code, "unsupported_media_type");
});

test("the body limit answers 413 and closes the connection", async function (t) {
    const ctx = await start(t);
    const result = await request(ctx.base, "/api/auth/login", {
        body: JSON.stringify({ email: "a@example.com", password: "x".repeat(20000) })
    });

    assert.equal(result.status, 413);
    assert.equal(result.json.error.code, "payload_too_large");
    assert.equal(result.headers.get("connection"), "close");
});

test("invalid JSON and non-object bodies are 400", async function (t) {
    const ctx = await start(t);
    const invalid = await request(ctx.base, "/api/auth/login", {
        body: "{not json",
        headers: { "Content-Type": "application/json" }
    });

    assert.equal(invalid.status, 400);
    assert.equal(invalid.json.error.code, "invalid_json");

    const arrayBody = await request(ctx.base, "/api/auth/login", {
        body: "[]",
        headers: { "Content-Type": "application/json" }
    });

    assert.equal(arrayBody.status, 400);
    assert.equal(arrayBody.json.error.code, "bad_request");
});

test("unsupported methods answer 405 with an Allow header", async function (t) {
    const ctx = await start(t);
    const login = await request(ctx.base, "/api/auth/login");

    assert.equal(login.status, 405);
    assert.equal(login.json.error.code, "method_not_allowed");
    assert.equal(login.headers.get("allow"), "POST");

    const health = await request(ctx.base, "/api/auth/health", { method: "POST" });

    assert.equal(health.status, 405);
    assert.equal(health.headers.get("allow"), "GET, HEAD");
});

test("unknown API routes answer 404 with the JSON envelope", async function (t) {
    const ctx = await start(t);
    const result = await request(ctx.base, "/api/auth/unknown");

    assert.equal(result.status, 404);
    assert.equal(result.json.error.code, "not_found");
    assert.match(result.json.error.message, /Not found/);
    assert.match(result.json.error.requestId, /^[0-9a-f]{16}$/);
});

test("a request without a Host header is a 400", async function (t) {
    const ctx = await start(t);
    const raw = await rawRequest(
        ctx.server.address().port,
        "GET /api/auth/health HTTP/1.1\r\nConnection: close\r\n\r\n"
    );

    assert.match(raw, /^HTTP\/1\.1 400/);
});

/* ---------------------------------------------------- static gate */

test("the static gate redirects page requests without a session", async function (t) {
    const ctx = await start(t);
    const root = await request(ctx.base, "/", { noOrigin: true });
    const workspace = await request(ctx.base, "/workspace.html", { noOrigin: true });
    const auth = await request(ctx.base, "/auth.html", { noOrigin: true });

    assert.equal(root.status, 302);
    assert.equal(root.headers.get("location"), "/auth.html#/auth");
    assert.equal(workspace.status, 302);
    assert.equal(workspace.headers.get("location"), "/auth.html#/auth");
    assert.equal(auth.status, 200);
    assert.match(auth.text, /Sign in/);
    assert.equal(auth.headers.get("x-frame-options"), "DENY");
});

test("a real session opens the map and workspace pages and redirects /auth.html", async function (t) {
    const ctx = await start(t);

    await request(ctx.base, "/api/auth/register", { body: registerBody(), jar: ctx.jar });

    const root = await request(ctx.base, "/", { jar: ctx.jar, noOrigin: true });
    const workspace = await request(ctx.base, "/workspace.html", { jar: ctx.jar, noOrigin: true });
    const auth = await request(ctx.base, "/auth.html", { jar: ctx.jar, noOrigin: true });

    assert.equal(root.status, 200);
    assert.match(root.text, /Map Selection/);
    assert.equal(workspace.status, 200);
    assert.match(workspace.text, /Sensor Workspace/);
    assert.equal(auth.status, 302);
    assert.equal(auth.headers.get("location"), "/");
});

test("public assets are served and server-side files stay hidden", async function (t) {
    const ctx = await start(t);
    const asset = await request(ctx.base, "/src/session.js", { noOrigin: true });
    const env = await request(ctx.base, "/.env", { noOrigin: true });
    const serverFile = await request(ctx.base, "/server/server.js", { noOrigin: true });
    const traversal = await request(ctx.base, "/src/%2e%2e/%2e%2e/server/server.js", { noOrigin: true });

    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type"), /^text\/javascript; charset=utf-8$/);
    assert.equal(env.status, 404);
    assert.equal(serverFile.status, 404);
    assert.equal(traversal.status, 404);
});
