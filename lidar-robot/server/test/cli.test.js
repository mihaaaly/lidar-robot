"use strict";

/* End-to-end tests for the admin CLI: it must share the service's config and
   database, never print the password, and must revoke sessions on passwd. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { openDatabase } = require("../lib/db");

const CLI = path.resolve(__dirname, "..", "bin", "users.js");

function createContext() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lidar-cli-test-"));
    const dbPath = path.join(dir, "auth.db");
    const env = Object.assign({}, process.env, {
        AUTH_DB_PATH: dbPath,
        WEB_ROOT: path.resolve(__dirname, "..", "..", "web", "public"),
        LOG_LEVEL: "silent",
        SCRYPT_N: "1024"
    });

    return {
        dir: dir,
        dbPath: dbPath,
        env: env,
        run(args, input) {
            const result = spawnSync(process.execPath, [CLI].concat(args), {
                env: env,
                input: input === undefined ? "" : input,
                encoding: "utf8"
            });

            return result;
        },
        cleanup() {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    };
}

test("the CLI adds, lists, updates, backs up and removes a user", async function (t) {
    const ctx = createContext();
    const password = "correct-horse-9!";

    t.after(function () {
        ctx.cleanup();
    });

    const added = ctx.run(
        ["add", "--email", "Alex@Example.com", "--name", "Alex Morgan", "--password-stdin"],
        password
    );

    assert.equal(added.status, 0, added.stderr);
    assert.match(added.stdout, /created user #1\s+alex@example\.com/);
    assert.doesNotMatch(added.stdout + added.stderr, /correct-horse/);

    const listed = ctx.run(["list"]);

    assert.equal(listed.status, 0);
    assert.match(listed.stdout, /alex@example\.com/);
    assert.match(listed.stdout, /Alex Morgan/);
    assert.doesNotMatch(listed.stdout, /scrypt\$/);

    const duplicate = ctx.run(
        ["add", "--email", "alex@example.com", "--name", "Other", "--password-stdin"],
        password
    );

    assert.equal(duplicate.status, 2);

    const db = openDatabase(ctx.dbPath);
    const user = db.prepare("SELECT id FROM users WHERE email = ?").get("alex@example.com");

    db.prepare(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, remember) VALUES (?, ?, ?, ?, 1)"
    ).run("a".repeat(64), user.id, Date.now(), Date.now() + 100000);

    const updated = ctx.run(
        ["passwd", "--email", "alex@example.com", "--password-stdin"],
        "new-horse-9!"
    );

    assert.equal(updated.status, 0, updated.stderr);
    assert.match(updated.stdout, /password updated/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n, 0);
    db.close();

    const backupPath = path.join(ctx.dir, "backups", "auth.db");
    const backedUp = ctx.run(["backup", "--out", backupPath]);

    assert.equal(backedUp.status, 0, backedUp.stderr);
    assert.ok(fs.existsSync(backupPath));
    assert.equal(fs.statSync(backupPath).mode & 0o777, 0o600);

    const refused = ctx.run(["remove", "--email", "alex@example.com"]);

    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /--yes/);

    const removed = ctx.run(["remove", "--email", "alex@example.com", "--yes"]);

    assert.equal(removed.status, 0, removed.stderr);
    assert.match(removed.stdout, /removed user #1/);
    assert.equal(ctx.run(["list"]).stdout.trim(), "No users.");
});

test("the CLI validates passwords and missing users", function (t) {
    const ctx = createContext();

    t.after(function () {
        ctx.cleanup();
    });

    const weak = ctx.run(
        ["add", "--email", "weak@example.com", "--name", "Weak", "--password-stdin"],
        "short"
    );

    assert.equal(weak.status, 1);
    assert.match(weak.stderr, /at least 12 characters/);

    const missing = ctx.run(
        ["passwd", "--email", "missing@example.com", "--password-stdin"],
        "correct-horse-9!"
    );

    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /No user with missing@example\.com/);

    const noStdin = ctx.run(["add", "--email", "a@example.com", "--name", "Alex"]);

    assert.equal(noStdin.status, 1);
    assert.match(noStdin.stderr, /password-stdin/);
});
