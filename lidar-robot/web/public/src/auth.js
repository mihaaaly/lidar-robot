/* ------------------------------------------------------------------
   LiDAR Autonomous Robot · auth screens

   Two modes, selected automatically:

   1. Server mode (local Node backend, `server/`): the form posts to
      /api/auth/login and /api/auth/register; the real session is an
      HttpOnly cookie. The localStorage entry below is only a UX hint.
   2. Static demo mode (the Raspberry Pi deployment / any plain static
      server): any syntactically valid email and any non-empty password
      "signs in". The session is a client-side UX gate, never a security
      control.

   The readable `lidar_backend` cookie marks mode 1; it contains no secret.
   ------------------------------------------------------------------ */
/* global window, document */
(function () {
    "use strict";

    var Session = window.Session;
    var fatal = document.getElementById("auth-fatal");

    if (!Session) {
        if (fatal) {
            fatal.hidden = false;
        }
        return;
    }

    if (window.LIDAR_COOKIES_BLOCKED && fatal) {
        fatal.innerHTML = "<strong>Cookies are blocked.</strong>" +
            "<span>Allow site data for this page to sign in, or leave private mode.</span>";
        fatal.hidden = false;
    }

    var ROUTES = {
        start: "#/auth",
        login: "#/auth/login",
        register: "#/auth/register"
    };

    var VIEWS = {
        start: {
            title: "Sign in · LiDAR Autonomous Robot",
            subtitle: "Secure access to your workspace",
            section: "Authentication",
            route: "/auth",
            controls: false,
            footerLabel: "SECURE ACCESS",
            footerCopy: "Authentication required to continue.",
            footerRight: "LiDAR Autonomous Robot",
            intro: "start",
            panel: "start"
        },
        login: {
            title: "Log in · LiDAR Autonomous Robot",
            subtitle: "Autonomous Robot · Web UI",
            section: "Workspace access",
            route: "/auth/login",
            controls: true,
            footerLabel: "DEMO SESSION",
            footerCopy: "The displayed environment is an illustration.",
            footerRight: "ROS /scan · Live data stream disabled",
            intro: "form",
            panel: "login"
        },
        register: {
            title: "Create account · LiDAR Autonomous Robot",
            subtitle: "Autonomous Robot · Web UI",
            section: "Workspace access",
            route: "/auth/register",
            controls: true,
            footerLabel: "DEMO SESSION",
            footerCopy: "The displayed environment is an illustration.",
            footerRight: "ROS /scan · Live data stream disabled",
            intro: "form",
            panel: "register"
        }
    };

    var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    var TOAST_MS = 5000;

    var els = {
        subtitle: document.getElementById("auth-subtitle"),
        headerControls: document.getElementById("auth-header-controls"),
        modeToggle: document.getElementById("auth-mode-toggle"),
        modeLabel: document.getElementById("auth-mode-label"),
        connectionBadge: document.getElementById("auth-connection-badge"),
        connectionText: document.getElementById("auth-connection-text"),
        section: document.getElementById("auth-section"),
        route: document.getElementById("auth-route"),
        footerLabel: document.getElementById("auth-footer-label"),
        footerCopy: document.getElementById("auth-footer-copy"),
        footerRight: document.getElementById("auth-footer-right"),
        intros: document.querySelectorAll("[data-intro]"),
        columns: document.querySelectorAll("[data-panel]"),
        toast: document.getElementById("auth-stub-note"),
        forgot: document.getElementById("forgot-password"),
        loginForm: document.getElementById("login-form"),
        loginEmail: document.getElementById("login-email"),
        loginEmailError: document.getElementById("login-email-error"),
        loginPassword: document.getElementById("login-password"),
        loginPasswordError: document.getElementById("login-password-error"),
        loginRemember: document.getElementById("login-remember"),
        loginSubmit: document.getElementById("login-submit"),
        loginFormError: document.getElementById("login-form-error"),
        registerForm: document.getElementById("register-form"),
        registerName: document.getElementById("register-name"),
        registerNameError: document.getElementById("register-name-error"),
        registerEmail: document.getElementById("register-email"),
        registerEmailError: document.getElementById("register-email-error"),
        registerPassword: document.getElementById("register-password"),
        registerPasswordError: document.getElementById("register-password-error"),
        registerConfirm: document.getElementById("register-confirm"),
        registerConfirmError: document.getElementById("register-confirm-error"),
        registerConsent: document.getElementById("register-consent"),
        registerConsentError: document.getElementById("register-consent-error"),
        registerSubmit: document.getElementById("register-submit"),
        registerFormError: document.getElementById("register-form-error"),
        strengthMeter: document.querySelector(".auth-strength-meter"),
        strengthLabel: document.getElementById("register-strength-label")
    };

    var toastTimer = null;
    var loginBusy = false;
    var registerBusy = false;
    var backendMode = Session.hasBackend();

    var STORAGE_ERROR = "Your browser blocked storage. Allow site data or leave private mode to sign in.";
    var COOKIE_ERROR = "Your browser blocked cookies. Allow site data or leave private mode to sign in.";
    var SERVICE_ERROR = "Could not reach the authentication service. Try again.";

    function applyBackendCopy() {
        if (!backendMode) {
            return;
        }

        VIEWS.login.footerLabel = "SECURE SESSION";
        VIEWS.login.footerCopy = "Credentials are verified by the authentication service.";
        VIEWS.login.footerRight = "ROS /scan · Live data stream disabled";
        VIEWS.register.footerLabel = "SECURE SESSION";
        VIEWS.register.footerCopy = "Credentials are verified by the authentication service.";
        VIEWS.register.footerRight = "ROS /scan · Live data stream disabled";
    }

    /* ------------------------------------------------------------ Routing */

    function parseHash() {
        var hash = window.location.hash || "";

        if (!hash || hash === "#" || hash === "#/") {
            return "start";
        }

        if (hash === ROUTES.start) {
            return "start";
        }

        if (hash === ROUTES.login) {
            return "login";
        }

        if (hash === ROUTES.register) {
            return "register";
        }

        return null;
    }

    function normalizeHash() {
        try {
            window.history.replaceState(null, "", ROUTES.start);
        } catch (error) {
            window.location.hash = ROUTES.start;
        }
    }

    function visiblePanelTitle(viewKey) {
        var panel = null;
        var i;

        for (i = 0; i < els.columns.length; i += 1) {
            if (els.columns[i].getAttribute("data-panel") === viewKey) {
                panel = els.columns[i];
            }
        }

        return panel ? panel.querySelector(".auth-panel-title") : null;
    }

    function renderRoute(viewKey, moveFocus) {
        var view = VIEWS[viewKey];
        var i;

        document.title = view.title;

        if (els.subtitle) {
            els.subtitle.textContent = view.subtitle;
        }

        els.section.textContent = view.section;
        els.route.textContent = view.route;
        els.footerLabel.textContent = view.footerLabel;
        els.footerCopy.textContent = view.footerCopy;
        els.footerRight.textContent = view.footerRight;
        els.headerControls.hidden = !view.controls;

        for (i = 0; i < els.intros.length; i += 1) {
            els.intros[i].hidden = els.intros[i].getAttribute("data-intro") !== view.intro;
        }

        for (i = 0; i < els.columns.length; i += 1) {
            els.columns[i].hidden = els.columns[i].getAttribute("data-panel") !== view.panel;
        }

        if (moveFocus) {
            var title = visiblePanelTitle(viewKey);

            if (title) {
                title.focus();
            }
        }
    }
    function applyRoute(moveFocus) {
        var viewKey = parseHash();

        if (viewKey === null || viewKey === "start") {
            var hash = window.location.hash || "";

            if (viewKey === null || hash === "" || hash === "#" || hash === "#/") {
                normalizeHash();
            }

            viewKey = "start";
        }

        renderRoute(viewKey, moveFocus);
    }

    window.addEventListener("hashchange", function () {
        applyRoute(true);
    });

    /* ---------------------------------------------------------- Demo mode */

    function applyMode(demoMode) {
        els.modeToggle.setAttribute("aria-checked", String(demoMode));
        els.modeLabel.textContent = demoMode ? "Design / Mock Mode" : "Live Mode";
        els.connectionBadge.classList.toggle("is-live", !demoMode);
        els.connectionText.textContent = demoMode
            ? "Demo mode · No live connection"
            : "Live mode · Connects after sign-in";
    }

    applyMode(Session.getDemoMode());

    els.modeToggle.addEventListener("click", function () {
        var demoMode = els.modeToggle.getAttribute("aria-checked") !== "true";

        Session.setDemoMode(demoMode);
        applyMode(demoMode);
    });

    /* ---------------------------------------------------------- Stub links */

    function showStubNote(message) {
        if (!els.toast) {
            return;
        }

        els.toast.textContent = message;
        els.toast.hidden = false;

        if (toastTimer) {
            window.clearTimeout(toastTimer);
        }

        toastTimer = window.setTimeout(function () {
            els.toast.hidden = true;
        }, TOAST_MS);
    }

    if (els.forgot) {
        els.forgot.addEventListener("click", function () {
            showStubNote("Password recovery is not available in this demo.");
        });
    }

    Array.prototype.forEach.call(document.querySelectorAll("[data-stub]"), function (link) {
        link.addEventListener("click", function (event) {
            event.preventDefault();
            showStubNote(link.getAttribute("title") || "Not available in this demo.");
        });
    });

    /* -------------------------------------------------------- Reveal toggle */

    Array.prototype.forEach.call(document.querySelectorAll(".auth-reveal"), function (button) {
        button.addEventListener("click", function () {
            var input = document.getElementById(button.getAttribute("data-reveal"));
            var revealed;

            if (!input) {
                return;
            }

            revealed = input.type === "password";
            input.type = revealed ? "text" : "password";
            button.setAttribute("aria-pressed", String(revealed));
            button.setAttribute("aria-label", revealed ? "Hide password" : "Show password");
            button.setAttribute("title", revealed ? "Hide password" : "Show password");
        });
    });

    /* ------------------------------------------------------------- Errors */

    function setError(input, errorEl, message) {
        if (!input || !errorEl) {
            return;
        }

        errorEl.textContent = message;
        errorEl.hidden = false;
        input.setAttribute("aria-invalid", "true");
    }

    function clearError(input, errorEl) {
        if (!input || !errorEl) {
            return;
        }

        errorEl.textContent = "";
        errorEl.hidden = true;
        input.removeAttribute("aria-invalid");
    }

    function bindClear(input, errorEl) {
        if (!input) {
            return;
        }

        input.addEventListener("input", function () {
            clearError(input, errorEl);
        });

        input.addEventListener("change", function () {
            clearError(input, errorEl);
        });
    }

    bindClear(els.loginEmail, els.loginEmailError);
    bindClear(els.loginPassword, els.loginPasswordError);
    bindClear(els.registerName, els.registerNameError);
    bindClear(els.registerEmail, els.registerEmailError);
    bindClear(els.registerPassword, els.registerPasswordError);
    bindClear(els.registerConfirm, els.registerConfirmError);
    bindClear(els.registerConsent, els.registerConsentError);

    function showFormError(errorEl, message) {
        if (!errorEl) {
            return;
        }

        errorEl.textContent = message;
        errorEl.hidden = false;
    }

    function clearFormError(errorEl) {
        if (!errorEl) {
            return;
        }

        errorEl.textContent = "";
        errorEl.hidden = true;
    }

    function emailIsValid(value) {
        return EMAIL_PATTERN.test(value);
    }

    function emailLocalPart(email) {
        return email.split("@")[0] || email;
    }

    function passwordIsStrongEnough(value) {
        return value.length >= 12 && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
    }

    /* ------------------------------------------------- Server responses */

    function retryText(result) {
        var seconds = parseInt(result.retryAfter, 10);

        if (!seconds || seconds < 1) {
            return "Too many attempts. Try again later.";
        }

        return "Too many attempts. Try again in " + seconds + " seconds.";
    }

    function setLoginFields(fields) {
        var first = null;

        if (fields.email) {
            setError(els.loginEmail, els.loginEmailError, fields.email);
            first = first || els.loginEmail;
        }

        if (fields.password) {
            setError(els.loginPassword, els.loginPasswordError, fields.password);
            first = first || els.loginPassword;
        }

        if (first) {
            first.focus();
        }

        return !!first;
    }

    function setRegisterFields(fields) {
        var first = null;

        if (fields.name) {
            setError(els.registerName, els.registerNameError, fields.name);
            first = first || els.registerName;
        }

        if (fields.email) {
            setError(els.registerEmail, els.registerEmailError, fields.email);
            first = first || els.registerEmail;
        }

        if (fields.password) {
            setError(els.registerPassword, els.registerPasswordError, fields.password);
            first = first || els.registerPassword;
        }

        if (fields.consent) {
            setError(els.registerConsent, els.registerConsentError, fields.consent);
            first = first || els.registerConsent;
        }

        if (first) {
            first.focus();
        }

        return !!first;
    }

    function handleLoginResult(result) {
        var error = result.data && result.data.error;
        var fields = error && error.fields;

        if (result.status === 400 && fields && setLoginFields(fields)) {
            return;
        }

        if (result.status === 401) {
            setError(els.loginPassword, els.loginPasswordError, "Invalid email or password.");
            els.loginPassword.focus();
            return;
        }

        if (result.status === 429) {
            showFormError(els.loginFormError, retryText(result));
            return;
        }

        showFormError(
            els.loginFormError,
            (error && error.message) || SERVICE_ERROR
        );
    }

    function handleRegisterResult(result) {
        var error = result.data && result.data.error;
        var fields = error && error.fields;

        if (result.status === 400 && fields && setRegisterFields(fields)) {
            return;
        }

        if (result.status === 409) {
            setError(
                els.registerEmail,
                els.registerEmailError,
                "An account with this email already exists."
            );
            els.registerEmail.focus();
            return;
        }

        if (result.status === 429) {
            showFormError(els.registerFormError, retryText(result));
            return;
        }

        showFormError(
            els.registerFormError,
            (error && error.message) || SERVICE_ERROR
        );
    }

    function serverLogin(email, password, remember) {
        Session.api("/api/auth/login", {
            email: email,
            password: password,
            remember: !!remember
        }).then(function (result) {
            var user;

            if (!result.ok) {
                loginBusy = false;
                els.loginSubmit.disabled = false;
                handleLoginResult(result);
                return;
            }

            if (!Session.hasServerHint()) {
                loginBusy = false;
                els.loginSubmit.disabled = false;
                showFormError(els.loginFormError, COOKIE_ERROR);
                return;
            }

            user = result.data && result.data.user
                ? result.data.user
                : { email: email, name: emailLocalPart(email) };

            /* localStorage is only a hint in server mode; the HttpOnly cookie
               is what the server checks. A blocked storage must not block the
               login when cookies work. */
            Session.setSession({ email: user.email, name: user.name }, remember);
            window.location.replace("index.html");
        }, function () {
            loginBusy = false;
            els.loginSubmit.disabled = false;
            showFormError(els.loginFormError, SERVICE_ERROR);
        });
    }

    function demoLogin(email, remember) {
        var name = emailLocalPart(email);

        if (!Session.setSession({ email: email, name: name }, remember)) {
            loginBusy = false;
            els.loginSubmit.disabled = false;
            showFormError(els.loginFormError, STORAGE_ERROR);
            return;
        }

        window.location.replace("index.html");
    }

    function serverRegister(name, email, password) {
        Session.api("/api/auth/register", {
            name: name,
            email: email,
            password: password,
            consent: true
        }).then(function (result) {
            var user;

            if (!result.ok) {
                registerBusy = false;
                els.registerSubmit.disabled = false;
                handleRegisterResult(result);
                return;
            }

            if (!Session.hasServerHint()) {
                registerBusy = false;
                els.registerSubmit.disabled = false;
                showFormError(els.registerFormError, COOKIE_ERROR);
                return;
            }

            user = result.data && result.data.user
                ? result.data.user
                : { email: email, name: name };

            Session.setSession({ email: user.email, name: user.name }, true);
            window.location.replace("index.html");
        }, function () {
            registerBusy = false;
            els.registerSubmit.disabled = false;
            showFormError(els.registerFormError, SERVICE_ERROR);
        });
    }

    function demoRegister(name, email) {
        if (!Session.setSession({ email: email, name: name }, true)) {
            registerBusy = false;
            els.registerSubmit.disabled = false;
            showFormError(els.registerFormError, STORAGE_ERROR);
            return;
        }

        window.location.replace("index.html");
    }

    /* ------------------------------------------------------ Password strength */

    function scorePassword(password) {
        if (!password) {
            return 0;
        }

        if (passwordIsStrongEnough(password)) {
            return 4;
        }

        if (password.length >= 12 && (/\d/.test(password) || /[^A-Za-z0-9]/.test(password))) {
            return 3;
        }

        if (password.length >= 8) {
            return 2;
        }

        return 1;
    }

    var STRENGTH_LABELS = ["", "WEAK", "FAIR", "GOOD", "STRONG"];
    var STRENGTH_TONES = ["", "weak", "fair", "good", "strong"];

    function renderStrength(password) {
        var score = scorePassword(password);

        if (!els.strengthMeter || !els.strengthLabel) {
            return;
        }

        els.strengthMeter.setAttribute("data-score", String(score));
        els.strengthLabel.textContent = STRENGTH_LABELS[score];
        els.strengthLabel.setAttribute("data-tone", STRENGTH_TONES[score]);
    }

    if (els.registerPassword) {
        els.registerPassword.addEventListener("input", function () {
            renderStrength(els.registerPassword.value);
        });

        renderStrength(els.registerPassword.value);
    }

    /* ------------------------------------------------------------- Login */

    els.loginForm.addEventListener("submit", function (event) {
        var email;
        var password;
        var firstInvalid = null;
        var remember;

        event.preventDefault();

        if (loginBusy) {
            return;
        }

        clearFormError(els.loginFormError);
        clearError(els.loginEmail, els.loginEmailError);
        clearError(els.loginPassword, els.loginPasswordError);

        email = els.loginEmail.value.trim();
        password = els.loginPassword.value;

        if (!email) {
            setError(els.loginEmail, els.loginEmailError, "Enter your email address.");
            firstInvalid = firstInvalid || els.loginEmail;
        } else if (!emailIsValid(email)) {
            setError(els.loginEmail, els.loginEmailError, "Enter a valid email address.");
            firstInvalid = firstInvalid || els.loginEmail;
        }

        if (!password) {
            setError(els.loginPassword, els.loginPasswordError, "Enter your password.");
            firstInvalid = firstInvalid || els.loginPassword;
        }

        if (firstInvalid) {
            firstInvalid.focus();
            return;
        }

        remember = els.loginRemember.checked;
        loginBusy = true;
        els.loginSubmit.disabled = true;

        Session.detectBackend().then(function (available) {
            if (available) {
                backendMode = true;
                applyBackendCopy();
                applyRoute(false);
                serverLogin(email, password, remember);
                return;
            }

            /* If the backend marker exists but health check failed, do NOT
               silently fall back to the insecure demo login. */
            if (backendMode) {
                loginBusy = false;
                els.loginSubmit.disabled = false;
                showFormError(els.loginFormError, SERVICE_ERROR);
                return;
            }

            demoLogin(email, remember);
        });
    });

    /* ---------------------------------------------------------- Register */

    els.registerForm.addEventListener("submit", function (event) {
        var name;
        var email;
        var password;
        var confirm;
        var firstInvalid = null;

        event.preventDefault();

        if (registerBusy) {
            return;
        }

        clearFormError(els.registerFormError);
        clearError(els.registerName, els.registerNameError);
        clearError(els.registerEmail, els.registerEmailError);
        clearError(els.registerPassword, els.registerPasswordError);
        clearError(els.registerConfirm, els.registerConfirmError);
        clearError(els.registerConsent, els.registerConsentError);

        name = els.registerName.value.replace(/^\s+|\s+$/g, "");
        email = els.registerEmail.value.trim();
        password = els.registerPassword.value;
        confirm = els.registerConfirm.value;

        if (name.length < 2) {
            setError(els.registerName, els.registerNameError, "Enter your name.");
            firstInvalid = firstInvalid || els.registerName;
        }

        if (!email) {
            setError(els.registerEmail, els.registerEmailError, "Enter your email address.");
            firstInvalid = firstInvalid || els.registerEmail;
        } else if (!emailIsValid(email)) {
            setError(els.registerEmail, els.registerEmailError, "Enter a valid email address.");
            firstInvalid = firstInvalid || els.registerEmail;
        }

        if (!password) {
            setError(els.registerPassword, els.registerPasswordError, "Enter your password.");
            firstInvalid = firstInvalid || els.registerPassword;
        } else if (!passwordIsStrongEnough(password)) {
            setError(
                els.registerPassword,
                els.registerPasswordError,
                "Use at least 12 characters, including a number and a symbol."
            );
            firstInvalid = firstInvalid || els.registerPassword;
        }

        if (!confirm) {
            setError(els.registerConfirm, els.registerConfirmError, "Re-enter your password.");
            firstInvalid = firstInvalid || els.registerConfirm;
        } else if (confirm !== password) {
            setError(els.registerConfirm, els.registerConfirmError, "Passwords do not match.");
            firstInvalid = firstInvalid || els.registerConfirm;
        }

        if (!els.registerConsent.checked) {
            setError(
                els.registerConsent,
                els.registerConsentError,
                "Accept the Terms of Service and Privacy Policy to continue."
            );
            firstInvalid = firstInvalid || els.registerConsent;
        }

        if (firstInvalid) {
            firstInvalid.focus();
            return;
        }

        registerBusy = true;
        els.registerSubmit.disabled = true;

        Session.detectBackend().then(function (available) {
            if (available) {
                backendMode = true;
                applyBackendCopy();
                applyRoute(false);
                serverRegister(name, email, password);
                return;
            }

            if (backendMode) {
                registerBusy = false;
                els.registerSubmit.disabled = false;
                showFormError(els.registerFormError, SERVICE_ERROR);
                return;
            }

            demoRegister(name, email);
        });
    });

    /* -------------------------------------------------------------- Boot */

    applyBackendCopy();
    applyRoute(false);

    Session.detectBackend().then(function (available) {
        if (available) {
            backendMode = true;
            applyBackendCopy();
            applyRoute(false);
        }
    });
})();
