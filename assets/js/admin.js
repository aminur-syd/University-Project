import { db } from './firebase-config.js';
import {
    collection,
    getDocs,
    query,
    where,
    orderBy,
    updateDoc,
    doc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const logsContainer = document.getElementById('logs-container');
const totalUsers = document.getElementById('total-users');
const totalClaims = document.getElementById('total-claims');

const roleModal = document.getElementById('role-modal');
const roleForm = document.getElementById('role-form');
const cancelRoleBtn = document.getElementById('cancel-role-btn');
const roleUserIdInput = document.getElementById('role-user-id');
const roleModalUser = document.getElementById('role-modal-user');
const newRoleSelect = document.getElementById('new-role');

const adminList = document.getElementById('admin-list');
const staffList = document.getElementById('staff-list');
const usersList = document.getElementById('users-list');
const totalUsersBadge = document.getElementById('total-users-badge');

function renderTableMessage(message, colSpan, variant = 'muted') {
    const typeClass = variant === 'error' ? 'table-row-message--error' : 'table-row-message--muted';
    return `
        <tr class="table-row-message ${typeClass}">
            <td colspan="${colSpan}">${message}</td>
        </tr>
    `;
}

function getTypePill(type) {
    const typeClass = type === 'lost' ? 'type-pill--lost' : 'type-pill--found';
    return `<span class="type-pill ${typeClass}">${type.toUpperCase()}</span>`;
}

function openRoleModal(userId, userName, currentRole) {
    if (!roleModal || !roleUserIdInput || !roleModalUser || !newRoleSelect) {
        return;
    }

    roleUserIdInput.value = userId;
    roleModalUser.textContent = `User: ${userName} (${currentRole})`;
    newRoleSelect.value = currentRole;
    roleModal.classList.add('active');
}

if (cancelRoleBtn && roleModal) {
    cancelRoleBtn.addEventListener('click', () => {
        roleModal.classList.remove('active');
    });
}

let fetchUsers = async () => { };

if (roleForm) {
    roleForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const userId = roleUserIdInput.value;
        const newRole = newRoleSelect.value;
        const submitBtn = roleForm.querySelector('button[type="submit"]');

        if (!userId || !submitBtn) {
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Updating...';

        try {
            await updateDoc(doc(db, 'users', userId), { role: newRole });
            showToast(`User role successfully updated to ${newRole.toUpperCase()}.`, 'success');
            roleModal.classList.remove('active');
            fetchUsers();
        } catch (error) {
            console.error('Error updating role:', error);
            showToast('Error updating role. Please check permissions.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Update Role';
        }
    });
}

if (adminList || staffList || usersList) {
    fetchUsers = async () => {
        try {
            const usersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
            const usersSnapshot = await getDocs(usersQuery);

            if (adminList) adminList.innerHTML = '';
            if (staffList) staffList.innerHTML = '';
            if (usersList) usersList.innerHTML = '';

            if (totalUsersBadge) {
                totalUsersBadge.textContent = usersSnapshot.size;
            }

            if (usersSnapshot.empty) {
                if (adminList) adminList.innerHTML = renderTableMessage('No admins found.', 4);
                if (staffList) staffList.innerHTML = renderTableMessage('No staff found.', 4);
                if (usersList) usersList.innerHTML = renderTableMessage('No users found.', 4);
                return;
            }

            let adminCount = 0;
            let staffCount = 0;
            let userCount = 0;

            usersSnapshot.forEach((docSnap) => {
                const user = docSnap.data();
                const joined = user.createdAt ? user.createdAt.toDate().toLocaleDateString() : 'N/A';
                const roleLower = user.role?.toLowerCase() || 'user';
                const initial = user.name ? user.name.charAt(0).toUpperCase() : '?';

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>
                        <div class="user-cell">
                            <div class="avatar-badge">${initial}</div>
                            <span class="fw-semibold">${user.name || 'Unknown User'}</span>
                        </div>
                    </td>
                    <td>${user.email || 'N/A'}</td>
                    <td>${joined}</td>
                    <td>
                        <button class="btn btn-outline btn-outline-dark btn-sm edit-role-btn" data-id="${docSnap.id}" data-name="${user.name || 'Unknown User'}" data-role="${user.role || 'user'}">
                            <i class="fas fa-edit"></i>
                            Edit Role
                        </button>
                    </td>
                `;

                if (roleLower === 'admin' && adminList) {
                    adminList.appendChild(row);
                    adminCount += 1;
                } else if (roleLower === 'staff' && staffList) {
                    staffList.appendChild(row);
                    staffCount += 1;
                } else if (usersList) {
                    usersList.appendChild(row);
                    userCount += 1;
                }
            });

            if (adminCount === 0 && adminList) adminList.innerHTML = renderTableMessage('No administrators registered.', 4);
            if (staffCount === 0 && staffList) staffList.innerHTML = renderTableMessage('No staff members registered.', 4);
            if (userCount === 0 && usersList) usersList.innerHTML = renderTableMessage('No regular users registered.', 4);

            document.querySelectorAll('.edit-role-btn').forEach((button) => {
                button.addEventListener('click', () => {
                    openRoleModal(button.dataset.id, button.dataset.name, button.dataset.role);
                });
            });
        } catch (error) {
            console.error(error);
            if (adminList) adminList.innerHTML = renderTableMessage('Error loading.', 4, 'error');
            if (staffList) staffList.innerHTML = renderTableMessage('Error loading.', 4, 'error');
            if (usersList) usersList.innerHTML = renderTableMessage('Error loading.', 4, 'error');
        }
    };

    fetchUsers();
}

if (totalUsers) {
    getDocs(collection(db, 'users')).then((snapshot) => {
        totalUsers.textContent = snapshot.size;
    });

    getDocs(collection(db, 'items')).then((snapshot) => {
        let items = 0;
        let lost = 0;
        let found = 0;
        let pending = 0;

        snapshot.forEach((docSnap) => {
            items += 1;
            const data = docSnap.data();
            if (data.type === 'lost') lost += 1;
            if (data.type === 'found') found += 1;
            if (data.reviewStatus === 'pending') pending += 1;
        });

        const totalItems = document.getElementById('total-items');
        const lostItems = document.getElementById('lost-items-count');
        const foundItems = document.getElementById('found-items-count');
        const pendingPosts = document.getElementById('pending-posts-count');

        if (totalItems) totalItems.textContent = items;
        if (lostItems) lostItems.textContent = lost;
        if (foundItems) foundItems.textContent = found;
        if (pendingPosts) pendingPosts.textContent = pending;
    });

    if (totalClaims) {
        getDocs(query(collection(db, 'chats'), where('status', '==', 'active'))).then((snapshot) => {
            totalClaims.textContent = snapshot.size;
        });
    }

    const recentPendingContainer = document.getElementById('recent-pending-items');
    if (recentPendingContainer) {
        const fetchRecentPending = async () => {
            try {
                const pendingQuery = query(collection(db, 'items'), where('reviewStatus', '==', 'pending'));
                const pendingSnapshot = await getDocs(pendingQuery);
                recentPendingContainer.innerHTML = '';

                if (pendingSnapshot.empty) {
                    recentPendingContainer.innerHTML = `
                        <tr class="table-row-message table-row-message--muted">
                            <td colspan="2">
                                <span class="text-success"><i class="fas fa-check-circle"></i> All caught up! No pending items.</span>
                            </td>
                        </tr>
                    `;
                    return;
                }

                const pendingItems = pendingSnapshot.docs.map((docSnap) => docSnap.data());
                pendingItems.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());

                pendingItems.slice(0, 4).forEach((item) => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td class="table-highlight">${item.title || 'Untitled'}</td>
                        <td>${getTypePill(item.type)}</td>
                    `;
                    recentPendingContainer.appendChild(row);
                });
            } catch (error) {
                console.error(error);
                recentPendingContainer.innerHTML = renderTableMessage('Failed to load recent items.', 2, 'error');
            }
        };

        fetchRecentPending();
    }
}

if (logsContainer) {
    logsContainer.innerHTML = `
        <div class="log-entry">[INFO] System initialized at ${new Date().toLocaleString()}</div>
        <div class="log-entry">[INFO] Database connection established.</div>
    `;
}

function showToast(message, type = 'success') {
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

    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}
