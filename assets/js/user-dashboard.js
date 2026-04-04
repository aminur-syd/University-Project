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
const statPosts = document.getElementById('stat-posts');
const statClaims = document.getElementById('stat-claims');
const statResolved = document.getElementById('stat-resolved');
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
        window.location.href = '../login.html';
        return;
    }

    if (userName) {
        userName.textContent = user.displayName || user.email.split('@')[0];
    }

    try {
        const postsQuery = query(collection(db, 'items'), where('createdBy', '==', user.uid));
        const postsSnapshot = await getDocs(postsQuery);
        const posts = postsSnapshot.docs.map((docSnap) => docSnap.data());

        if (statPosts) {
            statPosts.textContent = posts.length;
        }

        if (statResolved) {
            statResolved.textContent = posts.filter((item) => item.status === 'resolved').length;
        }
    } catch (error) {
        console.error('Error fetching user post stats:', error);
    }

    try {
        const chatsQuery = query(
            collection(db, 'chats'),
            where('userId', '==', user.uid),
            where('status', '==', 'active'),
            orderBy('updatedAt', 'desc')
        );
        const chatSnapshot = await getDocs(chatsQuery);

        if (statClaims) {
            statClaims.textContent = chatSnapshot.size;
        }

        if (!activeChatsList) {
            return;
        }

        if (chatSnapshot.empty) {
            setTableMessage('No active handover conversations currently open.');
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
                        <td>
                            <span class="status-pill status-pill--info">
                                <i class="fas fa-circle status-pill__dot"></i>
                                Action Needed
                            </span>
                        </td>
                        <td>
                            <a href="chat.html?chatId=${docSnap.id}" class="btn btn-outline btn-sm">Open Secure Chat</a>
                        </td>
                    </tr>
                `
            );
        });
    } catch (error) {
        console.error('Error fetching chats:', error);
        setTableMessage('Error loading chats.', 'error');
    }
});
