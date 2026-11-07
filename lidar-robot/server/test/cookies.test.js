"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const cookies = require("../lib/cookies");

function fakeResponse() {
    const headers = {};

    return {
        headers: headers,
        getHeader: function (name) {
            return headers[name.toLowerCase()];
        },
        setHeader: function (name, value) {
            headers[name.toLowerCase()] = value;
        }
    };
}

test("parseCookies reads a normal Cookie header", function () {
    const parsed = cookies.parseCookies("lidar_auth=1; lidar_backend=1");

    assert.equal(parsed.lidar_auth, "1");
    assert.equal(parsed.lidar_backend, "1");
});

test("parseCookies trims names and values and handles empty input", function () {
    assert.equal(cookies.parseCookies(undefined) && Object.keys(cookies.parseCookies(undefined)).length, 0);
    assert.equal(Object.keys(cookies.parseCookies("")).length, 0);
    assert.equal(cookies.parseCookies("  a =  spaced value  ").a, "spaced value");
});

test("parseCookies keeps the first duplicate and ignores malformed pairs", function () {
    const parsed = cookies.parseCookies("a=first; a=second; novalue; =empty; b=2");

    assert.equal(parsed.a, "first");
    assert.equal(parsed.b, "2");
    assert.equal(parsed.novalue, undefined);
    assert.equal(parsed[""], undefined);
});

test("parseCookies decodes percent encoding and survives bad encoding", function () {
    assert.equal(cookies.parseCookies("token=a%20b%2Fc").token, "a b/c");
    assert.equal(cookies.parseCookies("token=%E0%A4%A").token, "%E0%A4%A");
});

test("parseCookies strips surrounding quotes", function () {
    assert.equal(cookies.parseCookies('token="abc"').token, "abc");
});

test("serializeCookie writes the expected attributes", function () {
    assert.equal(
        cookies.serializeCookie("lidar_session", "tok", {
            httpOnly: true,
            secure: true,
            sameSite: "Lax",
            path: "/",
            maxAge: 604800
        }),
        "lidar_session=tok; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax"
    );

    assert.equal(
        cookies.serializeCookie("lidar_auth", "1"),
        "lidar_auth=1; Path=/; SameSite=Lax"
    );

    assert.equal(
        cookies.serializeCookie("lidar_session", "", { httpOnly: true, maxAge: 0 }),
        "lidar_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax"
    );
});

test("sessionCookie is HttpOnly and is a browser-session cookie without Max-Age", function () {
    const config = { cookieSecure: false };
    const session = cookies.sessionCookie(config, "tok");

    assert.match(session, /^lidar_session=tok; Path=\/; HttpOnly; SameSite=Lax$/);
    assert.doesNotMatch(session, /Max-Age/);

    const remembered = cookies.sessionCookie(config, "tok", 604800);

    assert.match(remembered, /Max-Age=604800/);
    assert.match(remembered, /HttpOnly/);
    assert.doesNotMatch(remembered, /Secure/);
});

test("the Secure flag follows COOKIE_SECURE on every cookie", function () {
    const config = { cookieSecure: true };

    assert.match(cookies.sessionCookie(config, "tok", 60), /; Secure;/);
    assert.match(cookies.authHintCookie(config, 60), /; Secure;/);
    assert.match(cookies.backendCookie(config), /; Secure;/);
    assert.match(cookies.clearCookie(config, "lidar_auth", false), /; Secure;/);
});

test("authHintCookie is readable and keeps the remaining TTL", function () {
    const hint = cookies.authHintCookie({ cookieSecure: false }, 120);

    assert.equal(hint, "lidar_auth=1; Max-Age=120; Path=/; SameSite=Lax");
    assert.doesNotMatch(hint, /HttpOnly/);

    assert.equal(
        cookies.authHintCookie({ cookieSecure: false }),
        "lidar_auth=1; Path=/; SameSite=Lax"
    );
});

test("backendCookie lives for one day", function () {
    assert.equal(
        cookies.backendCookie({ cookieSecure: false }),
        "lidar_backend=1; Max-Age=86400; Path=/; SameSite=Lax"
    );
});

test("clearSessionCookies clears the session and the hint but not the marker", function () {
    const cleared = cookies.clearSessionCookies({ cookieSecure: false });

    assert.equal(cleared.length, 2);
    assert.match(cleared[0], /^lidar_session=; Max-Age=0; Path=\/; HttpOnly; SameSite=Lax$/);
    assert.match(cleared[1], /^lidar_auth=; Max-Age=0; Path=\/; SameSite=Lax$/);
    assert.equal(cleared.some(function (cookie) { return cookie.startsWith("lidar_backend="); }), false);
});

test("appendSetCookie keeps earlier Set-Cookie headers", function () {
    const res = fakeResponse();

    cookies.appendSetCookie(res, "a=1");
    assert.deepEqual(res.getHeader("set-cookie"), ["a=1"]);

    cookies.appendSetCookie(res, "b=2");
    assert.deepEqual(res.getHeader("set-cookie"), ["a=1", "b=2"]);

    res.setHeader("Set-Cookie", "c=3");
    cookies.appendSetCookie(res, "d=4");
    assert.deepEqual(res.getHeader("set-cookie"), ["c=3", "d=4"]);
});
