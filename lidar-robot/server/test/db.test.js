"use strict";

/* Database open/migrate tests: the schema version gate and the file mode are
   the parts that keep an older service from silently using a newer database. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const { SCHEMA_VERSION, openDatabase } = require("../lib/db");

function makeDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "lidar-db-test-"));
}

test("a fresh database is created at the current schema version", function (t) {
    const dir = makeDir();
    const dbPath = path.join(dir, "auth.db");

    t.after(function () {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    const db = openDatabase(dbPath);

    try {
        assert.equal(
            Number(db.prepare("PRAGMA user_version").get().user_version),
            SCHEMA_VERSION
        );

        const tables = db
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
            .all()
            .map(function (row) {
                return row.name;
            });

        assert.ok(tables.includes("users"));
        assert.ok(tables.includes("sessions"));

        if (process.platform !== "win32") {
            assert.equal(fs.statSync(dbPath).mode & 0o777, 0o600);
        }
    } finally {
        db.close();
    }
});

test("reopening an existing database keeps the data and does not re-migrate", function (t) {
    const dir = makeDir();
    const dbPath = path.join(dir, "auth.db");

    t.after(function () {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    let db = openDatabase(dbPath);
    db.prepare(
        "INSERT INTO users (email, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run("reopen@example.com", "Reopen User", "scrypt$1024$8$1$c2FsdA==$aGFzaA==", 1, 1);
    db.close();

    db = openDatabase(dbPath);

    try {
        const row = db.prepare("SELECT email, name FROM users").get();

        assert.equal(row.email, "reopen@example.com");
        assert.equal(row.name, "Reopen User");
        assert.equal(
            Number(db.prepare("PRAGMA user_version").get().user_version),
            SCHEMA_VERSION
        );
    } finally {
        db.close();
    }
});

test("a database from a newer schema version is refused", function (t) {
    const dir = makeDir();
    const dbPath = path.join(dir, "auth.db");
    const raw = new DatabaseSync(dbPath);

    t.after(function () {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    raw.exec("PRAGMA user_version = " + (SCHEMA_VERSION + 1));
    raw.close();

    assert.throws(
        function () {
            openDatabase(dbPath);
        },
        /newer than this service supports/
    );
});

test("an in-memory database works", function (t) {
    const db = openDatabase(":memory:");

    t.after(function () {
        db.close();
    });

    assert.equal(
        Number(db.prepare("PRAGMA user_version").get().user_version),
        SCHEMA_VERSION
    );
});
