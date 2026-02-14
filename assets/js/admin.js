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

// Role Management Modal
const roleModal = document.getElementById('role-modal');
const roleForm = document.getElementById('role-form');
const cancelRoleBtn = document.getElementById('cancel-role-btn');
const roleUserIdInput = document.getElementById('role-user-id');
const roleModalUserP = document.getElementById('role-modal-user');
const newRoleSelect = document.getElementById('new-role');

const openRoleModal = (userId, userName, currentRole) => {
    roleUserIdInput.value = userId;
    roleModalUserP.textContent = `User: ${userName} (${currentRole})`;
    newRoleSelect.value = currentRole;
    roleModal.classList.add('active');
};

if (cancelRoleBtn) {
    cancelRoleBtn.addEventListener('click', () => {
        roleModal.classList.remove('active');
    });
}

if (roleForm) {
    roleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userId = roleUserIdInput.value;
        const newRole = newRoleSelect.value;
        const submitBtn = roleForm.querySelector('button[type="submit"]');

        if (!userId) return;

        submitBtn.disabled = true;
        submitBtn.textContent = "Updating...";

        try {
            await updateDoc(doc(db, "users", userId), {
                role: newRole
            });
            alert(`User role updated to ${newRole.toUpperCase()}.`);
            roleModal.classList.remove('active');
            window.location.reload();
        } catch (error) {
            console.error("Error updating role:", error);
            alert("Error: " + error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Update Role";
        }
    });
}

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
                    <td><span class="item-badge" style="background: ${user.role === 'admin' ? 'var(--danger)' : (user.role === 'staff' ? 'var(--primary-color)' : '#9ca3af')}">${user.role.toUpperCase()}</span></td>
                    <td>${user.createdAt ? user.createdAt.toDate().toLocaleDateString() : 'N/A'}</td>
                    <td>
                        <button class="btn btn-outline edit-role-btn" data-id="${docSnap.id}" data-name="${user.name}" data-role="${user.role}" style="color: blue; border: 1px solid blue; padding: 5px 10px; font-size: 0.8rem;">Edit Role</button>
                    </td>
                `;
                usersList.appendChild(tr);
            });

            // Attach Event Listeners
            document.querySelectorAll('.edit-role-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    openRoleModal(btn.dataset.id, btn.dataset.name, btn.dataset.role);
                });
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
    `;
}
