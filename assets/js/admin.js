import { db } from './firebase-config.js';
import {
    collection,
    getDocs,
    query,
    orderBy,
    limit,
    updateDoc,
    doc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const usersList = document.getElementById('users-list');
const logsContainer = document.getElementById('logs-container');
const totalUsers = document.getElementById('total-users');
const totalItems = document.getElementById('total-items');
const totalClaims = document.getElementById('total-claims');

window.editUserRole = async (userId, userName, currentRole) => {
    const newRole = prompt(`Change role for ${userName}.\nCurrent Role: ${currentRole}\nEnter new role (user / staff / admin):`, currentRole);

    if (newRole && newRole !== currentRole) {
        if (!['user', 'staff', 'admin'].includes(newRole.toLowerCase())) {
            alert("Invalid role. Please enter 'user', 'staff', or 'admin'.");
            return;
        }

        try {
            await updateDoc(doc(db, "users", userId), {
                role: newRole.toLowerCase()
            });
            alert(`User ${userName} is now a ${newRole}.`);
            window.location.reload();
        } catch (error) {
            console.error("Error updating role:", error);
            alert("Error: " + error.message);
        }
    }
};

// Fetch Users
if (usersList) {
    const fetchUsers = async () => {
        try {
            const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
            const querySnapshot = await getDocs(q);

            usersList.innerHTML = '';
            if (querySnapshot.empty) {
                usersList.innerHTML = '<tr><td colspan="5">No users found.</td></tr>';
                return;
            }

            querySnapshot.forEach((docSnap) => {
                const user = docSnap.data();
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${user.name}</td>
                    <td>${user.email}</td>
                    <td>${user.role}</td>
                    <td>${user.createdAt ? user.createdAt.toDate().toLocaleDateString() : 'N/A'}</td>
                    <td>
                        <button onclick="editUserRole('${docSnap.id}', '${user.name}', '${user.role}')" class="btn btn-outline" style="color: blue; border: 1px solid blue; padding: 5px 10px; font-size: 0.8rem;">Edit Role</button>
                    </td>
                `;
                usersList.appendChild(tr);
            });
        } catch (error) {
            console.error(error);
            usersList.innerHTML = '<tr><td colspan="5">Error loading users (Need permissions).</td></tr>';
        }
    };
    fetchUsers();
}

// Fetch Stats (Overview)
if (totalUsers) {
    getDocs(collection(db, "users")).then(snap => totalUsers.textContent = snap.size);
    getDocs(collection(db, "items")).then(snap => totalItems.textContent = snap.size);
    getDocs(collection(db, "claims")).then(snap => totalClaims.textContent = snap.size);
}

// Mock Logs (Since we don't have a real logging system yet)
if (logsContainer) {
    logsContainer.innerHTML = `
        <div class="log-entry">[INFO] System initialized at ${new Date().toLocaleString()}</div>
        <div class="log-entry">[INFO] Database connection established.</div>
        <div class="log-entry">[WARN] Email service not configured.</div>
    `;
}
