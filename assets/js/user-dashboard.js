import { auth, db } from './firebase-config.js';
import {
    collection,
    doc,
    getDoc,
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
const CHAT_ITEM_FALLBACK_IMAGE = 'https://via.placeholder.com/80x80?text=No+Image';

function setTableMessage(message, type = 'muted') {
    if (!activeChatsList) return;

    const typeClass = type === 'error' ? 'table-row-message--error' : 'table-row-message--muted';
    activeChatsList.innerHTML = `
        <tr class="table-row-message ${typeClass}">
            <td colspan="3">${message}</td>
        </tr>
    `;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function resolveChatImageUrl(chat) {
    if (chat?.itemImageUrl) {
        return chat.itemImageUrl;
    }

    if (chat?.itemId) {
        try {
            const itemDoc = await getDoc(doc(db, 'items', chat.itemId));
            if (itemDoc.exists()) {
                return itemDoc.data().imageUrl || CHAT_ITEM_FALLBACK_IMAGE;
            }
        } catch (error) {
            console.error('Error resolving chat item image:', error);
        }
    }

    return CHAT_ITEM_FALLBACK_IMAGE;
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '/login';
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
            setTableMessage('No active handover chats currently open. Legacy direct claims, if any, appear on My Direct Claims.');
            return;
        }

        activeChatsList.innerHTML = '';
        const chatRows = await Promise.all(chatSnapshot.docs.map(async (docSnap) => {
            const chat = docSnap.data();
            const imageUrl = await resolveChatImageUrl(chat);

            return `
                <tr>
                    <td>
                        <div class="chat-item-cell">
                            <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(chat.itemTitle || 'Claimed item')}" class="chat-item-thumb">
                            <strong>${escapeHtml(chat.itemTitle || 'Untitled Item')}</strong>
                        </div>
                    </td>
                    <td>
                        <span class="status-pill status-pill--info">
                            <i class="fas fa-circle status-pill__dot"></i>
                            Action Needed
                        </span>
                    </td>
                    <td>
                        <a href="/user/dashboard?chatId=${docSnap.id}" class="btn btn-outline btn-sm">Open Secure Chat</a>
                    </td>
                </tr>
            `;
        }));

        activeChatsList.innerHTML = chatRows.join('');
    } catch (error) {
        console.error('Error fetching chats:', error);
        setTableMessage('Error loading active handover chats.', 'error');
    }
});
