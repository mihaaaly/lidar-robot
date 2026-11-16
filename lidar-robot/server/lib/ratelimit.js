"use strict";

/* ------------------------------------------------------------------
   In-memory sliding-window rate limiter.

   Not persistent: a service restart resets the counters. That is an
   accepted trade-off on a LAN-only robot and is documented.
   ------------------------------------------------------------------ */

const DEFAULT_MAX_KEYS = 5000;

function createRateLimiter(options) {
    const opts = options || {};
    const limit = opts.limit;
    const windowMs = opts.windowMs;
    const maxKeys = opts.maxKeys || DEFAULT_MAX_KEYS;
    const clock = opts.now || Date.now;
    const buckets = new Map();

    if (!Number.isInteger(limit) || limit < 1) {
        throw new Error("rate limiter limit must be a positive integer");
    }

    if (!Number.isInteger(windowMs) || windowMs < 1) {
        throw new Error("rate limiter windowMs must be a positive integer");
    }

    function prune(key, now) {
        const hits = buckets.get(key);

        if (!hits) {
            return null;
        }

        const cutoff = now - windowMs;

        while (hits.length > 0 && hits[0] <= cutoff) {
            hits.shift();
        }

        if (hits.length === 0) {
            buckets.delete(key);
            return null;
        }

        return hits;
    }

    function evictIfNeeded() {
        while (buckets.size > maxKeys) {
            const oldest = buckets.keys().next();

            if (oldest.done) {
                return;
            }

            buckets.delete(oldest.value);
        }
    }

    function hit(key) {
        const now = clock();
        const normalized = String(key || "unknown");
        const hits = prune(normalized, now);

        if (hits && hits.length >= limit) {
            const retryAfterMs = hits[0] + windowMs - now;

            return {
                allowed: false,
                remaining: 0,
                retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000))
            };
        }

        if (hits) {
            hits.push(now);
        } else {
            buckets.set(normalized, [now]);
        }

        evictIfNeeded();

        return {
            allowed: true,
            remaining: Math.max(0, limit - (hits ? hits.length : 1)),
            retryAfter: 0
        };
    }

    function reset(key) {
        buckets.delete(String(key || "unknown"));
    }

    function cleanup() {
        const now = clock();

        buckets.forEach(function (hits, key) {
            if (!prune(key, now)) {
                buckets.delete(key);
            }
        });
    }

    function size() {
        return buckets.size;
    }

    function has(key) {
        return buckets.has(String(key || "unknown"));
    }

    function startCleanupTimer(intervalMs) {
        const timer = setInterval(cleanup, intervalMs);

        timer.unref();
        return timer;
    }

    return {
        hit: hit,
        reset: reset,
        cleanup: cleanup,
        size: size,
        has: has,
        startCleanupTimer: startCleanupTimer
    };
}

module.exports = {
    DEFAULT_MAX_KEYS,
    createRateLimiter
};
