import { auth } from './firebase-config.js';
import { verifyPasswordResetCode, confirmPasswordReset } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Grab the "oobCode" parameter from the URL. 
    // Example URL from Firebase email: https://your-domain.com/reset-password.html?mode=resetPassword&oobCode=XXXXX
    const urlParams = new URLSearchParams(window.location.search);
    const actionCode = urlParams.get('oobCode');
    const mode = urlParams.get('mode');
    const statusMessage = document.getElementById('status-message');
    const form = document.getElementById('reset-password-form');
    const submitBtn = document.getElementById('submit-btn');

    if (mode !== 'resetPassword' || !actionCode) {
        // Missing code or wrong mode; hide form and show error
        form.querySelector('.form-group').style.display = 'none';
        submitBtn.style.display = 'none';
        statusMessage.style.display = 'block';
        statusMessage.style.color = 'var(--danger)';
        statusMessage.innerHTML = '<strong>Error:</strong> Invalid or missing password reset code in the URL. Please use the exact link provided in your email.';
        return;
    }

    try {
        // Verify the code is valid/not expired before letting them type
        await verifyPasswordResetCode(auth, actionCode);
    } catch (error) {
        form.querySelector('.form-group').style.display = 'none';
        submitBtn.style.display = 'none';
        statusMessage.style.display = 'block';
        statusMessage.style.color = 'var(--danger)';
        statusMessage.innerHTML = '<strong>Error:</strong> This password reset link has expired or has already been used. Please request a new one.';
        console.error("verifyPasswordResetCode error:", error);
    }

    // Handle Form Submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPassword = document.getElementById('new-password').value;

        submitBtn.disabled = true;
        submitBtn.textContent = "Updating...";
        statusMessage.style.display = 'none';

        try {
            await confirmPasswordReset(auth, actionCode, newPassword);

            // Success
            statusMessage.style.display = 'block';
            statusMessage.style.color = 'var(--success)';
            statusMessage.innerHTML = '<strong>Success!</strong> Your password has been reset. You can now log in with your new password.';

            setTimeout(() => {
                window.location.href = "login.html";
            }, 3000);

        } catch (error) {
            statusMessage.style.display = 'block';
            statusMessage.style.color = 'var(--danger)';
            statusMessage.innerHTML = '<strong>Error:</strong> ' + error.message;
            submitBtn.disabled = false;
            submitBtn.textContent = "Update Password";
        }
    });

    // Handle Password Visibility Toggles
    const toggleBtns = document.querySelectorAll('.password-toggle-btn');
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            const wrapper = this.closest('.password-input-group');
            const passwordField = wrapper.querySelector('input');
            const isPassword = passwordField.getAttribute('type') === 'password';
            const newType = isPassword ? 'text' : 'password';
            passwordField.setAttribute('type', newType);

            if (wrapper) {
                if (isPassword) {
                    wrapper.classList.remove('is-hidden');
                    this.setAttribute('aria-label', 'Hide password');
                } else {
                    wrapper.classList.add('is-hidden');
                    this.setAttribute('aria-label', 'Show password');
                }
            }
        });
    });

    // Password Validation Logic
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const reqLength = document.getElementById('req-length');
    const reqCapital = document.getElementById('req-capital');
    const reqNumber = document.getElementById('req-number');
    const matchMessage = document.getElementById('match-message');

    function checkPasswordValidity() {
        const pass = newPasswordInput.value;
        const confirmPass = confirmPasswordInput.value;
        let isValid = true;

        // Length Check
        if (pass.length >= 6) {
            reqLength.classList.add('valid');
            reqLength.classList.remove('invalid');
            reqLength.querySelector('i').className = 'fas fa-check-circle';
        } else {
            reqLength.classList.add('invalid');
            reqLength.classList.remove('valid');
            reqLength.querySelector('i').className = 'fas fa-circle';
            isValid = false;
        }

        // Capital Check
        if (/[A-Z]/.test(pass)) {
            reqCapital.classList.add('valid');
            reqCapital.classList.remove('invalid');
            reqCapital.querySelector('i').className = 'fas fa-check-circle';
        } else {
            reqCapital.classList.add('invalid');
            reqCapital.classList.remove('valid');
            reqCapital.querySelector('i').className = 'fas fa-circle';
            isValid = false;
        }

        // Number Check
        if (/[0-9]/.test(pass)) {
            reqNumber.classList.add('valid');
            reqNumber.classList.remove('invalid');
            reqNumber.querySelector('i').className = 'fas fa-check-circle';
        } else {
            reqNumber.classList.add('invalid');
            reqNumber.classList.remove('valid');
            reqNumber.querySelector('i').className = 'fas fa-circle';
            isValid = false;
        }

        // Confirm Password Match Check
        if (confirmPass.length > 0) {
            if (pass !== confirmPass) {
                matchMessage.style.display = 'block';
                matchMessage.textContent = 'Passwords do not match.';
                confirmPasswordInput.classList.add('error');
                confirmPasswordInput.classList.remove('success');
                isValid = false;
            } else {
                matchMessage.style.display = 'none';
                matchMessage.textContent = '';
                confirmPasswordInput.classList.remove('error');
                confirmPasswordInput.classList.add('success');
            }
        } else {
            matchMessage.style.display = 'none';
            confirmPasswordInput.classList.remove('error', 'success');
            isValid = false; // Require confirm pass filled
        }

        // Only allow enabling if both are filled and all valid
        if (pass.length === 0 || confirmPass.length === 0) {
            isValid = false;
        }

        submitBtn.disabled = !isValid;
    }

    newPasswordInput.addEventListener('input', checkPasswordValidity);
    confirmPasswordInput.addEventListener('input', checkPasswordValidity);
});
