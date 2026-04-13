import { db, auth } from './firebase-config.js';
import { writeAuditLog } from './audit-log.js';
import {
    collection,
    doc,
    getDoc,
    addDoc,
    query,
    orderBy,
    onSnapshot,
    serverTimestamp,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatItemTitle = document.getElementById('chat-item-title');
const chatSubInfo = document.getElementById('chat-sub-info');
const chatStatusBadge = document.getElementById('chat-status-badge');
const sendBtn = document.getElementById('send-btn');
const handoverBtn = document.getElementById('handover-btn'); // For staff only
const chatItemPreview = document.getElementById('chat-item-preview');
const CHAT_ITEM_FALLBACK_IMAGE = 'https://via.placeholder.com/120x120?text=No+Image';

let currentChatId = null;
let currentChatDoc = null;
let unsubscribeMessages = null;

// Get Chat ID from URL
const urlParams = new URLSearchParams(window.location.search);
currentChatId = urlParams.get('chatId');

if (!currentChatId && document.getElementById('chat-container')) {
    alert("Invalid Chat Session.");
    window.history.back();
}

function scrollToBottom() {
    if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// Format Timestamp
function formatTime(timestamp) {
    if (!timestamp) return 'Sending...';
    const date = timestamp.toDate();
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function resolveChatImageUrl(chatDoc) {
    if (chatDoc?.itemImageUrl) {
        return chatDoc.itemImageUrl;
    }

    if (chatDoc?.itemId) {
        try {
            const itemDoc = await getDoc(doc(db, "items", chatDoc.itemId));
            if (itemDoc.exists()) {
                return itemDoc.data().imageUrl || CHAT_ITEM_FALLBACK_IMAGE;
            }
        } catch (error) {
            console.error("Error resolving chat item image:", error);
        }
    }

    return CHAT_ITEM_FALLBACK_IMAGE;
}

// Initialize Chat Interface
auth.onAuthStateChanged(async (user) => {
    if (!user || !currentChatId) {
        // Not on chat page or not logged in, ignore
        return;
    }

    try {
        const chatRef = doc(db, "chats", currentChatId);

        // Listen to Chat Document changes (status updates)
        onSnapshot(chatRef, async (docSnap) => {
            if (docSnap.exists()) {
                currentChatDoc = docSnap.data();
                if (chatItemTitle) chatItemTitle.textContent = `Claim: ${currentChatDoc.itemTitle}`;
                if (chatItemPreview) {
                    const imageUrl = await resolveChatImageUrl(currentChatDoc);
                    chatItemPreview.innerHTML = `
                        <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(currentChatDoc.itemTitle || 'Claimed item')}" class="chat-item-preview__image">
                    `;
                }

                // Determine user role (Staff vs Regular User)
                const userDoc = await getDoc(doc(db, "users", user.uid));
                const isStaff = userDoc.exists() && ['staff', 'admin'].includes(userDoc.data().role);

                if (isStaff) {
                    if (chatSubInfo) chatSubInfo.textContent = `Claimant: ${currentChatDoc.userName}`;
                    // Staff claiming the ticket functionality
                    if (!currentChatDoc.staffId) {
                        // First staff to open it gets assigned
                        await updateDoc(chatRef, { staffId: user.uid });
                    }
                } else {
                    if (chatSubInfo) chatSubInfo.textContent = currentChatDoc.staffId ? `Connected to Staff` : `Waiting for Staff...`;
                }

                // Update Status Badge
                if (currentChatDoc.status === 'closed') {
                    if (chatStatusBadge) {
                        chatStatusBadge.textContent = "Resolved & Closed";
                        chatStatusBadge.className = "chat-status-badge status-closed";
                    }
                    if (chatInput) {
                        chatInput.disabled = true;
                        chatInput.placeholder = "This chat is closed.";
                    }
                    if (sendBtn) sendBtn.disabled = true;
                    if (handoverBtn) handoverBtn.hidden = true;
                }
            } else {
                alert("Chat session not found.");
            }
        });

        // Listen to Messages subcollection in real-time
        const q = query(
            collection(db, "chats", currentChatId, "messages"),
            orderBy("createdAt", "asc")
        );

        unsubscribeMessages = onSnapshot(q, (snapshot) => {
            if (!chatMessages) return;
            chatMessages.innerHTML = ''; // Clear loading message

            if (snapshot.empty) {
                chatMessages.innerHTML = `<div class="sys-message">Secure chat initiated. ${currentChatDoc?.staffId ? 'Staff' : 'Student'} has joined the channel.</div>`;
                return;
            }

            snapshot.forEach((msgDoc) => {
                const msg = msgDoc.data();
                const isMine = msg.senderId === user.uid;

                if (msg.senderId === 'system') {
                    const msgDiv = document.createElement('div');
                    msgDiv.className = 'sys-message';
                    msgDiv.textContent = msg.text;
                    chatMessages.appendChild(msgDiv);
                    return;
                }

                const msgDiv = document.createElement('div');
                msgDiv.className = `message ${isMine ? 'message-sent' : 'message-received'}`;

                msgDiv.innerHTML = `
                    <div class="message-text">${msg.text}</div>
                    <span class="message-meta">${formatTime(msg.createdAt)}</span>
                `;

                chatMessages.appendChild(msgDiv);
            });
            scrollToBottom();
        });

    } catch (error) {
        console.error("Error loading chat:", error);
        if (chatItemTitle) chatItemTitle.textContent = "Error loading chat.";
    }
});

// Send Message
if (chatForm) {
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const messageText = chatInput.value.trim();
        if (!messageText || !currentChatId || !auth.currentUser) return;

        // Prevent sending if closed
        if (currentChatDoc && currentChatDoc.status === 'closed') return;

        chatInput.value = ''; // UI clear instantly for responsiveness

        try {
            await addDoc(collection(db, "chats", currentChatId, "messages"), {
                senderId: auth.currentUser.uid,
                text: messageText,
                createdAt: serverTimestamp()
            });

            // Update chat's updatedAt field
            await updateDoc(doc(db, "chats", currentChatId), {
                updatedAt: serverTimestamp()
            });

        } catch (error) {
            console.error("Error sending message:", error);
            alert("Failed to send message: " + error.message);
        }
    });
}

// Handover Logic (Staff Only)
if (handoverBtn) {
    handoverBtn.addEventListener('click', async () => {
        if (!currentChatId || !currentChatDoc) return;

        if (confirm("Are you sure you want to mark this item as Handed Over to the user? This will close the chat permanently.")) {
            try {
                // 1. Close the chat
                await updateDoc(doc(db, "chats", currentChatId), {
                    status: 'closed',
                    updatedAt: serverTimestamp()
                });

                // 2. Mark the item as resolved
                const itemPayload = {
                    status: 'resolved',
                    resolvedBy: auth.currentUser.uid,
                    resolvedAt: serverTimestamp()
                };

                if (currentChatDoc.userName) {
                    itemPayload.handedOverTo = currentChatDoc.userName;
                }

                await updateDoc(doc(db, "items", currentChatDoc.itemId), itemPayload);

                // 3. Add system message
                await addDoc(collection(db, "chats", currentChatId, "messages"), {
                    senderId: 'system',
                    text: `Staff has verified ownership and handed over the item. Chat is now closed.`,
                    createdAt: serverTimestamp()
                });

                await writeAuditLog({
                    type: 'item_resolved',
                    message: `Item ${currentChatDoc.itemTitle || currentChatDoc.itemId} was handed over and the chat was closed.`,
                    targetId: currentChatDoc.itemId,
                    targetType: 'item',
                    meta: {
                        chatId: currentChatId,
                        handedOverTo: currentChatDoc.userName || '',
                        source: 'chat'
                    }
                });

                alert("Item marked as resolved and handed over!");
            } catch (error) {
                console.error("Handover error:", error);
                alert("Error: " + error.message);
            }
        }
    });
}
