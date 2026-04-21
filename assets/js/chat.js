import { auth, db } from './firebase-config.js';
import { writeAuditLog } from './audit-log.js';
import {
    addDoc,
    collection,
    doc,
    getDoc,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const pathName = window.location.pathname;
const searchParams = new URLSearchParams(window.location.search);
const roleScope = pathName.includes('/admin/') ? 'admin' : pathName.includes('/staff/') ? 'staff' : pathName.includes('/user/') ? 'user' : null;
const isStaffScope = roleScope === 'staff' || roleScope === 'admin';
const dashboardPath = roleScope ? `/${roleScope}/dashboard` : null;
const CHAT_ATTACHMENT_API_BASE = '/api/chat-attachments';

if (dashboardPath && /\/(?:user|staff|admin)\/chat(?:\.html)?$/.test(pathName)) {
    window.location.replace(`${dashboardPath}${window.location.search}${window.location.hash}`);
}

const requestedChatId = searchParams.get('chatId');

if (!roleScope) {
    // This embeddable widget only runs on logged-in user, staff, and admin pages.
} else {
    const CHAT_ITEM_FALLBACK_IMAGE = 'https://via.placeholder.com/120x120?text=No+Image';
    const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
    const ACCEPTED_ATTACHMENT_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'txt', 'zip', 'rar']);
    const ACCEPTED_ATTACHMENT_MIME_PATTERNS = [
        /^image\//,
        /^application\/pdf$/,
        /^text\/plain$/,
        /^application\/msword$/,
        /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$/,
        /^application\/zip$/,
        /^application\/x-zip-compressed$/,
        /^application\/vnd\.rar$/,
        /^application\/x-rar-compressed$/
    ];
    const EMOJI_OPTIONS = ['🙂', '😀', '😂', '😅', '😊', '😍', '🙏', '👍', '👏', '✅', '📄', '📎', '❤️', '😢', '🤝', '🎓'];

    const state = {
        user: null,
        threads: [],
        currentChatId: requestedChatId || null,
        currentChatDoc: null,
        currentChatReadOnly: false,
        selectedFile: null,
        isOpen: false,
        isBusy: false,
        threadMenuOpen: false,
        emojiOpen: false,
        requestedChatId,
        threadsUnsubscribe: null,
        chatUnsubscribe: null,
        messagesUnsubscribe: null
    };

    const elements = {};
    const claimedChatIds = new Set();
    const attachmentUrlCache = new Map();
    const imageUrlCache = new Map();
    let threadRenderToken = 0;
    let messageRenderToken = 0;

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatMessageText(value) {
        return escapeHtml(String(value ?? '')).replace(/\n/g, '<br>');
    }

    function getResolvedTimestampValue(timestamp) {
        if (!timestamp) return 0;
        if (typeof timestamp.toMillis === 'function') {
            return timestamp.toMillis();
        }
        if (typeof timestamp.seconds === 'number') {
            return timestamp.seconds * 1000;
        }
        return 0;
    }

    function sortChatsByUpdatedAtDesc(left, right) {
        return getResolvedTimestampValue(right.updatedAt || right.createdAt) - getResolvedTimestampValue(left.updatedAt || left.createdAt);
    }

    function formatTime(timestamp) {
        if (!timestamp?.toDate) {
            return 'Sending...';
        }

        return timestamp.toDate().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function formatBytes(size) {
        if (!Number.isFinite(size) || size <= 0) {
            return 'Unknown size';
        }

        const units = ['B', 'KB', 'MB', 'GB'];
        const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
        const value = size / (1024 ** exponent);
        return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
    }

    function getFileExtension(fileName) {
        const parts = String(fileName || '').toLowerCase().split('.');
        return parts.length > 1 ? parts.pop() : '';
    }

    function sanitizeFileName(fileName) {
        return String(fileName || 'attachment')
            .replace(/[^a-zA-Z0-9._-]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 120) || 'attachment';
    }

    function isAcceptedAttachment(file) {
        if (!file) {
            return 'Please choose a file first.';
        }

        if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
            return 'File must be 10 MB or smaller.';
        }

        const extension = getFileExtension(file.name);
        const mimeType = String(file.type || '').toLowerCase();
        const isAcceptedByMime = ACCEPTED_ATTACHMENT_MIME_PATTERNS.some((pattern) => pattern.test(mimeType));
        const isAcceptedByExtension = ACCEPTED_ATTACHMENT_EXTENSIONS.has(extension);

        if (!isAcceptedByMime && !isAcceptedByExtension) {
            return 'Use a common proof file such as image, PDF, DOC, DOCX, TXT, ZIP, or RAR.';
        }

        return '';
    }

    function resolveAttachmentContentType(file) {
        const browserType = String(file?.type || '').toLowerCase();
        const extension = getFileExtension(file?.name || '');

        if (ACCEPTED_ATTACHMENT_MIME_PATTERNS.some((pattern) => pattern.test(browserType))) {
            return browserType;
        }

        if (['jpg', 'jpeg'].includes(extension)) return 'image/jpeg';
        if (extension === 'png') return 'image/png';
        if (extension === 'gif') return 'image/gif';
        if (extension === 'webp') return 'image/webp';
        if (extension === 'pdf') return 'application/pdf';
        if (extension === 'doc') return 'application/msword';
        if (extension === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        if (extension === 'txt') return 'text/plain';
        if (extension === 'zip') return 'application/zip';
        if (extension === 'rar') return 'application/x-rar-compressed';

        return browserType;
    }

    function getAttachmentKind(attachment) {
        const contentType = String(attachment?.contentType || attachment?.type || '').toLowerCase();
        const extension = getFileExtension(attachment?.name || '');

        if (contentType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) {
            return 'image';
        }

        return 'file';
    }

    function getAttachmentIconClass(attachment) {
        const contentType = String(attachment?.contentType || '').toLowerCase();
        const extension = getFileExtension(attachment?.name || '');

        if (getAttachmentKind(attachment) === 'image') {
            return 'fa-file-image';
        }
        if (contentType === 'application/pdf' || extension === 'pdf') {
            return 'fa-file-pdf';
        }
        if (contentType.includes('word') || ['doc', 'docx'].includes(extension)) {
            return 'fa-file-word';
        }
        if (contentType.includes('zip') || contentType.includes('rar') || ['zip', 'rar'].includes(extension)) {
            return 'fa-file-zipper';
        }
        if (contentType === 'text/plain' || extension === 'txt') {
            return 'fa-file-lines';
        }

        return 'fa-file';
    }

    function getCachedAttachmentUrl(filePath) {
        const cachedEntry = attachmentUrlCache.get(filePath);

        if (!cachedEntry) {
            return '';
        }

        if (cachedEntry.expiresAt <= Date.now()) {
            attachmentUrlCache.delete(filePath);
            return '';
        }

        return cachedEntry.url;
    }

    function cacheAttachmentUrl(filePath, url, expiresInSeconds = 3600) {
        if (!filePath || !url) {
            return;
        }

        attachmentUrlCache.set(filePath, {
            url,
            expiresAt: Date.now() + Math.max(30, Number(expiresInSeconds || 3600) - 30) * 1000
        });
    }

    async function getFirebaseAuthToken() {
        if (!state.user) {
            throw new Error('You must be signed in to access chat attachments.');
        }

        return state.user.getIdToken();
    }

    async function parseJsonResponse(response) {
        const responseText = await response.text();

        if (!responseText) {
            return {};
        }

        try {
            return JSON.parse(responseText);
        } catch (error) {
            return {
                error: responseText
            };
        }
    }

    async function uploadChatAttachment({ chatId, messageId, file }) {
        const authToken = await getFirebaseAuthToken();
        const formData = new FormData();
        formData.append('chatId', chatId);
        formData.append('messageId', messageId);
        formData.append('file', file);

        const response = await fetch(`${CHAT_ATTACHMENT_API_BASE}/upload`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${authToken}`
            },
            body: formData
        });

        const payload = await parseJsonResponse(response);

        if (!response.ok) {
            throw new Error(payload?.error || 'Could not upload the attachment.');
        }

        if (payload?.attachment?.path && payload?.attachment?.url) {
            cacheAttachmentUrl(payload.attachment.path, payload.attachment.url, payload.expiresIn);
        }

        if (!payload?.attachment) {
            return null;
        }

        const { url: _ephemeralUrl, ...persistedAttachment } = payload.attachment;
        return persistedAttachment;
    }

    async function signChatAttachmentPaths(paths) {
        const authToken = await getFirebaseAuthToken();
        const response = await fetch(`${CHAT_ATTACHMENT_API_BASE}/sign`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${authToken}`
            },
            body: JSON.stringify({ paths })
        });

        const payload = await parseJsonResponse(response);

        if (!response.ok) {
            throw new Error(payload?.error || 'Could not access one or more chat attachments.');
        }

        return payload;
    }

    async function deleteChatAttachment(filePath) {
        if (!filePath) {
            return;
        }

        const authToken = await getFirebaseAuthToken();
        const response = await fetch(`${CHAT_ATTACHMENT_API_BASE}/delete`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${authToken}`
            },
            body: JSON.stringify({ path: filePath })
        });

        const payload = await parseJsonResponse(response);

        if (!response.ok) {
            throw new Error(payload?.error || 'Could not delete the uploaded attachment.');
        }
    }

    async function resolveAttachmentUrls(messages) {
        const pathsNeedingSignedUrls = [...new Set(
            messages
                .map((message) => message?.attachment)
                .filter((attachment) => attachment?.path && !attachment?.url && !getCachedAttachmentUrl(attachment.path))
                .map((attachment) => attachment.path)
        )];

        if (pathsNeedingSignedUrls.length) {
            const signedPayload = await signChatAttachmentPaths(pathsNeedingSignedUrls);

            Object.entries(signedPayload?.urls || {}).forEach(([filePath, signedUrl]) => {
                cacheAttachmentUrl(filePath, signedUrl, signedPayload?.expiresIn);
            });
        }

        return messages.map((message) => {
            if (!message?.attachment) {
                return message;
            }

            const resolvedUrl = message.attachment.url || getCachedAttachmentUrl(message.attachment.path) || '';

            return {
                ...message,
                attachment: {
                    ...message.attachment,
                    url: resolvedUrl
                }
            };
        });
    }

    function getThreadLabel(chat) {
        const isClosed = chat.status === 'closed';

        if (isStaffScope) {
            if (isClosed) {
                return 'Closed';
            }
            if (!chat.staffId) {
                return 'Unassigned';
            }
            if (chat.staffId === state.user?.uid) {
                return 'Assigned to you';
            }
            return 'Assigned elsewhere';
        }

        if (isClosed) {
            return 'Closed';
        }
        return chat.staffId ? 'Connected to staff' : 'Waiting for staff';
    }

    function setFeedback(message = '', type = 'info') {
        if (!elements.feedback) {
            return;
        }

        elements.feedback.textContent = message;
        elements.feedback.hidden = !message;
        elements.feedback.className = `chat-widget__feedback${message ? ` chat-widget__feedback--${type}` : ''}`;
    }

    function markWidgetSeen() {
        if (!state.user) {
            return;
        }

        try {
            window.localStorage.setItem(`chat-widget-seen:${roleScope}:${state.user.uid}`, '1');
        } catch (error) {
            console.warn('Could not persist chat widget visibility state:', error);
        }
    }

    function shouldOpenOnFirstLaunch() {
        if (!state.user) {
            return false;
        }

        if (state.requestedChatId) {
            return true;
        }

        try {
            return window.localStorage.getItem(`chat-widget-seen:${roleScope}:${state.user.uid}`) !== '1';
        } catch (error) {
            return true;
        }
    }

    function updateQueryParam(chatId) {
        const url = new URL(window.location.href);

        if (chatId) {
            url.searchParams.set('chatId', chatId);
        } else {
            url.searchParams.delete('chatId');
        }

        window.history.replaceState({}, '', url);
    }

    function getRenderableThreads() {
        const mergedThreads = new Map();

        state.threads.forEach((chat) => {
            mergedThreads.set(chat.id, chat);
        });

        if (state.currentChatDoc && !mergedThreads.has(state.currentChatDoc.id)) {
            mergedThreads.set(state.currentChatDoc.id, state.currentChatDoc);
        }

        return Array.from(mergedThreads.values()).sort(sortChatsByUpdatedAtDesc);
    }

    function isWidgetVisible() {
        return getRenderableThreads().length > 0 || Boolean(state.currentChatDoc) || Boolean(state.requestedChatId);
    }

    function closeTransientPanels() {
        state.threadMenuOpen = false;
        state.emojiOpen = false;

        if (elements.threadMenu) {
            elements.threadMenu.hidden = true;
        }

        if (elements.emojiPicker) {
            elements.emojiPicker.hidden = true;
        }
    }

    function setWidgetOpen(isOpen) {
        state.isOpen = isOpen;

        if (!elements.root || !elements.panel || !elements.launcher) {
            return;
        }

        elements.root.classList.toggle('chat-widget--open', isOpen);
        elements.panel.hidden = !isOpen;
        elements.launcher.setAttribute('aria-expanded', String(isOpen));

        if (isOpen) {
            markWidgetSeen();
            window.requestAnimationFrame(() => {
                if (elements.messages) {
                    elements.messages.scrollTop = elements.messages.scrollHeight;
                }
            });
        } else {
            closeTransientPanels();
        }
    }

    function syncWidgetVisibility() {
        if (!elements.root) {
            return;
        }

        elements.root.hidden = !isWidgetVisible();

        if (!elements.root.hidden) {
            updateLauncher();
        }
    }

    function updateLauncher() {
        if (!elements.launcherLabel || !elements.launcherCount) {
            return;
        }

        const activeCount = state.threads.length;
        const currentTitle = state.currentChatDoc?.itemTitle || getRenderableThreads()[0]?.itemTitle || 'Secure Handover Chat';

        elements.launcherLabel.textContent = activeCount > 1
            ? `${activeCount} active chats`
            : currentTitle;
        elements.launcherCount.textContent = String(activeCount || (state.currentChatDoc ? 1 : 0));
    }

    function clearSelectedFile() {
        state.selectedFile = null;

        if (elements.fileInput) {
            elements.fileInput.value = '';
        }

        if (elements.selectedFile) {
            elements.selectedFile.hidden = true;
        }
    }

    function renderSelectedFile() {
        if (!elements.selectedFile || !elements.selectedFileName || !elements.selectedFileMeta) {
            return;
        }

        if (!state.selectedFile) {
            elements.selectedFile.hidden = true;
            elements.selectedFileName.textContent = '';
            elements.selectedFileMeta.textContent = '';
            return;
        }

        elements.selectedFile.hidden = false;
        elements.selectedFileName.textContent = state.selectedFile.name;
        elements.selectedFileMeta.textContent = `${formatBytes(state.selectedFile.size)} • Ready to send`;
    }

    function syncComposerState() {
        const hasChat = Boolean(state.currentChatDoc);
        const isClosed = state.currentChatDoc?.status === 'closed';
        const isDisabled = !hasChat || isClosed || state.currentChatReadOnly || state.isBusy;

        if (elements.input) {
            elements.input.disabled = isDisabled;
            elements.input.placeholder = !hasChat
                ? 'Select a handover chat to continue...'
                : isClosed
                    ? 'This handover chat is closed.'
                    : state.currentChatReadOnly
                        ? 'This chat is assigned to another staff member.'
                        : 'Write a message or send proof...';
        }

        if (elements.sendButton) {
            elements.sendButton.disabled = isDisabled;
        }

        if (elements.emojiButton) {
            elements.emojiButton.disabled = isDisabled;
        }

        if (elements.fileButton) {
            elements.fileButton.disabled = isDisabled;
        }

        if (elements.clearFileButton) {
            elements.clearFileButton.disabled = state.isBusy;
        }

        if (elements.handoverButton) {
            elements.handoverButton.hidden = !(isStaffScope && hasChat && !isClosed && !state.currentChatReadOnly);
        }
    }

    async function resolveChatImageUrl(chatDoc) {
        if (!chatDoc) {
            return CHAT_ITEM_FALLBACK_IMAGE;
        }

        if (chatDoc.itemImageUrl) {
            imageUrlCache.set(chatDoc.id, chatDoc.itemImageUrl);
            return chatDoc.itemImageUrl;
        }

        if (imageUrlCache.has(chatDoc.id)) {
            return imageUrlCache.get(chatDoc.id);
        }

        if (!chatDoc.itemId) {
            return CHAT_ITEM_FALLBACK_IMAGE;
        }

        try {
            const itemDoc = await getDoc(doc(db, 'items', chatDoc.itemId));
            const resolvedUrl = itemDoc.exists() ? itemDoc.data().imageUrl || CHAT_ITEM_FALLBACK_IMAGE : CHAT_ITEM_FALLBACK_IMAGE;
            imageUrlCache.set(chatDoc.id, resolvedUrl);
            return resolvedUrl;
        } catch (error) {
            console.error('Error resolving chat item image:', error);
            return CHAT_ITEM_FALLBACK_IMAGE;
        }
    }

    async function renderThreadList() {
        if (!elements.threadList || !elements.threadEmpty) {
            return;
        }

        const renderToken = ++threadRenderToken;
        const threads = getRenderableThreads();

        if (!threads.length) {
            elements.threadList.innerHTML = '';
            elements.threadEmpty.hidden = false;
            return;
        }

        const threadCards = await Promise.all(threads.map(async (chat) => {
            const imageUrl = await resolveChatImageUrl(chat);
            return {
                ...chat,
                imageUrl
            };
        }));

        if (renderToken !== threadRenderToken) {
            return;
        }

        elements.threadEmpty.hidden = true;
        elements.threadList.innerHTML = threadCards.map((chat) => `
            <button type="button" class="chat-widget__thread-item${chat.id === state.currentChatId ? ' is-active' : ''}" data-chat-id="${escapeHtml(chat.id)}">
                <img src="${escapeHtml(chat.imageUrl || CHAT_ITEM_FALLBACK_IMAGE)}" alt="${escapeHtml(chat.itemTitle || 'Claimed item')}" class="chat-widget__thread-thumb">
                <span class="chat-widget__thread-copy">
                    <strong>${escapeHtml(chat.itemTitle || 'Untitled Item')}</strong>
                    <span>${escapeHtml(getThreadLabel(chat))}</span>
                </span>
            </button>
        `).join('');
    }

    async function renderCurrentChatContext() {
        if (!elements.chatEyebrow || !elements.chatTitle || !elements.chatSubInfo || !elements.chatStatusBadge || !elements.chatItemPreview) {
            return;
        }

        if (!state.currentChatDoc) {
            if (elements.chatHeaderItem) {
                elements.chatHeaderItem.hidden = true;
            }

            elements.chatEyebrow.textContent = 'Secure Handover Chat';
            elements.chatTitle.textContent = 'Secure Handover Chat';
            elements.chatSubInfo.textContent = isStaffScope ? '' : 'Select a conversation to continue.';
            elements.chatStatusBadge.hidden = isStaffScope;
            elements.chatStatusBadge.textContent = 'Idle';
            elements.chatStatusBadge.className = 'chat-status-badge chat-status-badge--idle';
            elements.chatItemPreview.innerHTML = '';
            return;
        }

        const activeChatId = state.currentChatDoc.id;
        const imageUrl = await resolveChatImageUrl(state.currentChatDoc);

        if (!state.currentChatDoc || state.currentChatDoc.id !== activeChatId) {
            return;
        }

        if (elements.chatHeaderItem) {
            elements.chatHeaderItem.hidden = false;
        }

        elements.chatEyebrow.textContent = isStaffScope
            ? (state.currentChatDoc.userName || 'Unknown User')
            : 'Secure Handover Chat';
        elements.chatTitle.textContent = state.currentChatDoc.itemTitle || 'Untitled Item';

        if (isStaffScope) {
            elements.chatSubInfo.textContent = '';
        } else if (state.currentChatDoc.status === 'closed') {
            elements.chatSubInfo.textContent = 'Ownership has been verified and the handover is complete.';
        } else {
            elements.chatSubInfo.textContent = state.currentChatDoc.staffId
                ? 'Connected to staff. Send proof or ask for updates here.'
                : 'Waiting for staff to join. You can send proof documents now.';
            elements.chatStatusBadge.hidden = false;
            elements.chatStatusBadge.textContent = state.currentChatDoc.staffId ? 'Active' : 'Waiting';
            elements.chatStatusBadge.className = `chat-status-badge ${state.currentChatDoc.staffId ? 'chat-status-badge--active' : 'chat-status-badge--waiting'}`;
        }

        if (isStaffScope) {
            elements.chatStatusBadge.hidden = true;
        } else if (state.currentChatDoc.status === 'closed') {
            elements.chatStatusBadge.hidden = false;
            elements.chatStatusBadge.textContent = 'Closed';
            elements.chatStatusBadge.className = 'chat-status-badge chat-status-badge--closed';
        }

        elements.chatItemPreview.innerHTML = `
            <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(state.currentChatDoc.itemTitle || 'Claimed item')}" class="chat-item-preview__image">
        `;
    }

    function buildAttachmentMarkup(attachment) {
        if (!attachment?.url) {
            if (!attachment?.name) {
                return '';
            }

            return `
                <div class="chat-attachment chat-attachment--file" role="note">
                    <i class="fas ${getAttachmentIconClass(attachment)} chat-attachment__icon" aria-hidden="true"></i>
                    <span class="chat-attachment__copy">
                        <strong>${escapeHtml(attachment.name || 'Attachment')}</strong>
                        <span>Attachment is temporarily unavailable.</span>
                    </span>
                </div>
            `;
        }

        const kind = getAttachmentKind(attachment);

        if (kind === 'image') {
            return `
                <a class="chat-attachment chat-attachment--image" href="${escapeHtml(attachment.url)}" target="_blank" rel="noopener noreferrer">
                    <img src="${escapeHtml(attachment.url)}" alt="${escapeHtml(attachment.name || 'Attached proof image')}">
                    <span>Open image proof</span>
                </a>
            `;
        }

        return `
            <a class="chat-attachment chat-attachment--file" href="${escapeHtml(attachment.url)}" target="_blank" rel="noopener noreferrer">
                <i class="fas ${getAttachmentIconClass(attachment)} chat-attachment__icon" aria-hidden="true"></i>
                <span class="chat-attachment__copy">
                    <strong>${escapeHtml(attachment.name || 'Attachment')}</strong>
                    <span>${escapeHtml(`${formatBytes(attachment.size)} • ${attachment.contentType || 'Document'}`)}</span>
                </span>
                <i class="fas fa-download chat-attachment__download" aria-hidden="true"></i>
            </a>
        `;
    }

    async function renderMessages(snapshot) {
        if (!elements.messages) {
            return;
        }

        const renderToken = ++messageRenderToken;

        if (snapshot.empty) {
            const emptyMessage = state.currentChatDoc?.status === 'closed'
                ? 'This handover chat has been closed.'
                : isStaffScope
                    ? 'No messages yet. Ask the claimant for proof details when you are ready.'
                    : 'Secure chat started. Staff will review your case here. You can send proof documents anytime.';
            elements.messages.innerHTML = `<div class="sys-message">${escapeHtml(emptyMessage)}</div>`;
            return;
        }

        let messages = snapshot.docs.map((messageDoc) => ({
            id: messageDoc.id,
            ...messageDoc.data()
        }));

        try {
            messages = await resolveAttachmentUrls(messages);
        } catch (error) {
            console.error('Could not resolve private attachment URLs:', error);
        }

        if (renderToken !== messageRenderToken) {
            return;
        }

        elements.messages.innerHTML = '';

        messages.forEach((message) => {
            if (message.senderId === 'system') {
                const systemMessage = document.createElement('div');
                systemMessage.className = 'sys-message';
                systemMessage.textContent = message.text || 'System update';
                elements.messages.appendChild(systemMessage);
                return;
            }

            const isMine = message.senderId === state.user?.uid;
            const wrapper = document.createElement('div');
            wrapper.className = `message ${isMine ? 'message-sent' : 'message-received'}`;

            wrapper.innerHTML = `
                ${message.text ? `<div class="message-text">${formatMessageText(message.text)}</div>` : ''}
                ${buildAttachmentMarkup(message.attachment)}
                <span class="message-meta">${formatTime(message.createdAt)}</span>
            `;

            elements.messages.appendChild(wrapper);
        });

        window.requestAnimationFrame(() => {
            elements.messages.scrollTop = elements.messages.scrollHeight;
        });
    }

    function unsubscribeCurrentChatListeners() {
        if (typeof state.chatUnsubscribe === 'function') {
            state.chatUnsubscribe();
        }

        if (typeof state.messagesUnsubscribe === 'function') {
            state.messagesUnsubscribe();
        }

        state.chatUnsubscribe = null;
        state.messagesUnsubscribe = null;
    }

    async function claimChatIfNeeded(chatRef, chatData) {
        if (!isStaffScope || !state.user || chatData.staffId || claimedChatIds.has(chatData.id)) {
            return;
        }

        claimedChatIds.add(chatData.id);

        try {
            await updateDoc(chatRef, {
                staffId: state.user.uid,
                updatedAt: serverTimestamp()
            });
        } catch (error) {
            console.error('Error claiming chat:', error);
            setFeedback('Could not assign this chat to your staff account.', 'error');
        } finally {
            claimedChatIds.delete(chatData.id);
        }
    }

    function renderLoadingState() {
        if (!elements.messages) {
            return;
        }

        elements.messages.innerHTML = '<div class="sys-message">Loading messages...</div>';
    }

    function selectChat(chatId, options = {}) {
        if (!chatId || !state.user) {
            return;
        }

        state.currentChatId = chatId;
        updateQueryParam(chatId);
        clearSelectedFile();
        closeTransientPanels();
        setFeedback('');
        renderLoadingState();
        syncComposerState();
        renderThreadList().catch((error) => {
            console.error('Thread list render failed:', error);
        });

        const chatRef = doc(db, 'chats', chatId);

        unsubscribeCurrentChatListeners();

        state.chatUnsubscribe = onSnapshot(chatRef, async (chatSnapshot) => {
            if (!chatSnapshot.exists()) {
                state.requestedChatId = null;
                state.currentChatDoc = null;
                state.currentChatReadOnly = false;
                updateQueryParam(null);
                await renderCurrentChatContext();
                renderLoadingState();
                setFeedback('This handover chat is no longer available.', 'error');
                syncComposerState();
                syncWidgetVisibility();

                if (state.threads.length) {
                    selectChat(state.threads[0].id, { open: true });
                }
                return;
            }

            const chatData = {
                id: chatSnapshot.id,
                ...chatSnapshot.data()
            };

            await claimChatIfNeeded(chatRef, chatData);

            state.currentChatDoc = chatData;
            state.currentChatReadOnly = isStaffScope && Boolean(chatData.staffId && chatData.staffId !== state.user.uid);

            if (state.currentChatReadOnly) {
                setFeedback('This chat is already assigned to another staff member. Viewing is read-only.', 'info');
            } else {
                setFeedback('');
            }

            await renderCurrentChatContext();
            renderThreadList().catch((error) => {
                console.error('Thread list render failed:', error);
            });
            syncComposerState();
            syncWidgetVisibility();
        }, (error) => {
            console.error('Error subscribing to chat document:', error);
            state.requestedChatId = null;
            updateQueryParam(null);
            setFeedback('Could not load this handover chat.', 'error');
            syncWidgetVisibility();
        });

        state.messagesUnsubscribe = onSnapshot(
            query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc')),
            (snapshot) => {
                renderMessages(snapshot).catch((error) => {
                    console.error('Error rendering chat messages:', error);
                    if (elements.messages) {
                        elements.messages.innerHTML = '<div class="sys-message">Could not load the chat history.</div>';
                    }
                    setFeedback('Could not load the chat history.', 'error');
                });
            },
            (error) => {
                console.error('Error loading chat messages:', error);
                if (elements.messages) {
                    elements.messages.innerHTML = '<div class="sys-message">Could not load the chat history.</div>';
                }
                setFeedback('Could not load the chat history.', 'error');
            }
        );

        if (options.open) {
            setWidgetOpen(true);
        }
    }

    async function subscribeToThreadList() {
        if (!state.user) {
            return;
        }

        if (typeof state.threadsUnsubscribe === 'function') {
            state.threadsUnsubscribe();
        }

        const threadQuery = query(
            collection(db, 'chats'),
            where(isStaffScope ? 'staffId' : 'userId', '==', state.user.uid)
        );

        state.threadsUnsubscribe = onSnapshot(threadQuery, async (snapshot) => {
            state.threads = snapshot.docs
                .map((chatDoc) => ({
                    id: chatDoc.id,
                    ...chatDoc.data()
                }))
                .filter((chat) => chat.status === 'active')
                .sort(sortChatsByUpdatedAtDesc);

            await renderThreadList();
            syncWidgetVisibility();

            if (!state.currentChatId && state.threads.length) {
                selectChat(state.threads[0].id, { open: shouldOpenOnFirstLaunch() });
                return;
            }

            if (!state.currentChatId && !state.threads.length) {
                setWidgetOpen(false);
            }

            updateLauncher();
        }, (error) => {
            console.error('Error subscribing to chat list:', error);
            setFeedback('Could not load active chats.', 'error');
        });
    }

    function renderEmojiPicker() {
        if (!elements.emojiPicker) {
            return;
        }

        elements.emojiPicker.innerHTML = EMOJI_OPTIONS.map((emoji) => `
            <button type="button" class="chat-widget__emoji-option" data-emoji="${emoji}" aria-label="Insert ${emoji}">
                ${emoji}
            </button>
        `).join('');
    }

    function insertEmoji(emoji) {
        if (!elements.input || elements.input.disabled) {
            return;
        }

        const input = elements.input;
        const start = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
        const end = typeof input.selectionEnd === 'number' ? input.selectionEnd : input.value.length;
        const nextValue = `${input.value.slice(0, start)}${emoji}${input.value.slice(end)}`;
        const cursorPosition = start + emoji.length;

        input.value = nextValue;
        input.focus();
        input.setSelectionRange(cursorPosition, cursorPosition);
    }

    async function handleFileSelection(event) {
        const [file] = Array.from(event.target.files || []);

        if (!file) {
            clearSelectedFile();
            return;
        }

        const validationError = isAcceptedAttachment(file);
        if (validationError) {
            clearSelectedFile();
            setFeedback(validationError, 'error');
            return;
        }

        state.selectedFile = file;
        renderSelectedFile();
        setFeedback('');
    }

    async function handleSend(event) {
        event.preventDefault();

        if (!state.user || !state.currentChatId || !state.currentChatDoc || state.currentChatReadOnly || state.currentChatDoc.status === 'closed' || state.isBusy) {
            return;
        }

        const messageText = elements.input ? elements.input.value.trim() : '';
        const file = state.selectedFile;

        if (!messageText && !file) {
            setFeedback('Type a message or attach a proof document before sending.', 'error');
            return;
        }

        state.isBusy = true;
        syncComposerState();
        setFeedback(file ? 'Uploading proof document...' : 'Sending message...', 'info');

        const messageRef = doc(collection(db, 'chats', state.currentChatId, 'messages'));
        let uploadedAttachmentPath = '';

        try {
            let attachment = null;

            if (file) {
                attachment = await uploadChatAttachment({
                    chatId: state.currentChatId,
                    messageId: messageRef.id,
                    file
                });
                uploadedAttachmentPath = attachment?.path || '';
            }

            const payload = {
                senderId: state.user.uid,
                text: messageText,
                createdAt: serverTimestamp()
            };

            if (attachment) {
                payload.attachment = attachment;
            }

            await setDoc(messageRef, payload);
            await updateDoc(doc(db, 'chats', state.currentChatId), {
                updatedAt: serverTimestamp()
            });

            if (elements.input) {
                elements.input.value = '';
            }

            clearSelectedFile();
            setFeedback('');
        } catch (error) {
            console.error('Error sending chat message:', error);

            if (uploadedAttachmentPath) {
                try {
                    await deleteChatAttachment(uploadedAttachmentPath);
                } catch (cleanupError) {
                    console.error('Failed to remove orphaned chat attachment:', cleanupError);
                }
            }

            setFeedback('Message could not be sent. Please try again.', 'error');
        } finally {
            state.isBusy = false;
            syncComposerState();
        }
    }

    async function handleHandover() {
        if (!state.currentChatId || !state.currentChatDoc || !isStaffScope || state.currentChatReadOnly) {
            return;
        }

        if (!window.confirm('Mark this item as verified and handed over? This will permanently close the chat.')) {
            return;
        }

        try {
            await updateDoc(doc(db, 'chats', state.currentChatId), {
                status: 'closed',
                updatedAt: serverTimestamp()
            });

            const itemPayload = {
                status: 'resolved',
                resolvedBy: state.user.uid,
                resolvedAt: serverTimestamp()
            };

            if (state.currentChatDoc.userName) {
                itemPayload.handedOverTo = state.currentChatDoc.userName;
            }

            await updateDoc(doc(db, 'items', state.currentChatDoc.itemId), itemPayload);
            await addDoc(collection(db, 'chats', state.currentChatId, 'messages'), {
                senderId: 'system',
                text: 'Staff has verified ownership and completed the handover. This chat is now closed.',
                createdAt: serverTimestamp()
            });

            await writeAuditLog({
                type: 'item_resolved',
                message: `Item ${state.currentChatDoc.itemTitle || state.currentChatDoc.itemId} was handed over and the chat was closed.`,
                targetId: state.currentChatDoc.itemId,
                targetType: 'item',
                meta: {
                    chatId: state.currentChatId,
                    handedOverTo: state.currentChatDoc.userName || '',
                    source: 'chat_widget'
                }
            });

            setFeedback('Item marked as handed over.', 'success');
        } catch (error) {
            console.error('Error completing handover:', error);
            setFeedback('Could not complete the handover. Please try again.', 'error');
        }
    }

    function handleDocumentClick(event) {
        if (state.threadMenuOpen && elements.threadMenu && elements.threadMenuButton && !elements.threadMenu.contains(event.target) && !elements.threadMenuButton.contains(event.target)) {
            state.threadMenuOpen = false;
            elements.threadMenu.hidden = true;
        }

        if (state.emojiOpen && elements.emojiPicker && elements.emojiButton && !elements.emojiPicker.contains(event.target) && !elements.emojiButton.contains(event.target)) {
            state.emojiOpen = false;
            elements.emojiPicker.hidden = true;
        }
    }

    function bindWidgetEvents() {
        elements.launcher.addEventListener('click', () => {
            setWidgetOpen(!state.isOpen);
        });

        elements.minimizeButton.addEventListener('click', () => {
            setWidgetOpen(false);
        });

        elements.threadMenuButton.addEventListener('click', () => {
            state.threadMenuOpen = !state.threadMenuOpen;
            elements.threadMenu.hidden = !state.threadMenuOpen;
            if (state.threadMenuOpen) {
                state.emojiOpen = false;
                elements.emojiPicker.hidden = true;
            }
        });

        elements.threadList.addEventListener('click', (event) => {
            const chatButton = event.target.closest('[data-chat-id]');
            if (!chatButton) {
                return;
            }

            state.threadMenuOpen = false;
            elements.threadMenu.hidden = true;
            selectChat(chatButton.dataset.chatId, { open: true });
        });

        elements.emojiButton.addEventListener('click', () => {
            if (elements.emojiButton.disabled) {
                return;
            }

            state.emojiOpen = !state.emojiOpen;
            elements.emojiPicker.hidden = !state.emojiOpen;
            if (state.emojiOpen) {
                state.threadMenuOpen = false;
                elements.threadMenu.hidden = true;
            }
        });

        elements.emojiPicker.addEventListener('click', (event) => {
            const emojiButton = event.target.closest('[data-emoji]');
            if (!emojiButton) {
                return;
            }

            insertEmoji(emojiButton.dataset.emoji);
            state.emojiOpen = false;
            elements.emojiPicker.hidden = true;
        });

        elements.fileButton.addEventListener('click', () => {
            if (elements.fileButton.disabled) {
                return;
            }

            elements.fileInput.click();
        });

        elements.fileInput.addEventListener('change', handleFileSelection);
        elements.clearFileButton.addEventListener('click', () => {
            clearSelectedFile();
            setFeedback('');
        });
        elements.form.addEventListener('submit', handleSend);

        if (elements.handoverButton) {
            elements.handoverButton.addEventListener('click', handleHandover);
        }

        document.addEventListener('click', handleDocumentClick);
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') {
                return;
            }

            if (state.emojiOpen || state.threadMenuOpen) {
                closeTransientPanels();
                return;
            }

            if (state.isOpen) {
                setWidgetOpen(false);
            }
        });
    }

    function createWidgetMarkup() {
        return `
            <section class="chat-widget" id="chat-widget-root" hidden>
                <button type="button" class="chat-widget__launcher" id="chat-widget-launcher" aria-expanded="false" aria-controls="chat-widget-panel">
                    <span class="chat-widget__launcher-icon"><i class="fas fa-comments" aria-hidden="true"></i></span>
                    <span class="chat-widget__launcher-copy">
                        <strong>Secure Chat</strong>
                        <span id="chat-widget-launcher-label">Open handover chat</span>
                    </span>
                    <span class="chat-widget__launcher-count" id="chat-widget-launcher-count">0</span>
                </button>

                <section class="chat-widget__panel" id="chat-widget-panel" hidden aria-label="Secure handover chat widget">
                    <header class="chat-widget__panel-header${isStaffScope ? ' chat-widget__panel-header--staff' : ''}">
                        ${isStaffScope ? `
                            <div class="chat-widget__panel-head-row">
                                <span class="chat-widget__eyebrow" id="chat-widget-eyebrow">Secure Handover Chat</span>
                                <div class="chat-widget__panel-top-actions">
                                    <span class="chat-status-badge chat-status-badge--idle" id="chat-widget-status-badge" hidden>Idle</span>
                                    <button type="button" class="chat-widget__icon-btn" id="chat-widget-minimize-btn" aria-label="Minimize chat">
                                        <i class="fas fa-minus" aria-hidden="true"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="chat-widget__panel-subrow">
                                <div class="chat-widget__header-item" id="chat-widget-header-item" hidden>
                                    <div id="chat-widget-item-preview" class="chat-item-preview chat-item-preview--compact" aria-hidden="true"></div>
                                    <div class="chat-widget__header-item-copy">
                                        <h3 id="chat-widget-title">Secure Handover Chat</h3>
                                        <p class="chat-header__meta" id="chat-widget-sub-info"></p>
                                    </div>
                                </div>
                                <div class="chat-widget__panel-actions chat-widget__panel-actions--staff">
                                    <button type="button" class="chat-widget__thread-toggle chat-widget__thread-toggle--compact" id="chat-widget-thread-toggle">
                                        <i class="fas fa-layer-group" aria-hidden="true"></i>
                                        Chats
                                    </button>
                                    <button id="chat-widget-handover-btn" class="btn btn-success handover-btn" hidden>
                                        <i class="fas fa-check-circle" aria-hidden="true"></i>
                                        Verified
                                    </button>
                                </div>
                            </div>
                        ` : `
                            <div class="chat-widget__panel-title">
                                <span class="chat-widget__eyebrow" id="chat-widget-eyebrow">Secure Handover Chat</span>
                                <button type="button" class="chat-widget__thread-toggle" id="chat-widget-thread-toggle">
                                    <i class="fas fa-layer-group" aria-hidden="true"></i>
                                    Chats
                                </button>
                            </div>
                            <div class="chat-widget__panel-actions">
                                <span class="chat-status-badge chat-status-badge--idle" id="chat-widget-status-badge">Idle</span>
                                <button type="button" class="chat-widget__icon-btn" id="chat-widget-minimize-btn" aria-label="Minimize chat">
                                    <i class="fas fa-minus" aria-hidden="true"></i>
                                </button>
                            </div>
                        `}
                    </header>

                    <div class="chat-widget__thread-menu" id="chat-widget-thread-menu" hidden>
                        <div class="chat-widget__thread-list" id="chat-widget-thread-list"></div>
                        <p class="chat-widget__thread-empty" id="chat-widget-thread-empty" hidden>No active chats available.</p>
                    </div>

                    ${isStaffScope ? '' : `
                        <div class="chat-widget__context">
                            <div id="chat-widget-item-preview" class="chat-item-preview" aria-hidden="true"></div>
                            <div class="chat-widget__context-copy">
                                <h3 id="chat-widget-title">Secure Handover Chat</h3>
                                <p class="chat-header__meta" id="chat-widget-sub-info">Select an active chat to continue.</p>
                            </div>
                        </div>
                    `}

                    <div class="chat-messages chat-widget__messages" id="chat-widget-messages">
                        <div class="sys-message">Loading messages...</div>
                    </div>

                    <div class="chat-widget__composer">
                        <p class="chat-widget__feedback" id="chat-widget-feedback" hidden></p>
                        <div class="chat-widget__selected-file" id="chat-widget-selected-file" hidden>
                            <i class="fas fa-paperclip" aria-hidden="true"></i>
                            <div class="chat-widget__selected-file-copy">
                                <strong id="chat-widget-selected-file-name"></strong>
                                <span id="chat-widget-selected-file-meta"></span>
                            </div>
                            <button type="button" class="chat-widget__clear-file" id="chat-widget-clear-file" aria-label="Remove attached file">
                                <i class="fas fa-times" aria-hidden="true"></i>
                            </button>
                        </div>

                        <form class="chat-input-area chat-widget__composer-form" id="chat-widget-form">
                            <div class="chat-widget__input-shell">
                                <input type="text" id="chat-widget-input" placeholder="Write a message or send proof..." autocomplete="off">
                                <div class="chat-widget__input-tools">
                                    <button type="button" class="chat-widget__tool-btn" id="chat-widget-emoji-btn" aria-label="Add emoji">
                                        <i class="far fa-face-smile" aria-hidden="true"></i>
                                    </button>
                                    <button type="button" class="chat-widget__tool-btn" id="chat-widget-file-btn" aria-label="Attach proof file">
                                        <i class="fas fa-paperclip" aria-hidden="true"></i>
                                    </button>
                                </div>
                                <input type="file" id="chat-widget-file-input" class="chat-widget__file-input" accept="image/*,.pdf,.doc,.docx,.txt,.zip,.rar">
                            </div>
                            <button type="submit" id="chat-widget-send-btn" title="Send Message">
                                <i class="fas fa-paper-plane" aria-hidden="true"></i>
                            </button>
                        </form>

                        <div class="chat-widget__emoji-picker" id="chat-widget-emoji-picker" hidden></div>
                    </div>
                </section>
            </section>
        `;
    }

    function injectWidget() {
        if (document.getElementById('chat-widget-root')) {
            return;
        }

        document.body.insertAdjacentHTML('beforeend', createWidgetMarkup());

        elements.root = document.getElementById('chat-widget-root');
        elements.launcher = document.getElementById('chat-widget-launcher');
        elements.launcherLabel = document.getElementById('chat-widget-launcher-label');
        elements.launcherCount = document.getElementById('chat-widget-launcher-count');
        elements.panel = document.getElementById('chat-widget-panel');
        elements.chatEyebrow = document.getElementById('chat-widget-eyebrow');
        elements.threadMenuButton = document.getElementById('chat-widget-thread-toggle');
        elements.threadMenu = document.getElementById('chat-widget-thread-menu');
        elements.threadList = document.getElementById('chat-widget-thread-list');
        elements.threadEmpty = document.getElementById('chat-widget-thread-empty');
        elements.minimizeButton = document.getElementById('chat-widget-minimize-btn');
        elements.chatStatusBadge = document.getElementById('chat-widget-status-badge');
        elements.chatHeaderItem = document.getElementById('chat-widget-header-item');
        elements.chatTitle = document.getElementById('chat-widget-title');
        elements.chatSubInfo = document.getElementById('chat-widget-sub-info');
        elements.chatItemPreview = document.getElementById('chat-widget-item-preview');
        elements.messages = document.getElementById('chat-widget-messages');
        elements.feedback = document.getElementById('chat-widget-feedback');
        elements.selectedFile = document.getElementById('chat-widget-selected-file');
        elements.selectedFileName = document.getElementById('chat-widget-selected-file-name');
        elements.selectedFileMeta = document.getElementById('chat-widget-selected-file-meta');
        elements.clearFileButton = document.getElementById('chat-widget-clear-file');
        elements.form = document.getElementById('chat-widget-form');
        elements.input = document.getElementById('chat-widget-input');
        elements.emojiButton = document.getElementById('chat-widget-emoji-btn');
        elements.fileButton = document.getElementById('chat-widget-file-btn');
        elements.fileInput = document.getElementById('chat-widget-file-input');
        elements.sendButton = document.getElementById('chat-widget-send-btn');
        elements.emojiPicker = document.getElementById('chat-widget-emoji-picker');
        elements.handoverButton = document.getElementById('chat-widget-handover-btn');

        renderEmojiPicker();
        bindWidgetEvents();
        syncWidgetVisibility();
        syncComposerState();
    }

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            return;
        }

        state.user = user;
        injectWidget();
        await subscribeToThreadList();

        if (state.requestedChatId) {
            selectChat(state.requestedChatId, { open: true });
        } else if (state.threads.length && !state.currentChatId) {
            selectChat(state.threads[0].id, { open: shouldOpenOnFirstLaunch() });
        }

        syncWidgetVisibility();
        updateLauncher();
    });
}
