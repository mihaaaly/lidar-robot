"use strict";

/* ------------------------------------------------------------------
   User records. Passwords are already hashed when they reach this layer.
   ------------------------------------------------------------------ */

function toPublicUser(row) {
    if (!row) {
        return null;
    }

    return {
        email: row.email,
        name: row.name
    };
}

function findById(db, id) {
    const row = db
        .prepare("SELECT id, email, name, password_hash, created_at, updated_at FROM users WHERE id = ?")
        .get(id);

    return row || null;
}

function findByEmail(db, email) {
    const row = db
        .prepare("SELECT id, email, name, password_hash, created_at, updated_at FROM users WHERE email = ?")
        .get(email);

    return row || null;
}

function createUser(db, data) {
    const now = Date.now();
    const result = db
        .prepare(
            "INSERT INTO users (email, name, password_hash, created_at, updated_at) " +
            "VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING"
        )
        .run(data.email, data.name, data.passwordHash, now, now);

    if (!result || Number(result.changes) === 0) {
        return null;
    }

    return findById(db, Number(result.lastInsertRowid));
}

function updatePassword(db, id, passwordHash) {
    const result = db
        .prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
        .run(passwordHash, Date.now(), id);

    return !!result && Number(result.changes) > 0;
}

function deleteUserById(db, id) {
    const result = db.prepare("DELETE FROM users WHERE id = ?").run(id);

    return !!result && Number(result.changes) > 0;
}

function listUsers(db) {
    return db
        .prepare("SELECT id, email, name, created_at, updated_at FROM users ORDER BY id")
        .all();
}

module.exports = {
    createUser,
    deleteUserById,
    findByEmail,
    findById,
    listUsers,
    toPublicUser,
    updatePassword
};
