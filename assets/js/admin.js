import { db } from './firebase-config.js';
import {
    collection,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    updateDoc,
    doc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
            showToast(`User role successfully updated to ${newRole.toUpperCase()}.`, 'success');
            roleModal.classList.remove('active');
            // Refresh table quietly without reloading page
            fetchUsers();
        } catch (error) {
            console.error("Error updating role:", error);
            showToast("Error updating role. Please check permissions.", 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Update Role";
        }
    });
}

// Fetch Users into 3 separate tables
const adminList = document.getElementById('admin-list');
const staffList = document.getElementById('staff-list');
const usersList = document.getElementById('users-list');
const totalUsersBadge = document.getElementById('total-users-badge');

// Define in module scope so roleForm event listener can call it
let fetchUsers = async () => { };

if (adminList || staffList || usersList) {
    fetchUsers = async () => {
        try {
            const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
            const querySnapshot = await getDocs(q);

            if (adminList) adminList.innerHTML = '';
            if (staffList) staffList.innerHTML = '';
            if (usersList) usersList.innerHTML = '';

            if (totalUsersBadge) {
                totalUsersBadge.textContent = querySnapshot.size;
            }

            if (querySnapshot.empty) {
                if (adminList) adminList.innerHTML = '<tr><td colspan="4" style="text-align:center;">No admins found.</td></tr>';
                if (staffList) staffList.innerHTML = '<tr><td colspan="4" style="text-align:center;">No staff found.</td></tr>';
                if (usersList) usersList.innerHTML = '<tr><td colspan="4" style="text-align:center;">No users found.</td></tr>';
                return;
            }

            let adminCount = 0;
            let staffCount = 0;
            let userCount = 0;

            querySnapshot.forEach((docSnap) => {
                const user = docSnap.data();
                const joined = user.createdAt ? user.createdAt.toDate().toLocaleDateString() : 'N/A';
                const roleLower = user.role?.toLowerCase() || 'user';

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 32px; height: 32px; border-radius: 50%; background: #f3f4f6; display: flex; align-items: center; justify-content: center; font-weight: 600; color: var(--primary-color);">
                                ${user.name ? user.name.charAt(0).toUpperCase() : '?'}
                            </div>
                            <span style="font-weight: 600;">${user.name}</span>
                        </div>
                    </td>
                    <td>${user.email}</td>
                    <td>${joined}</td>
                    <td>
                        <button class="btn btn-outline edit-role-btn" data-id="${docSnap.id}" data-name="${user.name}" data-role="${user.role}" style="padding: 6px 12px; font-size: 0.8rem; border-color: var(--border-color); color: var(--text-color);">
                            <i class="fas fa-edit"></i> Edit Role
                        </button>
                    </td>
                `;

                if (roleLower === 'admin' && adminList) {
                    adminList.appendChild(tr);
                    adminCount++;
                } else if (roleLower === 'staff' && staffList) {
                    staffList.appendChild(tr);
                    staffCount++;
                } else if (usersList) {
                    usersList.appendChild(tr);
                    userCount++;
                }
            });

            if (adminCount === 0 && adminList) adminList.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--text-light);">No administrators registered.</td></tr>';
            if (staffCount === 0 && staffList) staffList.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--text-light);">No staff members registered.</td></tr>';
            if (userCount === 0 && usersList) usersList.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--text-light);">No regular users registered.</td></tr>';

            // Attach Event Listeners
            document.querySelectorAll('.edit-role-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    openRoleModal(btn.dataset.id, btn.dataset.name, btn.dataset.role);
                });
            });

        } catch (error) {
            console.error(error);
            if (adminList) adminList.innerHTML = '<tr><td colspan="4" style="color:var(--danger); text-align:center;">Error loading.</td></tr>';
            if (staffList) staffList.innerHTML = '<tr><td colspan="4" style="color:var(--danger); text-align:center;">Error loading.</td></tr>';
            if (usersList) usersList.innerHTML = '<tr><td colspan="4" style="color:var(--danger); text-align:center;">Error loading.</td></tr>';
        }
    };
    fetchUsers();
}

// Fetch Detailed Stats (Overview)
if (totalUsers) {
    // 1. Total Users
    getDocs(collection(db, "users")).then(snap => totalUsers.textContent = snap.size);

    // 2. Comprehensive Items Query
    getDocs(collection(db, "items")).then(snap => {
        let tItems = 0;
        let tLost = 0;
        let tFound = 0;
        let tPending = 0;

        snap.forEach(doc => {
            tItems++;
            const data = doc.data();
            if (data.type === 'lost') tLost++;
            if (data.type === 'found') tFound++;
            if (data.reviewStatus === 'pending') tPending++;
        });

        const totalItemsEl = document.getElementById('total-items');
        const lostItemsEl = document.getElementById('lost-items-count');
        const foundItemsEl = document.getElementById('found-items-count');
        const pendingPostsEl = document.getElementById('pending-posts-count');

        if (totalItemsEl) totalItemsEl.textContent = tItems;
        if (lostItemsEl) lostItemsEl.textContent = tLost;
        if (foundItemsEl) foundItemsEl.textContent = tFound;
        if (pendingPostsEl) pendingPostsEl.textContent = tPending;
    });

    // 3. Active Handover Chats
    getDocs(query(collection(db, "chats"), where("status", "==", "active"))).then(snap => totalClaims.textContent = snap.size);

    // 4. Recent Pending Items (Action Needed)
    const recentPendingContainer = document.getElementById('recent-pending-items');
    if (recentPendingContainer) {
        const fetchRecentPending = async () => {
            try {
                // To order by createdAt properly while filtering, an index is required
                // For simplicity before index creation, we'll fetch pending and sort in memory if needed
                const qPending = query(collection(db, "items"), where("reviewStatus", "==", "pending"));
                const pendingSnap = await getDocs(qPending);

                recentPendingContainer.innerHTML = '';

                if (pendingSnap.empty) {
                    recentPendingContainer.innerHTML = '<tr><td colspan="2"><span style="color: var(--success);"><i class="fas fa-check-circle"></i> All caught up! No pending items.</span></td></tr>';
                    return;
                }

                // Convert to array and sort safely in JS for now (limit to 4)
                let pendingDocs = pendingSnap.docs.map(d => d.data());
                pendingDocs.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());

                pendingDocs.slice(0, 4).forEach(item => {
                    const tr = document.createElement('tr');
                    const badgeClass = item.type === 'lost' ? 'badge-lost' : 'badge-found';
                    tr.innerHTML = `
                        <td style="font-weight: 500;">${item.title || 'Untitled'}</td>
                        <td><span class="item-badge ${badgeClass}">${item.type.toUpperCase()}</span></td>
                    `;
                    recentPendingContainer.appendChild(tr);
                });

            } catch (err) {
                console.error(err);
                recentPendingContainer.innerHTML = '<tr><td colspan="2">Failed to load recent items.</td></tr>';
            }
        };
        fetchRecentPending();
    }
}

// Mock Logs (Since we don't have a real logging system yet)
if (logsContainer) {
    logsContainer.innerHTML = `
        <div class="log-entry">[INFO] System initialized at ${new Date().toLocaleString()}</div>
        <div class="log-entry">[INFO] Database connection established.</div>
    `;
}

// --- Toast Notification System ---
function showToast(message, type = 'success') {
    // Remove existing toast if present
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;

    const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';

    toast.innerHTML = `
        <div class="toast-icon">
            <i class="fas ${icon}"></i>
        </div>
        <div class="toast-message">${message}</div>
    `;

    document.body.appendChild(toast);

    // Trigger animation
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400); // Wait for transition to finish
    }, 3000);
}
