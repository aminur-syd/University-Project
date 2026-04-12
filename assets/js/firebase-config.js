// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// Firebase web app configuration
const firebaseConfig = {
    apiKey: "AIzaSyDWt4CTYOxfgx3K72c4pfeFm7q6rzLC1Zg",
    authDomain: "lost-and-found-16023.firebaseapp.com",
    projectId: "lost-and-found-16023",
    storageBucket: "lost-and-found-16023.firebasestorage.app",
    messagingSenderId: "635203566145",
    appId: "1:635203566145:web:22d7c348a51ca7593ce4c0",
    measurementId: "G-H8NX6DDN00"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storageBucketUrl = firebaseConfig.storageBucket
    ? `gs://${firebaseConfig.storageBucket}`
    : undefined;
const storage = storageBucketUrl
    ? getStorage(app, storageBucketUrl)
    : getStorage(app);

export { auth, db, storage };
