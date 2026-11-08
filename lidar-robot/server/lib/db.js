"use strict";

/* ------------------------------------------------------------------
   SQLite (node:sqlite) connection, pragmas and schema migrations.

   The schema is versioned with PRAGMA user_version; a fresh database is
   created in one transaction. The file is chmod 600 and its directory
   0700 so password hashes are not world-readable.
   ------------------------------------------------------------------ */

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const SCHEMA_VERSION = 1;

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  remember   INTEGER NOT NULL DEFAULT 0,
  ip         TEXT,
  user_agent TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

PRAGMA user_version = ${SCHEMA_VERSION};
`;

function isMemoryPath(dbPath) {
    return dbPath === ":memory:" || dbPath.startsWith("file::memory:");
}

function prepareDirectory(dbPath) {
    if (isMemoryPath(dbPath)) {
        return;
    }

    fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
}

function restrictFileMode(dbPath) {
    if (isMemoryPath(dbPath)) {
        return;
    }

    try {
        fs.chmodSync(dbPath, 0o600);
    } catch (error) {
        /* a backup / read-only test database may not be chmod-able */
    }
}

function applyPragmas(db) {
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA synchronous = NORMAL;");
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA busy_timeout = 5000;");
}

function currentVersion(db) {
    const row = db.prepare("PRAGMA user_version").get();

    return Number(row ? row.user_version : 0);
}

function migrate(db) {
    const version = currentVersion(db);

    if (version > SCHEMA_VERSION) {
        throw new Error(
            "Database schema version " + version +
            " is newer than this service supports (" + SCHEMA_VERSION +
            "). Upgrade the service instead of running an older build against it."
        );
    }

    if (version === SCHEMA_VERSION) {
        return;
    }

    db.exec("BEGIN IMMEDIATE");

    try {
        db.exec(SCHEMA_V1);
        db.exec("COMMIT");
    } catch (error) {
        try {
            db.exec("ROLLBACK");
        } catch (rollbackError) {
            /* the transaction may already be gone */
        }

        throw error;
    }
}

function openDatabase(dbPath) {
    prepareDirectory(dbPath);

    const db = new DatabaseSync(dbPath);

    try {
        applyPragmas(db);
        migrate(db);
        restrictFileMode(dbPath);
    } catch (error) {
        try {
            db.close();
        } catch (closeError) {
            /* keep the original error */
        }

        throw error;
    }

    return db;
}

module.exports = {
    SCHEMA_VERSION,
    openDatabase
};
