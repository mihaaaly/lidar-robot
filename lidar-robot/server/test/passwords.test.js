"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
    PARAMS,
    hashPassword,
    parseHash,
    verifyDummy,
    verifyPassword
} = require("../lib/passwords");

const TEST_PARAMS = { N: 1024, r: 8, p: 1 };

test("hash format contains the scrypt parameters and base64 parts", async function () {
    const encoded = await hashPassword("correct-horse-9!", TEST_PARAMS);

    assert.match(encoded, /^scrypt\$1024\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);

    const parsed = parseHash(encoded);

    assert.equal(parsed.N, 1024);
    assert.equal(parsed.r, 8);
    assert.equal(parsed.p, 1);
    assert.equal(parsed.salt.length, 16);
    assert.equal(parsed.hash.length, 64);
    assert.equal(parsed.keylen, 64);
});

test("default password parameters are the production scrypt cost", async function () {
    const encoded = await hashPassword("correct-horse-9!");

    assert.equal(parseHash(encoded).N, PARAMS.N);
    assert.equal(parseHash(encoded).N, 16384);
});

test("verifyPassword accepts the right password and rejects a wrong one", async function () {
    const encoded = await hashPassword("correct-horse-9!", TEST_PARAMS);

    assert.equal(await verifyPassword("correct-horse-9!", encoded), true);
    assert.equal(await verifyPassword("correct-horse-8!", encoded), false);
    assert.equal(await verifyPassword("", encoded), false);
});

test("every hash uses a fresh salt", async function () {
    const first = await hashPassword("correct-horse-9!", TEST_PARAMS);
    const second = await hashPassword("correct-horse-9!", TEST_PARAMS);

    assert.notEqual(first, second);
    assert.notEqual(parseHash(first).salt.toString("hex"), parseHash(second).salt.toString("hex"));
    assert.equal(await verifyPassword("correct-horse-9!", second), true);
});

test("malformed hashes verify as false instead of throwing", async function () {
    const malformed = [
        "",
        "not-a-hash",
        "scrypt$1024$8$1$onlyfive",
        "scrypt$notanumber$8$1$c2FsdA==$aGFzaA==",
        "scrypt$1024$8$1$c2FsdA==",
        "bcrypt$1024$8$1$c2FsdA==$aGFzaA==",
        "scrypt$1000$8$1$c2FsdA==$aGFzaA==",
        null,
        undefined
    ];

    for (const encoded of malformed) {
        assert.equal(await verifyPassword("correct-horse-9!", encoded), false);
    }
});

test("parseHash rejects a zero-length salt or hash", function () {
    assert.equal(parseHash("scrypt$1024$8$1$$aGFzaA=="), null);
    assert.equal(parseHash("scrypt$1024$8$1$c2FsdA==$"), null);
});

test("the dummy verification resolves to false and takes the scrypt path", async function () {
    assert.equal(await verifyDummy("anything", TEST_PARAMS), false);
    assert.equal(await verifyDummy("anything", TEST_PARAMS), false);
});
