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
            setTableMessage('No active handover chats requiring response right now. Pending direct claims are reviewed on the Review Claims page.');
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
                    <td>${escapeHtml(chat.userName || 'Unknown User')}</td>
                    <td>
                        <a href="dashboard.html?chatId=${docSnap.id}" class="btn btn-outline btn-sm">
                            <i class="fas fa-reply"></i>
                            Open Chat & Verify
                        </a>
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
