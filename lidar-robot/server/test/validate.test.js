"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
    MESSAGES,
    consentField,
    emailField,
    nameField,
    normalizeEmail,
    passwordField,
    validateLogin,
    validateRegistration
} = require("../lib/validate");

test("normalizeEmail trims and lowercases", function () {
    assert.equal(normalizeEmail("  Alex.Morgan@Robotics.IO "), "alex.morgan@robotics.io");
    assert.equal(normalizeEmail(undefined), "");
    assert.equal(normalizeEmail(42), "");
});

test("emailField validates empty and malformed addresses", function () {
    assert.equal(emailField("").error, MESSAGES.emailEmpty);
    assert.equal(emailField("nope").error, MESSAGES.emailInvalid);
    assert.equal(emailField("a@b").error, MESSAGES.emailInvalid);
    assert.equal(emailField("a b@example.com").error, MESSAGES.emailInvalid);
    assert.equal(emailField("a@b.c").error, null);
    assert.equal(emailField("  Alex@Example.COM  ").value, "alex@example.com");
    assert.equal(emailField("a".repeat(250) + "@b.co").error, MESSAGES.emailInvalid);
});

test("nameField trims and enforces 2-80 characters without control chars", function () {
    assert.equal(nameField("").error, MESSAGES.name);
    assert.equal(nameField(" A ").error, MESSAGES.name);
    assert.equal(nameField("Alex Morgan").error, null);
    assert.equal(nameField("  Alex Morgan  ").value, "Alex Morgan");
    assert.equal(nameField("A".repeat(81)).error, MESSAGES.name);
    assert.equal(nameField("A".repeat(80)).error, null);
    assert.equal(nameField("Alex\u0000Morgan").error, MESSAGES.name);
    assert.equal(nameField("Alex\nMorgan").error, MESSAGES.name);
});

test("passwordField enforces length, a number and a symbol", function () {
    assert.equal(passwordField("").error, MESSAGES.passwordEmpty);
    assert.equal(passwordField("short-1!").error, MESSAGES.passwordWeak);
    assert.equal(passwordField("alllettersonly").error, MESSAGES.passwordWeak);
    assert.equal(passwordField("nonumbersymbol!").error, MESSAGES.passwordWeak);
    assert.equal(passwordField("nonumbersymbol1").error, MESSAGES.passwordWeak);
    assert.equal(passwordField("correct-horse-9").error, null);
    assert.equal(passwordField("correct-horse-9!").error, null);
    assert.equal(passwordField("a".repeat(1015) + "-12345!").error, null);
    assert.equal(passwordField("a".repeat(1025)).error, MESSAGES.passwordWeak);
});

test("consent must be strict true", function () {
    assert.equal(consentField(true).error, null);
    assert.equal(consentField("true").error, MESSAGES.consent);
    assert.equal(consentField(1).error, MESSAGES.consent);
    assert.equal(consentField(false).error, MESSAGES.consent);
    assert.equal(consentField(undefined).error, MESSAGES.consent);
});

test("validateRegistration collects one message per field", function () {
    const result = validateRegistration({
        name: " ",
        email: "not-an-email",
        password: "weak",
        consent: false
    });

    assert.deepEqual(Object.keys(result.fields).sort(), ["consent", "email", "name", "password"]);
    assert.equal(result.fields.name, MESSAGES.name);
    assert.equal(result.fields.email, MESSAGES.emailInvalid);
    assert.equal(result.fields.password, MESSAGES.passwordWeak);
    assert.equal(result.fields.consent, MESSAGES.consent);

    const valid = validateRegistration({
        name: " Alex Morgan ",
        email: " Alex@Example.COM ",
        password: "correct-horse-9!",
        consent: true
    });

    assert.deepEqual(valid.fields, {});
    assert.equal(valid.values.name, "Alex Morgan");
    assert.equal(valid.values.email, "alex@example.com");
});

test("validateLogin needs an email and a password and keeps remember strict", function () {
    const empty = validateLogin({});

    assert.equal(empty.fields.email, MESSAGES.emailEmpty);
    assert.equal(empty.fields.password, MESSAGES.passwordEmpty);
    assert.equal(empty.values.remember, false);

    const remember = validateLogin({
        email: "alex@example.com",
        password: "x",
        remember: "true"
    });

    assert.deepEqual(remember.fields, {});
    assert.equal(remember.values.remember, false);

    const strict = validateLogin({
        email: "alex@example.com",
        password: "x",
        remember: true
    });

    assert.equal(strict.values.remember, true);
});
