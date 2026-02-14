import { auth, db } from './firebase-config.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    doc,
    setDoc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// DOM Elements
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const logoutBtn = document.getElementById('logout-btn');
const authLinks = document.getElementById('auth-links');
const userLinks = document.getElementById('user-links');

// Register User
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('register-error');

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Update Auth Profile
            await updateProfile(user, { displayName: name });

            // Create User Document in Firestore
            await setDoc(doc(db, "users", user.uid), {
                name: name,
                email: email,
                role: "user", // Default role
                createdAt: new Date()
            });

            window.location.href = "user/dashboard.html";
        } catch (error) {
            errorDiv.style.display = 'block';
            errorDiv.textContent = error.message;
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
