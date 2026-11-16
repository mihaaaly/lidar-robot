"use strict";

/* ------------------------------------------------------------------
   Server-side validation shared with the auth API.

   The messages match the frontend (src/auth.js) so a server-side error
   can be rendered in the same field error slots.
   ------------------------------------------------------------------ */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const EMAIL_MAX_LENGTH = 254;
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 80;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 1024;

const MESSAGES = {
    name: "Enter your name.",
    emailEmpty: "Enter your email address.",
    emailInvalid: "Enter a valid email address.",
    passwordEmpty: "Enter your password.",
    passwordWeak: "Use at least 12 characters, including a number and a symbol.",
    consent: "Accept the Terms of Service and Privacy Policy to continue."
};

function normalizeEmail(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim().toLowerCase();
}

function normalizeName(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim();
}

function emailField(value) {
    const email = normalizeEmail(value);

    if (!email) {
        return { value: email, error: MESSAGES.emailEmpty };
    }

    if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
        return { value: email, error: MESSAGES.emailInvalid };
    }

    return { value: email, error: null };
}

function nameField(value) {
    const name = normalizeName(value);

    if (
        name.length < NAME_MIN_LENGTH ||
        name.length > NAME_MAX_LENGTH ||
        CONTROL_CHARS.test(name)
    ) {
        return { value: name, error: MESSAGES.name };
    }

    return { value: name, error: null };
}

function passwordField(value) {
    const password = typeof value === "string" ? value : "";

    if (!password) {
        return { value: password, error: MESSAGES.passwordEmpty };
    }

    if (
        password.length < PASSWORD_MIN_LENGTH ||
        password.length > PASSWORD_MAX_LENGTH ||
        !/\d/.test(password) ||
        !/[^A-Za-z0-9]/.test(password)
    ) {
        return { value: password, error: MESSAGES.passwordWeak };
    }

    return { value: password, error: null };
}

function consentField(value) {
    if (value !== true) {
        return { value: false, error: MESSAGES.consent };
    }

    return { value: true, error: null };
}

function validateRegistration(input) {
    const body = input && typeof input === "object" ? input : {};
    const name = nameField(body.name);
    const email = emailField(body.email);
    const password = passwordField(body.password);
    const consent = consentField(body.consent);
    const fields = {};

    if (name.error) {
        fields.name = name.error;
    }

    if (email.error) {
        fields.email = email.error;
    }

    if (password.error) {
        fields.password = password.error;
    }

    if (consent.error) {
        fields.consent = consent.error;
    }

    return {
        fields: fields,
        values: {
            name: name.value,
            email: email.value,
            password: password.value,
            consent: consent.value
        }
    };
}

function validateLogin(input) {
    const body = input && typeof input === "object" ? input : {};
    const email = emailField(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    const fields = {};

    if (email.error) {
        fields.email = email.error;
    }

    if (!password) {
        fields.password = MESSAGES.passwordEmpty;
    }

    return {
        fields: fields,
        values: {
            email: email.value,
            password: password,
            remember: body.remember === true
        }
    };
}

module.exports = {
    CONTROL_CHARS,
    EMAIL_MAX_LENGTH,
    EMAIL_PATTERN,
    MESSAGES,
    NAME_MAX_LENGTH,
    NAME_MIN_LENGTH,
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    consentField,
    emailField,
    nameField,
    normalizeEmail,
    normalizeName,
    passwordField,
    validateLogin,
    validateRegistration
};
