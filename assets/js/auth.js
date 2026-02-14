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
    signInWithPhoneNumber
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
const authLinks = document.getElementById('auth-links');
const userLinks = document.getElementById('user-links');

// Register User
if (registerForm) {
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

        // 1. Full Name: At least 2 words
        if (name.split(' ').length < 2) {
            errorDiv.style.display = 'block';
            errorDiv.textContent = "Please enter your full name (First and Last name).";
            return;
        }

        // 2. Email: Basic regex check
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            errorDiv.style.display = 'block';
            errorDiv.textContent = "Please enter a valid email address.";
            return;
        }

        // 3. Password: 6 chars, 1 capital, 1 number
        const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{6,}$/;
        if (!passwordRegex.test(password)) {
            errorDiv.style.display = 'block';
            errorDiv.textContent = "Password must be at least 6 characters long, contain 1 capital letter and 1 number.";
            return;
        }

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

            window.location.href = "user/dashboard.html";
        } catch (error) {
            errorDiv.style.display = 'block';
            if (error.code === 'auth/email-already-in-use') {
                errorDiv.textContent = "This email is already registered.";
            } else {
                errorDiv.textContent = error.message;
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
            errorDiv.textContent = "Invalid email or password.";
            console.error(error);
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

            // Set dynamic dashboard link
            const dashboardLink = document.getElementById('dashboard-link');
            if (dashboardLink) {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists()) {
                    const role = userDoc.data().role;
                    dashboardLink.href = `${role}/dashboard.html`;
                } else {
                    dashboardLink.href = "user/dashboard.html";
                }
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
