"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createRateLimiter } = require("../lib/ratelimit");

test("allows exactly limit hits inside the window, then blocks", function () {
    let now = 1000;
    const limiter = createRateLimiter({ limit: 3, windowMs: 60000, now: function () { return now; } });

    assert.equal(limiter.hit("ip").allowed, true);
    assert.equal(limiter.hit("ip").allowed, true);
    assert.equal(limiter.hit("ip").allowed, true);

    const blocked = limiter.hit("ip");

    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.equal(blocked.retryAfter, 60);
});

test("keys are independent", function () {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60000 });

    assert.equal(limiter.hit("a").allowed, true);
    assert.equal(limiter.hit("b").allowed, true);
    assert.equal(limiter.hit("a").allowed, false);
});

test("the window slides and allows hits again after it passes", function () {
    let now = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 60000, now: function () { return now; } });

    limiter.hit("ip");
    now = 1000;
    limiter.hit("ip");
    assert.equal(limiter.hit("ip").allowed, false);

    now = 60000;
    assert.equal(limiter.hit("ip").allowed, true);

    now = 61000;
    assert.equal(limiter.hit("ip").allowed, true);
    assert.equal(limiter.hit("ip").allowed, false);
});

test("Retry-After rounds up to whole seconds and is never below 1", function () {
    let now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1500, now: function () { return now; } });

    limiter.hit("ip");
    now = 1000;

    assert.equal(limiter.hit("ip").retryAfter, 1);

    now = 500;
    assert.equal(limiter.hit("ip").retryAfter, 1);
});

test("reset clears a single key", function () {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60000 });

    limiter.hit("ip");
    assert.equal(limiter.hit("ip").allowed, false);

    limiter.reset("ip");
    assert.equal(limiter.hit("ip").allowed, true);
});

test("cleanup drops stale buckets", function () {
    let now = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: function () { return now; } });

    limiter.hit("a");
    limiter.hit("b");
    assert.equal(limiter.size(), 2);

    now = 1000;
    limiter.cleanup();
    assert.equal(limiter.size(), 0);
});

test("the bucket map is bounded and evicts the oldest keys", function () {
    const limiter = createRateLimiter({ limit: 5, windowMs: 60000, maxKeys: 2 });

    limiter.hit("a");
    limiter.hit("b");
    limiter.hit("c");

    assert.equal(limiter.size(), 2);
    assert.equal(limiter.has("a"), false);
    assert.equal(limiter.has("b"), true);
    assert.equal(limiter.has("c"), true);
});

test("invalid limits are rejected", function () {
    assert.throws(function () {
        createRateLimiter({ limit: 0, windowMs: 1000 });
    });

    assert.throws(function () {
        createRateLimiter({ limit: 1, windowMs: 0 });
    });
});
