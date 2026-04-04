import { auth } from './firebase-config.js';
import {
    applyActionCode,
    verifyPasswordResetCode,
    confirmPasswordReset
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const statusIcon = document.getElementById('status-icon');
const statusTitle = document.getElementById('status-title');
const statusMessage = document.getElementById('status-message');
const actionContent = document.getElementById('action-content');
const primaryBtn = document.getElementById('primary-btn');
const secondaryBtn = document.getElementById('secondary-btn');

const urlParams = new URLSearchParams(window.location.search);
const mode = urlParams.get('mode');
const actionCode = urlParams.get('oobCode');

function setIcon(type) {
    if (!statusIcon) return;

    if (type === 'loading') {
        statusIcon.className = 'status-icon status-loading';
        statusIcon.innerHTML = '<i class="fas fa-circle-notch"></i>';
        return;
    }

    if (type === 'success') {
        statusIcon.className = 'status-icon status-success';
        statusIcon.innerHTML = '<i class="fas fa-check-circle"></i>';
        return;
    }

    if (type === 'form') {
        statusIcon.className = 'status-icon status-form';
        statusIcon.innerHTML = '<i class="fas fa-key"></i>';
        return;
    }

    statusIcon.className = 'status-icon status-error';
    statusIcon.innerHTML = '<i class="fas fa-exclamation-circle"></i>';
}

function setButton(buttonElement, config, extraClass = '') {
    if (!buttonElement) return;

    buttonElement.className = `btn ${extraClass}`.trim();

    if (!config) {
        buttonElement.hidden = true;
        buttonElement.removeAttribute('href');
        buttonElement.textContent = '';
        return;
    }

    buttonElement.hidden = false;
    buttonElement.textContent = config.label;
    buttonElement.href = config.href;
}

function setStatus({ type, title, message, primary, secondary }) {
    setIcon(type);
    if (statusTitle) statusTitle.textContent = title;
    if (statusMessage) statusMessage.textContent = message;
    setButton(primaryBtn, primary, 'btn-primary');
    setButton(secondaryBtn, secondary, 'btn-outline-dark action-button-secondary');
}

function setInlineStatus(element, message, type = 'error') {
    if (!element) return;

    element.textContent = message;
    element.hidden = !message;
    element.classList.remove('status-message--error', 'status-message--success');

    if (message) {
        element.classList.add(type === 'success' ? 'status-message--success' : 'status-message--error');
    }
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

function setupPasswordToggles(container) {
    container.querySelectorAll('.password-toggle-btn').forEach((button) => {
        button.addEventListener('click', () => {
            const wrapper = button.closest('.password-input-group');
            const passwordField = wrapper ? wrapper.querySelector('input') : null;
            if (passwordField) {
                togglePasswordVisibility(button, passwordField);
            }
        });
    });
}

function mapActionError(error, fallbackMessage) {
    if (!error || !error.code) {
        return fallbackMessage;
    }

    if (error.code === 'auth/invalid-action-code' || error.code === 'auth/expired-action-code') {
        return 'This link is invalid or expired. Please request a new email link and try again.';
    }

    if (error.code === 'auth/user-disabled') {
        return 'This account is disabled. Please contact support for assistance.';
    }

    return fallbackMessage;
}

function mapResetSubmitError(error) {
    if (!error || !error.code) {
        return 'Unable to reset your password right now. Please try again.';
    }

    if (error.code === 'auth/weak-password') {
        return 'Password is too weak. Use at least 6 characters, one capital letter, and one number.';
    }

    if (error.code === 'auth/invalid-action-code' || error.code === 'auth/expired-action-code') {
        return 'This password reset link is invalid or expired. Please request a new one.';
    }

    return 'Unable to reset your password right now. Please try again.';
}

function renderResetForm() {
    if (!actionContent) return;

    actionContent.innerHTML = `
        <form id="reset-password-form">
            <div class="form-group">
                <label for="new-password">New Password</label>
                <div class="password-input-group is-hidden">
                    <input type="password" id="new-password" class="form-control" required>
                    <button type="button" class="password-toggle-btn" aria-label="Show password">
                        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path class="eye-sclera" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle class="eye-iris" cx="12" cy="12" r="3" />
                            <path class="eye-slash" d="M3 3l18 18" />
                        </svg>
                    </button>
                </div>
                <ul class="password-requirements password-requirements--visible" id="password-requirements">
                    <li id="req-length"><i class="fas fa-circle"></i> At least 6 characters</li>
                    <li id="req-capital"><i class="fas fa-circle"></i> One capital letter</li>
                    <li id="req-number"><i class="fas fa-circle"></i> One number</li>
                </ul>
            </div>

            <div class="form-group">
                <label for="confirm-password">Confirm Password</label>
                <div class="password-input-group is-hidden">
                    <input type="password" id="confirm-password" class="form-control" required>
                    <button type="button" class="password-toggle-btn" aria-label="Show password">
                        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path class="eye-sclera" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle class="eye-iris" cx="12" cy="12" r="3" />
                            <path class="eye-slash" d="M3 3l18 18" />
                        </svg>
                    </button>
                </div>
                <div class="status-message status-message--error" id="match-message" hidden></div>
            </div>

            <button type="submit" class="btn btn-primary w-full" id="submit-btn" disabled>Update Password</button>
            <div class="status-message" id="form-status-message" hidden></div>
        </form>
    `;

    const form = document.getElementById('reset-password-form');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const submitBtn = document.getElementById('submit-btn');
    const formStatusMessage = document.getElementById('form-status-message');
    const matchMessage = document.getElementById('match-message');
    const reqLength = document.getElementById('req-length');
    const reqCapital = document.getElementById('req-capital');
    const reqNumber = document.getElementById('req-number');

    setupPasswordToggles(form);

    function updateRequirementState(element, isValid) {
        element.classList.toggle('valid', isValid);
        element.classList.toggle('invalid', !isValid);
        element.querySelector('i').className = isValid ? 'fas fa-check-circle' : 'fas fa-circle';
    }

    function checkPasswordValidity() {
        const password = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        const hasMinLength = password.length >= 6;
        const hasCapital = /[A-Z]/.test(password);
        const hasNumber = /\d/.test(password);

        updateRequirementState(reqLength, hasMinLength);
        updateRequirementState(reqCapital, hasCapital);
        updateRequirementState(reqNumber, hasNumber);

        let isValid = hasMinLength && hasCapital && hasNumber;

        if (!confirmPassword) {
            setInlineStatus(matchMessage, '');
            confirmPasswordInput.classList.remove('error', 'success');
            isValid = false;
        } else if (password !== confirmPassword) {
            setInlineStatus(matchMessage, 'Passwords do not match.');
            confirmPasswordInput.classList.add('error');
            confirmPasswordInput.classList.remove('success');
            isValid = false;
        } else {
            setInlineStatus(matchMessage, '');
            confirmPasswordInput.classList.remove('error');
            confirmPasswordInput.classList.add('success');
        }

        submitBtn.disabled = !isValid;
    }

    newPasswordInput.addEventListener('input', checkPasswordValidity);
    confirmPasswordInput.addEventListener('input', checkPasswordValidity);

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        submitBtn.disabled = true;
        submitBtn.textContent = 'Updating...';
        setInlineStatus(formStatusMessage, '');

        try {
            await confirmPasswordReset(auth, actionCode, newPasswordInput.value);
            actionContent.innerHTML = '';
            setStatus({
                type: 'success',
                title: 'Password Updated',
                message: 'Your password has been reset successfully. You can now sign in.',
                primary: { label: 'Go to Login', href: 'login.html' }
            });

            window.setTimeout(() => {
                window.location.href = 'login.html';
            }, 3000);
        } catch (error) {
            setInlineStatus(formStatusMessage, mapResetSubmitError(error));
            submitBtn.disabled = false;
            submitBtn.textContent = 'Update Password';
        }
    });
}

async function handleVerifyEmail() {
    setStatus({
        type: 'loading',
        title: 'Verifying your email...',
        message: 'Please wait while we confirm your email address.'
    });

    try {
        await applyActionCode(auth, actionCode);
        setStatus({
            type: 'success',
            title: 'Email Verified',
            message: 'Thank you for verifying your email address. Your account is now fully active.',
            primary: { label: 'Go to Login', href: 'login.html' }
        });
    } catch (error) {
        setStatus({
            type: 'error',
            title: 'Verification Failed',
            message: mapActionError(error, 'We could not verify your email. Please request a new verification link.'),
            primary: { label: 'Go to Login', href: 'login.html' },
            secondary: { label: 'Back to Registration', href: 'register.html' }
        });
    }
}

async function handleResetPassword() {
    setStatus({
        type: 'loading',
        title: 'Checking reset link...',
        message: 'Please wait while we validate your password reset link.'
    });

    try {
        await verifyPasswordResetCode(auth, actionCode);
        setStatus({
            type: 'form',
            title: 'Reset Your Password',
            message: 'Enter a new password for your account.',
            secondary: { label: 'Back to Login', href: 'login.html' }
        });
        renderResetForm();
    } catch (error) {
        setStatus({
            type: 'error',
            title: 'Invalid or Expired Link',
            message: mapActionError(error, 'This password reset link is invalid or expired. Please request a new one.'),
            primary: { label: 'Go to Login', href: 'login.html' }
        });
    }
}

function handleUnsupportedAction() {
    setStatus({
        type: 'error',
        title: 'Unsupported Action',
        message: 'This action type is not supported by this page.',
        primary: { label: 'Go to Login', href: 'login.html' }
    });
}

function handleInvalidActionLink() {
    setStatus({
        type: 'error',
        title: 'Invalid Action Link',
        message: 'Missing or invalid action parameters. Please use the link from your email.',
        primary: { label: 'Go to Login', href: 'login.html' },
        secondary: { label: 'Back to Registration', href: 'register.html' }
    });
}

async function init() {
    if (!mode || !actionCode) {
        handleInvalidActionLink();
        return;
    }

    if (mode === 'verifyEmail') {
        await handleVerifyEmail();
        return;
    }

    if (mode === 'resetPassword') {
        await handleResetPassword();
        return;
    }

    handleUnsupportedAction();
}

init();
