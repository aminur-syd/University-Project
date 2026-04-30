import { auth, db } from './firebase-config.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile,
    sendPasswordResetEmail,
    sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    doc,
    setDoc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const logoutBtn = document.getElementById('logout-btn');
const emailLoginSubmit = document.getElementById('email-login-submit');
const emailAuthSection = document.getElementById('email-auth-section');
const forgotPasswordLink = document.getElementById('forgot-password-link');
const forgotPasswordSection = document.getElementById('forgot-password-section');
const backToLoginBtn = document.getElementById('back-to-login-btn');
const resetPasswordBtn = document.getElementById('reset-password-btn');
const resetMessage = document.getElementById('reset-message');
const authLinks = document.getElementById('auth-links');
const userLinks = document.getElementById('user-links');
const turnstileGate = document.getElementById('turnstile-gate');
const turnstileWidget = document.getElementById('turnstile-widget');
const turnstileMessage = document.getElementById('turnstile-message');
const requiresTurnstile = Boolean(turnstileGate && turnstileWidget && (loginForm || registerForm));

const actionCodeSettings = {
    url: `${window.location.origin}/action`,
    handleCodeInApp: false
};

const TURNSTILE_CONFIG_ENDPOINT = '/api/turnstile/config';
const TURNSTILE_VERIFY_ENDPOINT = '/api/turnstile/verify';
let turnstileWidgetId = null;
let turnstileToken = '';
let turnstileReadyPromise = null;

function getDashboardPath(role = 'user') {
    if (role === 'admin') return '/admin/dashboard';
    if (role === 'staff') return '/staff/dashboard';
    return '/user/dashboard';
}

function setHidden(element, hidden) {
    if (element) {
        element.hidden = hidden;
    }
}

function setMessage(element, message, type = 'error') {
    if (!element) return;

    element.textContent = message;
    element.classList.remove('form-message--error', 'form-message--success');

    if (!message) {
        element.hidden = true;
        return;
    }

    element.hidden = false;
    element.classList.add(type === 'success' ? 'form-message--success' : 'form-message--error');
}

function setTurnstileMessage(message, type = 'error') {
    if (!turnstileMessage) return;

    turnstileMessage.textContent = message;
    turnstileMessage.classList.remove('form-message--error', 'form-message--success');

    if (!message) {
        turnstileMessage.hidden = true;
        return;
    }

    turnstileMessage.hidden = false;
    turnstileMessage.classList.add(type === 'success' ? 'form-message--success' : 'form-message--error');
}

function getAuthMessageElement() {
    return document.getElementById('login-error') || document.getElementById('register-error');
}

function waitForTurnstileApi() {
    return new Promise((resolve, reject) => {
        if (window.turnstile?.render) {
            resolve(window.turnstile);
            return;
        }

        let attempts = 0;
        const intervalId = window.setInterval(() => {
            attempts += 1;

            if (window.turnstile?.render) {
                window.clearInterval(intervalId);
                resolve(window.turnstile);
                return;
            }

            if (attempts >= 100) {
                window.clearInterval(intervalId);
                reject(new Error('Human verification could not be loaded. Please refresh the page.'));
            }
        }, 100);
    });
}

async function ensureTurnstileReady() {
    if (!requiresTurnstile) {
        return;
    }

    if (turnstileReadyPromise) {
        return turnstileReadyPromise;
    }

    turnstileReadyPromise = (async () => {
        const configResponse = await fetch(TURNSTILE_CONFIG_ENDPOINT, {
            headers: {
                Accept: 'application/json'
            }
        });
        const configPayload = await configResponse.json().catch(() => ({}));

        if (!configResponse.ok || !configPayload.siteKey || !configPayload.configured) {
            throw new Error(configPayload.error || 'Human verification needs Cloudflare Turnstile keys on the server.');
        }

        const turnstile = await waitForTurnstileApi();

        if (turnstileWidgetId !== null) {
            return;
        }

        turnstileWidgetId = turnstile.render(turnstileWidget, {
            sitekey: configPayload.siteKey,
            theme: 'light',
            size: 'flexible',
            callback(token) {
                turnstileToken = token;
                setTurnstileMessage('');
            },
            'expired-callback'() {
                turnstileToken = '';
                setTurnstileMessage('Human verification expired. Please verify again.');
            },
            'error-callback'() {
                turnstileToken = '';
                setTurnstileMessage('Human verification failed to load. Please try again.');
            },
            'timeout-callback'() {
                turnstileToken = '';
                setTurnstileMessage('Human verification timed out. Please try again.');
            }
        });
    })();

    return turnstileReadyPromise;
}

function resetTurnstile(clearMessage = true) {
    turnstileToken = '';

    if (window.turnstile?.reset && turnstileWidgetId !== null) {
        try {
            window.turnstile.reset(turnstileWidgetId);
        } catch (error) {
            console.error('Could not reset Turnstile widget:', error);
        }
    }

    if (clearMessage) {
        setTurnstileMessage('');
    }
}

async function verifyTurnstileBeforeAuth(messageElement = getAuthMessageElement()) {
    if (!requiresTurnstile) {
        return true;
    }

    try {
        await ensureTurnstileReady();
    } catch (error) {
        const message = error.message || 'Human verification is not available. Please try again later.';
        setTurnstileMessage(message);
        setMessage(messageElement, message);
        return false;
    }

    if (!turnstileToken) {
        const message = 'Please verify that you are human.';
        setTurnstileMessage(message);
        setMessage(messageElement, message);
        return false;
    }

    try {
        const verificationResponse = await fetch(TURNSTILE_VERIFY_ENDPOINT, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                token: turnstileToken
            })
        });
        const verificationPayload = await verificationResponse.json().catch(() => ({}));

        resetTurnstile();

        if (!verificationResponse.ok || !verificationPayload.ok) {
            throw new Error(verificationPayload.error || 'Human verification failed. Please try again.');
        }

        return true;
    } catch (error) {
        resetTurnstile(false);
        const message = error.message || 'Human verification failed. Please try again.';
        setTurnstileMessage(message);
        setMessage(messageElement, message);
        return false;
    }
}

async function runWithButtonLock(button, busyLabel, callback) {
    if (!button) {
        return callback();
    }

    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = busyLabel;

    try {
        return await callback();
    } finally {
        button.disabled = false;
        button.innerHTML = originalHtml;
    }
}

function getResolvedUserName(user, userData = null) {
    let name = user?.displayName || '';

    if (userData?.name) {
        name = userData.name;
    }

    if (!name && user?.email) {
        name = user.email.split('@')[0];
        name = name.charAt(0).toUpperCase() + name.slice(1);
    }

    return name || 'User';
}

function togglePasswordVisibility(button, input) {
    const isPassword = input.getAttribute('type') === 'password';
    input.setAttribute('type', isPassword ? 'text' : 'password');

    const wrapper = button.closest('.password-input-group');
    if (wrapper) {
        wrapper.classList.toggle('is-hidden', !isPassword);
    }

    button.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
}

function setupPasswordToggle(buttonId, inputId) {
    const toggleButton = document.getElementById(buttonId);
    const passwordInput = document.getElementById(inputId);

    if (!toggleButton || !passwordInput) {
        return;
    }

    toggleButton.addEventListener('click', () => {
        togglePasswordVisibility(toggleButton, passwordInput);
    });
}

if (requiresTurnstile) {
    ensureTurnstileReady().catch((error) => {
        const message = error.message || 'Human verification is not available. Please try again later.';
        setTurnstileMessage(message);
    });
}

if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (event) => {
        event.preventDefault();
        setHidden(emailAuthSection, true);
        setHidden(forgotPasswordSection, false);
        setHidden(turnstileGate, true);
        setHidden(emailLoginSubmit, true);
        setMessage(resetMessage, '');
        setTurnstileMessage('');

        const authHeaderCopy = document.querySelector('.auth-header p');
        if (authHeaderCopy) {
            authHeaderCopy.textContent = 'Reset your password';
        }
    });
}

if (backToLoginBtn) {
    backToLoginBtn.addEventListener('click', () => {
        setHidden(forgotPasswordSection, true);
        setHidden(emailAuthSection, false);
        setHidden(turnstileGate, false);
        setHidden(emailLoginSubmit, false);
        setMessage(resetMessage, '');
        setTurnstileMessage('');

        const authHeaderCopy = document.querySelector('.auth-header p');
        if (authHeaderCopy) {
            authHeaderCopy.textContent = 'Login to your account';
        }

    });
}

if (resetPasswordBtn) {
    resetPasswordBtn.addEventListener('click', async () => {
        const email = document.getElementById('reset-email').value.trim();
        setMessage(resetMessage, '');

        if (!email) {
            setMessage(resetMessage, 'Please enter your email address.');
            return;
        }

        resetPasswordBtn.disabled = true;
        resetPasswordBtn.textContent = 'Sending...';

        try {
            await sendPasswordResetEmail(auth, email, actionCodeSettings);
            setMessage(resetMessage, 'Password reset email sent! Check your inbox.', 'success');
        } catch (error) {
            console.error('Error sending reset email:', error);

            if (error.code === 'auth/user-not-found') {
                setMessage(resetMessage, 'No account found with this email.');
            } else if (error.code === 'auth/invalid-email') {
                setMessage(resetMessage, 'Invalid email address.');
            } else {
                setMessage(resetMessage, 'Error: ' + error.message);
            }
        } finally {
            resetPasswordBtn.disabled = false;
            resetPasswordBtn.textContent = 'Send Reset Link';
        }
    });
}

if (registerForm) {
    const validateField = (input, condition, message, errorId) => {
        const errorElement = document.getElementById(errorId);

        if (!condition) {
            input.classList.add('error');
            input.classList.remove('success');
            if (errorElement) {
                errorElement.textContent = message;
                errorElement.hidden = false;
            }
            return false;
        }

        input.classList.remove('error');
        input.classList.add('success');
        if (errorElement) {
            errorElement.textContent = '';
            errorElement.hidden = true;
        }
        return true;
    };

    ['name', 'email', 'phone', 'address', 'city', 'zip'].forEach((id) => {
        const input = document.getElementById(id);
        if (!input) return;

        input.addEventListener('blur', () => {
            if (id === 'name') validateField(input, input.value.trim().split(' ').length >= 2, 'Please enter your full name (First and Last name).', 'name-error');
            if (id === 'email') validateField(input, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value), 'Please enter a valid email address.', 'email-error');
            if (id === 'phone') validateField(input, /^\d{11}$/.test(input.value), 'Phone number must be exactly 11 digits (e.g. 01xxxxxxxxx).', 'phone-error');
            if (id === 'address') validateField(input, input.value.length > 5, 'Address is too short.', 'address-error');
            if (id === 'city') validateField(input, input.value.length > 2, 'City name is too short.', 'city-error');
            if (id === 'zip') validateField(input, input.value.length >= 4, 'Invalid Zip Code.', 'zip-error');
        });
    });

    const passwordInput = document.getElementById('password');
    const passwordRequirements = document.getElementById('password-requirements');
    const reqLength = document.getElementById('req-length');
    const reqCapital = document.getElementById('req-capital');
    const reqNumber = document.getElementById('req-number');

    function updateRequirementState(element, isValid) {
        element.classList.toggle('valid', isValid);
        element.classList.toggle('invalid', !isValid);
        element.querySelector('i').className = isValid ? 'fas fa-check-circle' : 'fas fa-circle';
    }

    if (passwordInput && passwordRequirements && reqLength && reqCapital && reqNumber) {
        passwordInput.addEventListener('input', () => {
            const value = passwordInput.value;

            if (!value) {
                passwordRequirements.classList.remove('password-requirements--visible');
                passwordInput.classList.remove('error', 'success');
                return;
            }

            const isLengthValid = value.length >= 6;
            const isCapitalValid = /[A-Z]/.test(value);
            const isNumberValid = /\d/.test(value);
            const isAllValid = isLengthValid && isCapitalValid && isNumberValid;

            updateRequirementState(reqLength, isLengthValid);
            updateRequirementState(reqCapital, isCapitalValid);
            updateRequirementState(reqNumber, isNumberValid);

            passwordRequirements.classList.toggle('password-requirements--visible', !isAllValid);
            passwordInput.classList.toggle('error', !isAllValid);
            passwordInput.classList.toggle('success', isAllValid);
        });
    }

    registerForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const name = document.getElementById('name').value.trim();
        const email = document.getElementById('email').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const password = document.getElementById('password').value;
        const address = document.getElementById('address').value.trim();
        const city = document.getElementById('city').value.trim();
        const zip = document.getElementById('zip').value.trim();
        const registerError = document.getElementById('register-error');

        setMessage(registerError, '');

        let isValid = true;
        if (!validateField(document.getElementById('name'), name.split(' ').length >= 2, 'Please enter your full name.', 'name-error')) isValid = false;
        if (!validateField(document.getElementById('email'), /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Invalid email.', 'email-error')) isValid = false;
        if (!validateField(document.getElementById('phone'), /^\d{11}$/.test(phone), 'Phone number must be exactly 11 digits.', 'phone-error')) isValid = false;
        if (!validateField(document.getElementById('address'), address.length > 5, 'Address is too short.', 'address-error')) isValid = false;
        if (!validateField(document.getElementById('city'), city.length > 2, 'City name is too short.', 'city-error')) isValid = false;
        if (!validateField(document.getElementById('zip'), zip.length >= 4, 'Invalid Zip Code.', 'zip-error')) isValid = false;

        if (!/^(?=.*[A-Z])(?=.*\d).{6,}$/.test(password)) {
            isValid = false;
            document.getElementById('password').classList.add('error');
            if (passwordRequirements) {
                passwordRequirements.classList.add('password-requirements--visible');
            }
        }

        if (!isValid) {
            return;
        }

        const submitButton = event.submitter || registerForm.querySelector('button[type="submit"]');
        await runWithButtonLock(submitButton, 'Creating Account...', async () => {
            if (!(await verifyTurnstileBeforeAuth(registerError))) {
                return;
            }

            try {
                const credential = await createUserWithEmailAndPassword(auth, email, password);
                const user = credential.user;

                await updateProfile(user, { displayName: name });
                await setDoc(doc(db, 'users', user.uid), {
                    name,
                    email,
                    phone,
                    role: 'user',
                    address,
                    city,
                    zip,
                    createdAt: new Date()
                }, { merge: true });
                await sendEmailVerification(user, actionCodeSettings);

                registerForm.hidden = true;
                setHidden(turnstileGate, true);
                const authHeaderCopy = document.querySelector('.auth-header p');
                if (authHeaderCopy) {
                    authHeaderCopy.textContent = 'Verification Required';
                }

                const successCard = document.createElement('div');
                successCard.className = 'auth-success';
                successCard.innerHTML = `
                    <i class="fas fa-envelope-open-text auth-success__icon"></i>
                    <h3 class="auth-success__title">Check your email!</h3>
                    <p class="auth-success__copy">We've sent a verification link to <strong>${email}</strong>. Please click the link to activate your account before logging in.</p>
                    <a href="/login" class="btn btn-primary w-full">Go to Login</a>
                `;
                registerForm.parentNode.insertBefore(successCard, registerForm.nextSibling);
            } catch (error) {
                if (error.code === 'auth/email-already-in-use') {
                    setMessage(registerError, 'This email is already registered.');
                } else if (error.code === 'auth/operation-not-allowed') {
                    setMessage(registerError, 'Email/Password sign-up is disabled in Firebase Console. Please enable it in authentication methods.');
                } else {
                    setMessage(registerError, 'Error: ' + error.message);
                }
            }
        });
    });
}

if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const loginError = document.getElementById('login-error');
        const submitButton = event.submitter || emailLoginSubmit || loginForm.querySelector('button[type="submit"]');

        setMessage(loginError, '');

        await runWithButtonLock(submitButton, 'Logging in...', async () => {
            if (!(await verifyTurnstileBeforeAuth(loginError))) {
                return;
            }

            try {
                const credential = await signInWithEmailAndPassword(auth, email, password);
                const user = credential.user;

                if (!user.emailVerified) {
                    await signOut(auth);
                    loginError.hidden = false;
                    loginError.classList.remove('form-message--success');
                    loginError.classList.add('form-message--error');
                    loginError.innerHTML = `
                        Please verify your email address before logging in.<br>
                        <button id="resend-verification" class="inline-link-button" type="button">Resend Verification Link</button>
                    `;

                    const resendButton = document.getElementById('resend-verification');
                    if (resendButton) {
                        resendButton.addEventListener('click', async () => {
                            await runWithButtonLock(resendButton, 'Sending...', async () => {
                                if (!(await verifyTurnstileBeforeAuth(null))) {
                                    return;
                                }

                                try {
                                    const tempCredential = await signInWithEmailAndPassword(auth, email, password);
                                    await sendEmailVerification(tempCredential.user, actionCodeSettings);
                                    await signOut(auth);
                                    setMessage(loginError, 'Verification link resent successfully. Check your inbox.', 'success');
                                } catch (error) {
                                    setMessage(loginError, 'Error resending link: ' + error.message);
                                }
                            });
                        });
                    }

                    return;
                }

                const userDoc = await getDoc(doc(db, 'users', user.uid));
                if (userDoc.exists()) {
                    const role = userDoc.data().role;
                    window.location.href = getDashboardPath(role);
                } else {
                    window.location.href = getDashboardPath();
                }
            } catch (error) {
                console.error(error);

                if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                    setMessage(loginError, 'Incorrect email or password. Please try again.');
                } else if (error.code === 'auth/too-many-requests') {
                    setMessage(loginError, 'Too many failed attempts. Please try again later or reset your password.');
                } else if (error.code === 'auth/user-disabled') {
                    setMessage(loginError, 'This account has been disabled. Please contact support.');
                } else {
                    setMessage(loginError, 'Login failed: ' + error.message);
                }
            }
        });
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try {
            await signOut(auth);
            const path = window.location.pathname;

            if (path.includes('/user/') || path.includes('/staff/') || path.includes('/admin/')) {
                window.location.href = '/';
            } else {
                window.location.reload();
            }
        } catch (error) {
            console.error('Logout error:', error);
        }
    });
}

onAuthStateChanged(auth, async (user) => {
    const userNameLabel = document.getElementById('user-name');

    if ((authLinks && userLinks) || userNameLabel) {
        if (user) {
            if (authLinks && userLinks) {
                setHidden(authLinks, true);
                setHidden(userLinks, false);
            }

            const welcomeMsg = document.getElementById('welcome-msg');
            const dashboardLink = document.getElementById('dashboard-link');

            if (welcomeMsg || dashboardLink || userNameLabel) {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                let role = 'user';
                let userData = null;

                if (userDoc.exists()) {
                    userData = userDoc.data();
                    role = userData.role;
                }

                const name = getResolvedUserName(user, userData);

                if (welcomeMsg) welcomeMsg.textContent = `Welcome, ${name}`;
                if (dashboardLink) dashboardLink.href = getDashboardPath(role);
                if (userNameLabel) userNameLabel.textContent = name;
            }
        } else if (authLinks && userLinks) {
            setHidden(authLinks, false);
            setHidden(userLinks, true);
        }
    }

    const path = window.location.pathname;
    if (path.includes('/user/') || path.includes('/staff/') || path.includes('/admin/')) {
        if (!user) {
            window.location.href = '/login';
            return;
        }

        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
            const role = userDoc.data().role;

            if (path.includes('/admin/') && role !== 'admin') {
                window.location.href = '/';
            } else if (path.includes('/staff/') && role !== 'staff' && role !== 'admin') {
                window.location.href = '/';
            }
        }
    }
});

setupPasswordToggle('toggle-password', 'password');
