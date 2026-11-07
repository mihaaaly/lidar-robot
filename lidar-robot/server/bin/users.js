#!/usr/bin/env node
"use strict";

/* ------------------------------------------------------------------
   Admin CLI for the auth database.

   Runs with the same config/db/passwords/validate modules as the
   service, so it works while the service is running (WAL + busy_timeout).

   Passwords are read from stdin (--password-stdin) so they never end up
   in the shell history.
   ------------------------------------------------------------------ */

const fs = require("node:fs");
const { ConfigError, loadConfig } = require("../lib/config");
const { openDatabase } = require("../lib/db");
const passwords = require("../lib/passwords");
const users = require("../lib/users");
const validate = require("../lib/validate");

const USAGE = `Usage: node bin/users.js <command> [options]

Commands:
  add      --email <email> --name <name> --password-stdin
  list
  help

Password input (never pass it on the command line):

  read -rsp "Password: " PW; echo
  printf '%s' "$PW" | node bin/users.js add --email alex@example.com \\
    --name "Alex Morgan" --password-stdin
  unset PW
`;

function fail(message, code) {
    process.stderr.write(message.replace(/\n?$/, "\n"));
    process.exit(code === undefined ? 1 : code);
}

function parseArgs(argv) {
    const command = argv[0] || "help";
    const flags = {};
    let i = 1;

    while (i < argv.length) {
        const token = argv[i];

        if (!token.startsWith("--")) {
            fail(`Unexpected argument: ${token}\n\n${USAGE}`);
        }

        const name = token.slice(2);
        const next = argv[i + 1];

        if (next === undefined || next.startsWith("--")) {
            flags[name] = true;
            i += 1;
            continue;
        }

        flags[name] = next;
        i += 2;
    }

    return { command: command, flags: flags };
}

function readStdinPassword() {
    let raw;

    try {
        raw = fs.readFileSync(0, "utf8");
    } catch (error) {
        fail("Cannot read the password from stdin.");
    }

    return raw.replace(/\r?\n$/, "");
}

function loadContext() {
    let loaded;

    try {
        loaded = loadConfig(process.env);
    } catch (error) {
        if (error instanceof ConfigError) {
            fail("Configuration error:\n  - " + error.messages.join("\n  - "));
        }

        throw error;
    }

    return loaded.config;
}

function requireEmail(flags) {
    if (typeof flags.email !== "string" || !flags.email) {
        fail("Missing --email <email>.");
    }

    const field = validate.emailField(flags.email);

    if (field.error) {
        fail(field.error);
    }

    return field.value;
}

function commandAdd(config, flags) {
    if (typeof flags.name !== "string" || !flags.name) {
        fail("Missing --name <name>.");
    }

    const nameField = validate.nameField(flags.name);

    if (nameField.error) {
        fail(nameField.error);
    }

    if (flags["password-stdin"] !== true) {
        fail(
            "Password must come from stdin.\n\n" +
            "  read -rsp \"Password: \" PW; echo\n" +
            "  printf '%s' \"$PW\" | node bin/users.js add --email ... --name ... --password-stdin\n"
        );
    }

    const password = readStdinPassword();
    const passwordField = validate.passwordField(password);

    if (passwordField.error) {
        fail(passwordField.error);
    }

    const email = requireEmail(flags);
    const db = openDatabase(config.dbPath);

    try {
        return passwords
            .hashPassword(password, { N: config.scryptN })
            .then(function (passwordHash) {
                const created = users.createUser(db, {
                    email: email,
                    name: nameField.value,
                    passwordHash: passwordHash
                });

                if (!created) {
                    fail(`An account with ${email} already exists.`, 2);
                }

                process.stdout.write(
                    `created user #${created.id}  ${created.email}  ${created.name}\n`
                );
            })
            .finally(function () {
                db.close();
            });
    } catch (error) {
        db.close();
        throw error;
    }
}

function commandList(config) {
    const db = openDatabase(config.dbPath);

    try {
        const rows = users.listUsers(db);

        if (rows.length === 0) {
            process.stdout.write("No users.\n");
            return;
        }

        const header = ["ID", "EMAIL", "NAME", "CREATED"];
        const body = rows.map(function (row) {
            return [
                String(row.id),
                row.email,
                row.name,
                new Date(Number(row.created_at)).toISOString()
            ];
        });
        const widths = header.map(function (title, index) {
            return Math.max(
                title.length,
                body.reduce(function (max, cells) {
                    return Math.max(max, cells[index].length);
                }, 0)
            );
        });

        function line(cells) {
            return cells.map(function (cell, index) {
                return cell.padEnd(widths[index]);
            }).join("  ").trimEnd();
        }

        process.stdout.write(line(header) + "\n");
        body.forEach(function (cells) {
            process.stdout.write(line(cells) + "\n");
        });
    } finally {
        db.close();
    }
}

function main() {
    const parsed = parseArgs(process.argv.slice(2));

    if (parsed.command === "help" || parsed.flags.help === true) {
        process.stdout.write(USAGE);
        return;
    }

    if (parsed.command === "add") {
        const config = loadContext();
        return commandAdd(config, parsed.flags);
    }

    if (parsed.command === "list") {
        const config = loadContext();
        return commandList(config);
    }

    fail(`Unknown command: ${parsed.command}\n\n${USAGE}`);
}

Promise.resolve()
    .then(main)
    .catch(function (error) {
        fail(`users.js failed: ${error && error.message ? error.message : error}`);
    });
