"use strict";

/* ------------------------------------------------------------------
   Password hashing with scrypt.

   Stored format: scrypt$N$r$p$<salt-base64>$<hash-base64>
   The parameters are part of the hash so they can be raised later
   without invalidating existing accounts.
   ------------------------------------------------------------------ */

const crypto = require("node:crypto");

const PARAMS = {
    N: 16384,
    r: 8,
    p: 1,
    keylen: 64,
    saltBytes: 16,
    maxmem: 64 * 1024 * 1024
};

const PREFIX = "scrypt";
const dummyHashes = new Map();

function scryptAsync(password, salt, keylen, params) {
    return new Promise(function (resolve, reject) {
        crypto.scrypt(
            password,
            salt,
            keylen,
            {
                N: params.N,
                r: params.r,
                p: params.p,
                maxmem: params.maxmem || PARAMS.maxmem
            },
            function (error, derivedKey) {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(derivedKey);
            }
        );
    });
}

function hashParams(options) {
    const opts = options || {};

    return {
        N: opts.N || PARAMS.N,
        r: opts.r || PARAMS.r,
        p: opts.p || PARAMS.p,
        keylen: opts.keylen || PARAMS.keylen,
        saltBytes: opts.saltBytes || PARAMS.saltBytes,
        maxmem: opts.maxmem || PARAMS.maxmem
    };
}

async function hashPassword(password, options) {
    const params = hashParams(options);
    const salt = crypto.randomBytes(params.saltBytes);
    const derived = await scryptAsync(String(password), salt, params.keylen, params);

    return [
        PREFIX,
        params.N,
        params.r,
        params.p,
        salt.toString("base64"),
        derived.toString("base64")
    ].join("$");
}

function parseHash(encoded) {
    if (typeof encoded !== "string") {
        return null;
    }

    const parts = encoded.split("$");

    if (parts.length !== 6 || parts[0] !== PREFIX) {
        return null;
    }

    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);

    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
        return null;
    }

    if (N < 2 || r < 1 || p < 1 || (N & (N - 1)) !== 0) {
        return null;
    }

    let salt;
    let hash;

    try {
        salt = Buffer.from(parts[4], "base64");
        hash = Buffer.from(parts[5], "base64");
    } catch (error) {
        return null;
    }

    if (salt.length === 0 || hash.length === 0) {
        return null;
    }

    return {
        N: N,
        r: r,
        p: p,
        salt: salt,
        hash: hash,
        keylen: hash.length
    };
}

async function verifyPassword(password, encoded) {
    const parsed = parseHash(encoded);

    if (!parsed) {
        return false;
    }

    let derived;

    try {
        derived = await scryptAsync(String(password), parsed.salt, parsed.keylen, parsed);
    } catch (error) {
        return false;
    }

    if (derived.length !== parsed.hash.length) {
        return false;
    }

    try {
        return crypto.timingSafeEqual(derived, parsed.hash);
    } catch (error) {
        return false;
    }
}

/* A real scrypt verification against a fixed random hash. Used when the
   email is unknown so the response time does not reveal account existence. */
function dummyHash(options) {
    const params = hashParams(options);
    const key = [params.N, params.r, params.p, params.keylen, params.saltBytes].join(":");

    if (!dummyHashes.has(key)) {
        dummyHashes.set(
            key,
            hashPassword(crypto.randomBytes(32).toString("hex"), params)
        );
    }

    return dummyHashes.get(key);
}

async function verifyDummy(password, options) {
    const encoded = await dummyHash(options);

    return verifyPassword(password, encoded);
}

module.exports = {
    PARAMS,
    dummyHash,
    hashPassword,
    parseHash,
    verifyDummy,
    verifyPassword
};
