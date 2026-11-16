"use strict";

/* ------------------------------------------------------------------
   Session tokens and the sessions table.

   Only SHA-256(token) is stored; the raw token lives in the HttpOnly
   cookie. Sessions use absolute expiry (no sliding).
   ------------------------------------------------------------------ */

const crypto = require("node:crypto");

const MAX_SESSIONS_PER_USER = 10;

function newSessionToken() {
    return crypto.randomBytes(32).toString("base64url");
}

function hashSessionToken(token) {
    return crypto.createHash("sha256").update(String(token), "utf8").digest("hex");
}

function trimUserSessions(db, userId, keep) {
    db.prepare(
        "DELETE FROM sessions WHERE token_hash IN (" +
        "  SELECT token_hash FROM sessions WHERE user_id = ? " +
        "  ORDER BY created_at DESC, token_hash DESC LIMIT -1 OFFSET ?" +
        ")"
    ).run(userId, keep);
}

function createSession(db, data) {
    const now = data.now || Date.now();
    const remember = data.remember === true;
    const ttl = remember ? data.rememberMs : data.sessionMs;
    const expiresAt = now + ttl;
    const token = newSessionToken();
    const tokenHash = hashSessionToken(token);

    trimUserSessions(db, data.userId, MAX_SESSIONS_PER_USER - 1);

    db.prepare(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, remember, ip, user_agent) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
        tokenHash,
        data.userId,
        now,
        expiresAt,
        remember ? 1 : 0,
        data.ip || null,
        data.userAgent || null
    );

    return {
        token: token,
        tokenHash: tokenHash,
        expiresAt: expiresAt,
        remember: remember
    };
}

function deleteSessionByHash(db, tokenHash) {
    const result = db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);

    return !!result && Number(result.changes) > 0;
}

function deleteSessionByToken(db, token) {
    if (!token) {
        return false;
    }

    return deleteSessionByHash(db, hashSessionToken(token));
}

function deleteSessionsForUser(db, userId) {
    const result = db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);

    return !!result && Number(result.changes) > 0;
}

function findSession(db, token, now) {
    if (!token) {
        return null;
    }

    const tokenHash = hashSessionToken(token);
    const nowMs = now || Date.now();
    const row = db.prepare(
        "SELECT s.token_hash, s.user_id, s.created_at, s.expires_at, s.remember, " +
        "       u.email, u.name " +
        "FROM sessions s JOIN users u ON u.id = s.user_id " +
        "WHERE s.token_hash = ?"
    ).get(tokenHash);

    if (!row) {
        return null;
    }

    if (Number(row.expires_at) <= nowMs) {
        deleteSessionByHash(db, tokenHash);
        return null;
    }

    return {
        tokenHash: row.token_hash,
        userId: Number(row.user_id),
        createdAt: Number(row.created_at),
        expiresAt: Number(row.expires_at),
        remember: Number(row.remember) === 1,
        user: {
            email: row.email,
            name: row.name
        }
    };
}

function cleanupExpiredSessions(db, now) {
    const nowMs = now || Date.now();
    const result = db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(nowMs);

    return result ? Number(result.changes) : 0;
}

function startCleanupTimer(db, intervalMs, onError) {
    const timer = setInterval(function () {
        try {
            cleanupExpiredSessions(db);
        } catch (error) {
            if (typeof onError === "function") {
                onError(error);
            }
        }
    }, intervalMs);

    timer.unref();
    return timer;
}

module.exports = {
    MAX_SESSIONS_PER_USER,
    cleanupExpiredSessions,
    createSession,
    deleteSessionByHash,
    deleteSessionByToken,
    deleteSessionsForUser,
    findSession,
    hashSessionToken,
    newSessionToken,
    startCleanupTimer,
    trimUserSessions
};
