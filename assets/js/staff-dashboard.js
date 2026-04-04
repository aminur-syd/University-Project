import { auth, db } from './firebase-config.js';
import {
    collection,
    query,
    where,
    orderBy,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const userName = document.getElementById('user-name');
const activeChatsList = document.getElementById('active-chats-list');

function setTableMessage(message, type = 'muted') {
    if (!activeChatsList) return;

    const typeClass = type === 'error' ? 'table-row-message--error' : 'table-row-message--muted';
    activeChatsList.innerHTML = `
        <tr class="table-row-message ${typeClass}">
            <td colspan="3">${message}</td>
        </tr>
    `;
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        return;
    }

    if (userName) {
        userName.textContent = user.displayName || user.email.split('@')[0];
    }

    try {
        const chatsQuery = query(
            collection(db, 'chats'),
            where('status', '==', 'active'),
            orderBy('createdAt', 'desc')
        );
        const chatSnapshot = await getDocs(chatsQuery);

        if (!activeChatsList) {
            return;
        }

        if (chatSnapshot.empty) {
            setTableMessage('No pending claims requiring response at the moment.');
            return;
        }

        activeChatsList.innerHTML = '';
        chatSnapshot.forEach((docSnap) => {
            const chat = docSnap.data();
            activeChatsList.insertAdjacentHTML(
                'beforeend',
                `
                    <tr>
                        <td><strong>${chat.itemTitle}</strong></td>
                        <td>${chat.userName}</td>
                        <td>
                            <a href="chat.html?chatId=${docSnap.id}" class="btn btn-outline btn-sm">
                                <i class="fas fa-reply"></i>
                                Open Chat & Verify
                            </a>
                        </td>
                    </tr>
                `
            );
        });
    } catch (error) {
        console.error('Error fetching chats:', error);
        setTableMessage('Error loading pending claims.', 'error');
    }
});
