import { auth, db } from './firebase-config.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile,
    GoogleAuthProvider,
    signInWithPopup,
    RecaptchaVerifier,
    signInWithPhoneNumber,
    sendPasswordResetEmail,
    sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    doc,
    setDoc,
    getDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// DOM Elements
const loginForm = document.getElementById('login-form');
const phoneLoginBtn = document.getElementById('phone-login-btn');
const phoneAuthSection = document.getElementById('phone-auth-section');
const emailAuthSection = document.getElementById('email-auth-section');
const sendCodeBtn = document.getElementById('send-code-btn');
const verifyCodeBtn = document.getElementById('verify-code-btn');
const recaptchaContainer = document.getElementById('recaptcha-container');

if (phoneLoginBtn) {
    phoneLoginBtn.addEventListener('click', () => {
        if (phoneAuthSection.style.display === 'none') {
            phoneAuthSection.style.display = 'block';
            emailAuthSection.style.display = 'none';
            phoneLoginBtn.innerHTML = '<i class="fas fa-envelope"></i> Login with Email';

            if (!window.recaptchaVerifier) {
                window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
                    'size': 'normal'
                });
                window.recaptchaVerifier.render();
            }
        } else {
            phoneAuthSection.style.display = 'none';
            emailAuthSection.style.display = 'block';
            phoneLoginBtn.innerHTML = '<i class="fas fa-phone"></i> Login with Phone';
        }
    });
}

if (sendCodeBtn) {
    sendCodeBtn.addEventListener('click', async () => {
        const phoneNumber = document.getElementById('phone-number').value;
        const appVerifier = window.recaptchaVerifier;
        try {
            window.confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
            document.getElementById('otp-group').style.display = 'block';
            document.getElementById('phone-group').style.display = 'none';
            alert("Code sent!");
        } catch (error) {
            console.error("Error sending code:", error);
            alert("Error sending SMS: " + error.message);
        }
    });
}

if (verifyCodeBtn) {
    verifyCodeBtn.addEventListener('click', async () => {
        const code = document.getElementById('otp-code').value;
        try {
            const result = await window.confirmationResult.confirm(code);
            const user = result.user;

            // Check/Create User Document
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);

            if (!userDoc.exists()) {
                await setDoc(userDocRef, {
                    name: "Phone User",
                    email: "",
                    role: "user",
                    createdAt: serverTimestamp()
                });
            }

            // Redirect
            const role = userDoc.exists() ? userDoc.data().role : "user";
            if (role === 'admin') window.location.href = "admin/dashboard.html";
            else if (role === 'staff') window.location.href = "staff/dashboard.html";
            else window.location.href = "user/dashboard.html";

        } catch (error) {
            console.error("OTP verification failed:", error);
            alert("Incorrect code");
        }
    });
}
const registerForm = document.getElementById('register-form');
const googleBtn = document.getElementById('google-btn'); // New Google Button
const logoutBtn = document.getElementById('logout-btn');

// Google Sign-In Logic
if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;

            // Check if user exists in Firestore
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);

            if (!userDoc.exists()) {
                // Create new user document
                await setDoc(userDocRef, {
                    name: user.displayName,
                    email: user.email,
                    role: "user",
                    createdAt: serverTimestamp()
                });
            }

            // Redirect based on role
            const role = userDoc.exists() ? userDoc.data().role : "user";
            if (role === 'admin') window.location.href = "admin/dashboard.html";
            else if (role === 'staff') window.location.href = "staff/dashboard.html";
            else window.location.href = "user/dashboard.html";

        } catch (error) {
            console.error("Google Sign-In Error:", error);
            alert("Google Sign-In failed: " + error.message);
        }
    });
}

// Forgot Password Logic
const forgotPasswordLink = document.getElementById('forgot-password-link');
const forgotPasswordSection = document.getElementById('forgot-password-section');
const backToLoginBtn = document.getElementById('back-to-login-btn');
const resetPasswordBtn = document.getElementById('reset-password-btn');
const resetMessage = document.getElementById('reset-message');

if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        emailAuthSection.style.display = 'none';
        phoneAuthSection.style.display = 'none';
        forgotPasswordSection.style.display = 'block';
        if (document.querySelector('.auth-header p')) {
            document.querySelector('.auth-header p').textContent = "Reset your password";
        }
    });
}

if (backToLoginBtn) {
    backToLoginBtn.addEventListener('click', () => {
        forgotPasswordSection.style.display = 'none';
        emailAuthSection.style.display = 'block';
        if (document.querySelector('.auth-header p')) {
            document.querySelector('.auth-header p').textContent = "Login to your account";
        }
        resetMessage.style.display = 'none';
    });
}

if (resetPasswordBtn) {
    resetPasswordBtn.addEventListener('click', async () => {
        const email = document.getElementById('reset-email').value.trim();
        resetMessage.style.display = 'none';

        if (!email) {
            resetMessage.style.display = 'block';
            resetMessage.style.color = 'red';
            resetMessage.textContent = "Please enter your email address.";
            return;
        }

        resetPasswordBtn.disabled = true;
        resetPasswordBtn.textContent = "Sending...";

        try {
            await sendPasswordResetEmail(auth, email);
            resetMessage.style.display = 'block';
            resetMessage.style.color = 'green';
            resetMessage.textContent = "Password reset email sent! Check your inbox.";
        } catch (error) {
            console.error("Error sending reset email:", error);
            resetMessage.style.display = 'block';
            resetMessage.style.color = 'red';
            if (error.code === 'auth/user-not-found') {
                resetMessage.textContent = "No account found with this email.";
            } else if (error.code === 'auth/invalid-email') {
                resetMessage.textContent = "Invalid email address.";
            } else {
                resetMessage.textContent = "Error: " + error.message;
            }
        } finally {
            resetPasswordBtn.disabled = false;
            resetPasswordBtn.textContent = "Send Reset Link";
        }
    });
}
const authLinks = document.getElementById('auth-links');
const userLinks = document.getElementById('user-links');

// Register User
if (registerForm) {
    // Real-time Validation Logic
    const validateField = (input, condition, message, errorId) => {
        const errorEl = document.getElementById(errorId);
        if (!condition) {
            input.classList.add('error');
            input.classList.remove('success');
            errorEl.style.display = 'block';
            errorEl.textContent = message;
            return false;
        } else {
            input.classList.remove('error');
            input.classList.add('success');
            errorEl.style.display = 'none';
            return true;
        }
    };

    // Input Listeners
    ['name', 'email', 'phone', 'address', 'city', 'zip'].forEach(id => {
        const input = document.getElementById(id);
        if (!input) return;

        input.addEventListener('blur', () => {
            if (id === 'name') validateField(input, input.value.trim().split(' ').length >= 2, "Please enter your full name (First and Last name).", 'name-error');
            if (id === 'email') validateField(input, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value), "Please enter a valid email address.", 'email-error');
            if (id === 'phone') validateField(input, /^\d{11}$/.test(input.value), "Phone number must be exactly 11 digits (e.g., 01xxxxxxxxx).", 'phone-error');
            if (id === 'address') validateField(input, input.value.length > 5, "Address is too short.", 'address-error');
            if (id === 'city') validateField(input, input.value.length > 2, "City name is too short.", 'city-error');
            if (id === 'zip') validateField(input, input.value.length >= 4, "Invalid Zip Code.", 'zip-error');
        });
    });

    const passwordInput = document.getElementById('password');
    if (passwordInput) {
        passwordInput.addEventListener('input', () => {
            const val = passwordInput.value;
            const reqList = document.getElementById('password-requirements');
            const reqLength = document.getElementById('req-length');
            const reqCapital = document.getElementById('req-capital');
            const reqNumber = document.getElementById('req-number');

            // Reset visibility if empty
            if (val.length === 0) {
                reqList.style.display = 'none';
                passwordInput.classList.remove('error', 'success');
                return;
            }

            // Check Criteria
            const isLengthValid = val.length >= 6;
            const isCapitalValid = /[A-Z]/.test(val);
            const isNumberValid = /\d/.test(val);
            const isAllValid = isLengthValid && isCapitalValid && isNumberValid;

            // Update UI for Length
            if (isLengthValid) {
                reqLength.classList.add('valid');
                reqLength.classList.remove('invalid');
                reqLength.querySelector('i').className = 'fas fa-check-circle';
            } else {
                reqLength.classList.remove('valid');
                reqLength.classList.add('invalid');
                reqLength.querySelector('i').className = 'fas fa-circle';
            }

            // Update UI for Capital
            if (isCapitalValid) {
                reqCapital.classList.add('valid');
                reqCapital.classList.remove('invalid');
                reqCapital.querySelector('i').className = 'fas fa-check-circle';
            } else {
                reqCapital.classList.remove('valid');
                reqCapital.classList.add('invalid');
                reqCapital.querySelector('i').className = 'fas fa-circle';
            }

            // Update UI for Number
            if (isNumberValid) {
                reqNumber.classList.add('valid');
                reqNumber.classList.remove('invalid');
                reqNumber.querySelector('i').className = 'fas fa-check-circle';
            } else {
                reqNumber.classList.remove('valid');
                reqNumber.classList.add('invalid');
                reqNumber.querySelector('i').className = 'fas fa-circle';
            }

            // Logic: Show list if typing AND not all valid. Hide if all valid.
            if (isAllValid) {
                passwordInput.classList.remove('error');
                passwordInput.classList.add('success');
                reqList.style.display = 'none'; // Hide list when valid
            } else {
                passwordInput.classList.add('error');
                passwordInput.classList.remove('success');
                reqList.style.display = 'block'; // Show list when invalid
            }
        });
    }

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('name').value.trim();
        const email = document.getElementById('email').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const password = document.getElementById('password').value;
        const address = document.getElementById('address').value.trim();
        const city = document.getElementById('city').value.trim();
        const zip = document.getElementById('zip').value.trim();
        const errorDiv = document.getElementById('register-error');

        // Validation Rules
        errorDiv.style.display = 'none';

        // Final Verification before submit
        let isValid = true;
        if (!validateField(document.getElementById('name'), name.split(' ').length >= 2, "Please enter your full name.", 'name-error')) isValid = false;
        if (!validateField(document.getElementById('email'), /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "Invalid email.", 'email-error')) isValid = false;
        if (!validateField(document.getElementById('phone'), /^\d{11}$/.test(phone), "Phone number must be exactly 11 digits.", 'phone-error')) isValid = false;
        if (!validateField(document.getElementById('password'), /^(?=.*[A-Z])(?=.*\d).{6,}$/.test(password), "", 'register-error')) {
            // For password, visual cues are enough, but we stop submit. 
            // Logic above uses 'register-error' as dummyID or we can just rely on boolean
        }
        if (!/^(?=.*[A-Z])(?=.*\d).{6,}$/.test(password)) {
            isValid = false;
            document.getElementById('password').classList.add('error');
        }

        if (!isValid) return;

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Update Auth Profile
            await updateProfile(user, { displayName: name });

            // Create User Document in Firestore
            await setDoc(doc(db, "users", user.uid), {
                name: name,
                email: email,
                phone: phone, // Save phone number
                role: "user",
                address: address,
                city: city,
                zip: zip,
                createdAt: new Date()
            }, { merge: true });

            // Send Email Verification
            await sendEmailVerification(user);

            // Hide form and show success message
            registerForm.style.display = 'none';
            if (document.querySelector('.auth-header p')) {
                document.querySelector('.auth-header p').textContent = "Verification Required";
            }

            const successDiv = document.createElement('div');
            successDiv.style.textAlign = 'center';
            successDiv.style.padding = '20px';
            successDiv.innerHTML = `
                <i class="fas fa-envelope-open-text" style="font-size: 3rem; color: var(--primary-color); margin-bottom: 20px;"></i>
                <h3 style="margin-bottom: 10px;">Check your email!</h3>
                <p style="color: var(--text-light); margin-bottom: 20px;">We've sent a verification link to <strong>${email}</strong>. Please click the link to activate your account before logging in.</p>
                <a href="login.html" class="btn btn-primary" style="display: inline-block; width: 100%;">Go to Login</a>
            `;
            registerForm.parentNode.insertBefore(successDiv, registerForm.nextSibling);

        } catch (error) {
            errorDiv.style.display = 'block';
            if (error.code === 'auth/email-already-in-use') {
                errorDiv.textContent = "This email is already registered.";
            } else if (error.code === 'auth/operation-not-allowed') {
                errorDiv.textContent = "Email/Password sign-up is disabled in Firebase Console. Please enable it authentication methods.";
            } else {
                errorDiv.textContent = "Error: " + error.message;
            }
        }
    });
}

// Login User
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('login-error');

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Check if email is verified
            if (!user.emailVerified) {
                await signOut(auth); // Force logout
                errorDiv.style.display = 'block';
                errorDiv.innerHTML = `Please verify your email address before logging in. <br> <button id="resend-verification" style="background:none; border:none; color:var(--primary-color); text-decoration:underline; cursor:pointer; padding:0; margin-top:5px;">Resend Verification Link</button>`;

                // Add event listener for resend
                setTimeout(() => {
                    const resendBtn = document.getElementById('resend-verification');
                    if (resendBtn) {
                        resendBtn.addEventListener('click', async (e) => {
                            e.preventDefault();
                            resendBtn.disabled = true;
                            resendBtn.textContent = "Sending...";
                            try {
                                // We need to temporarily sign them in to send the email, then sign out again
                                const tempCred = await signInWithEmailAndPassword(auth, email, password);
                                await sendEmailVerification(tempCred.user);
                                await signOut(auth);
                                errorDiv.innerHTML = "Verification link resent successfully. Check your inbox.";
                                errorDiv.style.color = 'green';
                            } catch (err) {
                                errorDiv.innerHTML = "Error resending link: " + err.message;
                            }
                        });
                    }
                }, 100);
                return;
            }

            // Get User Role
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                const role = userData.role;

                // Redirect based on role
                if (role === 'admin') {
                    window.location.href = "admin/dashboard.html";
                } else if (role === 'staff') {
                    window.location.href = "staff/dashboard.html";
                } else {
                    window.location.href = "user/dashboard.html";
                }
            } else {
                // Return to user dashboard if no role found (fallback)
                window.location.href = "user/dashboard.html";
            }
        } catch (error) {
            errorDiv.style.display = 'block';
            console.error(error);

            if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                errorDiv.textContent = "Incorrect email or password. Please try again.";
            } else if (error.code === 'auth/too-many-requests') {
                errorDiv.textContent = "Too many failed attempts. Please try again later or reset your password.";
            } else if (error.code === 'auth/user-disabled') {
                errorDiv.textContent = "This account has been disabled. Please contact support.";
            } else {
                errorDiv.textContent = "Login failed: " + error.message;
            }
        }
    });
}

// Logout
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try {
            await signOut(auth);

            // Redirect to home or login page if currently on a protected page
            const path = window.location.pathname;
            if (path.includes('/user/') || path.includes('/staff/') || path.includes('/admin/')) {
                window.location.href = "../index.html";
            } else {
                window.location.reload();
            }
        } catch (error) {
            console.error("Logout error:", error);
        }
    });
}

// Auth State Observer
onAuthStateChanged(auth, async (user) => {
    // UI Updates for Public Pages
    if (authLinks && userLinks) {
        if (user) {
            authLinks.style.display = 'none';
            userLinks.style.display = 'flex';

            // Welcome Message
            const welcomeMsg = document.getElementById('welcome-msg');
            const dashboardLink = document.getElementById('dashboard-link');

            if (welcomeMsg || dashboardLink) {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                let name = user.displayName;
                let role = "user";

                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    role = userData.role;
                    if (userData.name) name = userData.name;
                }

                // Fallback to email username if name is still missing
                if (!name && user.email) {
                    name = user.email.split('@')[0];
                    // Capitalize first letter
                    name = name.charAt(0).toUpperCase() + name.slice(1);
                }

                name = name || "User";

                if (welcomeMsg) welcomeMsg.textContent = `Welcome, ${name}`;
                if (dashboardLink) dashboardLink.href = `${role}/dashboard.html`;
            }

        } else {
            authLinks.style.display = 'flex';
            userLinks.style.display = 'none';
        }
    }

    // Protection for Private Pages
    const path = window.location.pathname;
    if (path.includes('/user/') || path.includes('/staff/') || path.includes('/admin/')) {
        if (!user) {
            // Not logged in, redirect to login
            window.location.href = path.includes('/user/') ? "../login.html" : "../login.html";
            return;
        }

        // Role-based protection
        // This is a basic client-side check. Real security is in Firestore Rules.
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            const role = userDoc.data().role;

            if (path.includes('/admin/') && role !== 'admin') {
                window.location.href = "../index.html";
            } else if (path.includes('/staff/') && role !== 'staff' && role !== 'admin') {
                window.location.href = "../index.html";
            }
        }
    }
});

// Password visibility toggle
const togglePasswordBtn = document.getElementById('toggle-password');
const passwordField = document.getElementById('password');

if (togglePasswordBtn && passwordField) {
    togglePasswordBtn.addEventListener('click', function () {
        const isPassword = passwordField.getAttribute('type') === 'password';
        const newType = isPassword ? 'text' : 'password';
        passwordField.setAttribute('type', newType);

        // Toggle the class on the wrapper to trigger the SVG animation
        const wrapper = this.closest('.password-input-group');
        if (wrapper) {
            if (isPassword) {
                // Switching to text: remove the hidden state (shows open eye)
                wrapper.classList.remove('is-hidden');
                this.setAttribute('aria-label', 'Hide password');
            } else {
                // Switching to password: add hidden state (draws slash, closes eye)
                wrapper.classList.add('is-hidden');
                this.setAttribute('aria-label', 'Show password');
            }
        }
    });
}
