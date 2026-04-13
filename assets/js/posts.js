import { db, auth } from './firebase-config.js';
import { writeAuditLog } from './audit-log.js';
import {
    collection,
    addDoc,
    getDocs,
    query,
    where,
    orderBy,
    doc,
    updateDoc,
    serverTimestamp,
    getDoc,
    limit,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const createPostForm = document.getElementById('create-post-form');
const latestLostGrid = document.getElementById('latest-lost-grid');
const latestFoundGrid = document.getElementById('latest-found-grid');
const itemsGrid = document.getElementById('items-grid');
const myPostsList = document.getElementById('my-posts-list');
const itemDetailContainer = document.getElementById('item-detail-container');
const itemCommentsSection = document.getElementById('item-comments-section');
const commentsList = document.getElementById('comments-list');
const commentsStatusMessage = document.getElementById('comments-status-message');
const commentAccessMessage = document.getElementById('comment-access-message');
const commentForm = document.getElementById('comment-form');
const commentTextarea = document.getElementById('comment-text');
const commentFormMessage = document.getElementById('comment-form-message');

const FALLBACK_CARD_IMAGE = 'https://via.placeholder.com/300x200?text=No+Image';
const FALLBACK_DETAIL_IMAGE = 'https://via.placeholder.com/600x400?text=No+Image';
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const FIREBASE_OPERATION_TIMEOUT_MS = 15000;
// Client-side demo/project config only. This browser-exposed key should be replaced manually for this student/demo setup.
const IMGBB_API_KEY = 'b7d7a635920b14b3b0a9868f055eb0b9';
const IMGBB_UPLOAD_ENDPOINT = 'https://api.imgbb.com/1/upload';

let createPostCurrentUser = auth.currentUser;
let hasCreatePostAuthResolved = !createPostForm;
let resolveCreatePostAuthReady = () => { };
const createPostAuthReady = createPostForm
    ? new Promise((resolve) => {
        resolveCreatePostAuthReady = resolve;
    })
    : Promise.resolve();

let itemDetailCurrentUser = auth.currentUser;
let itemDetailCurrentUserRole = null;
let itemDetailCurrentItem = null;
let unsubscribeItemDetail = null;
let unsubscribeItemComments = null;

function setFormMessage(element, message, type = 'success') {
    if (!element) return;

    element.textContent = message;
    element.hidden = !message;
    element.classList.remove('form-message--success', 'form-message--error');

    if (message) {
        element.classList.add(type === 'success' ? 'form-message--success' : 'form-message--error');
    }
}

function setSubmitButtonState(button, label, disabled) {
    if (!button) return;
    button.textContent = label;
    button.disabled = disabled;
}

function createFirebaseError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function withTimeout(promise, timeoutMs, timeoutError) {
    return new Promise((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
            reject(timeoutError);
        }, timeoutMs);

        promise
            .then((value) => {
                window.clearTimeout(timeoutId);
                resolve(value);
            })
            .catch((error) => {
                window.clearTimeout(timeoutId);
                reject(error);
            });
    });
}

function renderLoadingState(container, message) {
    if (!container) return;
    container.innerHTML = `<div class="loading-spinner item-grid-status">${message}</div>`;
}

function getReviewStatusClass(status) {
    if (status === 'approved') return 'status-label status-label--approved';
    if (status === 'rejected') return 'status-label status-label--rejected';
    return 'status-label status-label--pending';
}

function sanitizeFileName(fileName) {
    return fileName
        .toLowerCase()
        .replace(/[^a-z0-9.-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function validateImageFile(imageFile) {
    if (!imageFile) {
        return null;
    }

    if (!imageFile.type || !imageFile.type.startsWith('image/')) {
        return 'Please select a valid image file.';
    }

    if (imageFile.size > MAX_IMAGE_SIZE_BYTES) {
        return 'Image must be 5 MB or smaller.';
    }

    return null;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDateTime(timestamp) {
    if (!timestamp?.toDate) {
        return 'Just now';
    }

    return timestamp.toDate().toLocaleString();
}

function getSafeDisplayNameFromUser(user) {
    if (!user) return 'User';

    const displayName = (user.displayName || '').trim();
    if (displayName) {
        return displayName;
    }

    if (user.email) {
        const prefix = user.email.split('@')[0];
        return prefix ? prefix.charAt(0).toUpperCase() + prefix.slice(1) : 'User';
    }

    return 'User';
}

function isStaffRole(role) {
    return role === 'staff' || role === 'admin';
}

function isApprovedActiveItem(item) {
    return item?.status === 'active' && item?.reviewStatus === 'approved';
}

function isCommentableFoundItem(item) {
    return item?.type === 'found' && isApprovedActiveItem(item);
}

function canViewerReadItem(item, user, role) {
    if (!item) {
        return false;
    }

    if (isStaffRole(role)) {
        return true;
    }

    if (isApprovedActiveItem(item)) {
        return true;
    }

    if (!user) {
        return false;
    }

    if (item.createdBy === user.uid) {
        return true;
    }

    return false;
}

function canViewerResolveItem(item, role) {
    return Boolean(item && item.status === 'active' && isStaffRole(role));
}

async function resolveUserRole(user) {
    if (!user) {
        return null;
    }

    try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
            return userDoc.data().role || 'user';
        }
    } catch (error) {
        console.error('Error resolving user role:', error);
    }

    return 'user';
}

async function uploadItemImageToImgbb(imageFile) {
    if (IMGBB_API_KEY === 'YOUR_IMGBB_API_KEY') {
        throw createFirebaseError(
            'imgbb/not-configured',
            'Image upload is not configured yet. Add your IMGBB API key and try again.'
        );
    }

    const formData = new FormData();
    const safeFileName = sanitizeFileName(imageFile.name) || 'item-image';

    formData.append('image', imageFile);
    formData.append('name', safeFileName);

    const uploadResponse = await withTimeout(
        fetch(`${IMGBB_UPLOAD_ENDPOINT}?key=${encodeURIComponent(IMGBB_API_KEY)}`, {
            method: 'POST',
            body: formData
        }),
        FIREBASE_OPERATION_TIMEOUT_MS,
        createFirebaseError(
            'imgbb/timeout',
            'Image upload failed. Please try again.'
        )
    );

    let responsePayload = null;

    try {
        responsePayload = await uploadResponse.json();
    } catch (error) {
        throw createFirebaseError('imgbb/invalid-response', 'Image upload failed. Please try again.');
    }

    if (!uploadResponse.ok || !responsePayload?.success) {
        throw createFirebaseError(
            'imgbb/upload-failed',
            responsePayload?.error?.message || 'Image upload failed. Please try again.'
        );
    }

    const publicImageUrl = responsePayload?.data?.display_url || responsePayload?.data?.url;
    if (!publicImageUrl) {
        throw createFirebaseError('imgbb/missing-url', 'Image upload failed. Please try again.');
    }

    return publicImageUrl;
}

function getCreatePostErrorMessage(error, stage) {
    switch (error?.code) {
        case 'auth/session-not-ready':
            return 'Your session is still loading. Please wait a moment and try again.';
        case 'auth/missing-user':
        case 'auth/user-not-found':
        case 'auth/invalid-user-token':
        case 'unauthenticated':
            return 'You must be logged in to post. Please sign in again.';
        case 'imgbb/not-configured':
            return 'Image upload is not configured yet. Add your IMGBB API key and try again.';
        case 'imgbb/timeout':
        case 'imgbb/invalid-response':
        case 'imgbb/upload-failed':
        case 'imgbb/missing-url':
            return 'Image upload failed. Please try again.';
        case 'permission-denied':
            return stage === 'save'
                ? 'Firestore denied the item save. Publish the latest firestore.rules and try again.'
                : 'Firebase denied this operation. Please verify the current Firebase rules.';
        case 'deadline-exceeded':
        case 'unavailable':
            return 'Firebase did not respond in time. Please try again.';
        default:
            if (stage === 'upload') {
                return error?.message || 'Image upload failed. Please try again.';
            }
            return error?.message || 'Posting failed. Please try again.';
    }
}

async function createItemPost(itemData) {
    return withTimeout(
        addDoc(collection(db, 'items'), itemData),
        FIREBASE_OPERATION_TIMEOUT_MS,
        createFirebaseError(
            'deadline-exceeded',
            'Saving the item took too long. Please try again.'
        )
    );
}

async function renderItems(items, container) {
    if (!container) return;

    container.innerHTML = '';
    if (!items.length) {
        container.innerHTML = '<p>No items found.</p>';
        return;
    }

    let currentUserRole = null;
    if (auth.currentUser) {
        currentUserRole = await resolveUserRole(auth.currentUser);
    }

    items.forEach((docSnap) => {
        const item = docSnap.data();
        const card = document.createElement('div');
        card.className = 'item-card';

        let displayLocation = item.location || 'Location not provided';
        let displayDate = item.date || 'Date not provided';

        if (item.type === 'found' && !isStaffRole(currentUserRole) && item.status !== 'resolved') {
            displayLocation = 'Location Hidden for Security';
            displayDate = 'Date Hidden';
        }

        const badgeClass = item.type === 'lost' ? 'badge-lost' : 'badge-found';
        const imageUrl = item.imageUrl || FALLBACK_CARD_IMAGE;
        const itemTitle = escapeHtml(item.title || 'Untitled Item');

        card.innerHTML = `
            <div class="item-media">
                <img class="item-image" src="${escapeHtml(imageUrl)}" alt="${itemTitle}">
                <span class="item-badge ${badgeClass}">${escapeHtml(item.type || 'item')}</span>
            </div>
            <div class="item-content">
                <h3 class="item-title">${itemTitle}</h3>
                <p class="item-location"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(displayLocation)}</p>
                <p class="item-date"><i class="far fa-calendar-alt"></i> ${escapeHtml(displayDate)}</p>
                <a href="item-details.html?id=${docSnap.id}" class="btn btn-outline item-card__action">View Details</a>
            </div>
        `;
        container.appendChild(card);
    });
}

function renderCommentList(commentDocs) {
    if (!commentsList) return;

    if (!commentDocs.length) {
        commentsList.innerHTML = '<p class="item-comments-empty">No comments yet. Add a helpful hint if you know something about this item.</p>';
        return;
    }

    commentsList.innerHTML = commentDocs.map((commentDoc) => {
        const comment = commentDoc.data();
        const authorName = escapeHtml(comment.creatorName || 'User');
        const commentText = escapeHtml(comment.text || '');
        const createdAt = escapeHtml(formatDateTime(comment.createdAt));

        return `
            <article class="comment-item">
                <div class="comment-item__meta">
                    <strong>${authorName}</strong>
                    <span>${createdAt}</span>
                </div>
                <p class="comment-item__text">${commentText}</p>
            </article>
        `;
    }).join('');
}

function showCommentsSection(visible) {
    if (!itemCommentsSection) return;
    itemCommentsSection.hidden = !visible;
}

function resetCommentComposer() {
    if (commentTextarea) {
        commentTextarea.value = '';
    }

    setFormMessage(commentFormMessage, '', 'success');
}

function setCommentComposerState({ enabled, accessMessage = '', accessType = 'success' }) {
    if (commentTextarea) {
        commentTextarea.disabled = !enabled;
    }

    const submitButton = commentForm?.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = !enabled;
    }

    setFormMessage(commentAccessMessage, accessMessage, accessType);
}

function stopCommentsSubscription() {
    if (unsubscribeItemComments) {
        unsubscribeItemComments();
        unsubscribeItemComments = null;
    }
}

function renderItemDetailMessage(message) {
    if (!itemDetailContainer) return;

    itemDetailContainer.innerHTML = `
        <div class="item-detail-empty-state">
            <p>${escapeHtml(message)}</p>
        </div>
    `;
}

function stopItemDetailSubscription() {
    if (unsubscribeItemDetail) {
        unsubscribeItemDetail();
        unsubscribeItemDetail = null;
    }
}

function getResolvedMessage(item) {
    if (item?.status !== 'resolved') {
        return '';
    }

    const handedOverTo = item.handedOverTo
        ? ` Handed over to ${escapeHtml(item.handedOverTo)}.`
        : '';

    return `
        <div class="item-status-banner item-status-banner--resolved">
            <span class="item-status-banner__badge">Handed Over</span>
            <p>This item has already been resolved through the official handover flow.${handedOverTo}</p>
        </div>
    `;
}

function getItemAvailabilityCopy(item) {
    if (item?.status === 'resolved') {
        return 'This item has already been handed over.';
    }

    if (item?.reviewStatus !== 'approved') {
        return 'This item is not available for claims or discussion yet.';
    }

    if (item?.status !== 'active') {
        return 'This item is not currently available for new claims or discussion.';
    }

    return '';
}

function renderItemDetail(item) {
    if (!itemDetailContainer) return;

    const isApprovedItem = isApprovedActiveItem(item);
    const canResolveItem = canViewerResolveItem(item, itemDetailCurrentUserRole);
    const buttonText = item.type === 'found' ? 'Claim My Product' : 'I Found This!';
    const isOwnItem = Boolean(itemDetailCurrentUser && item.createdBy === itemDetailCurrentUser.uid);
    const isClaimAvailable = isApprovedItem && !isOwnItem;
    const imageUrl = item.imageUrl || FALLBACK_DETAIL_IMAGE;
    const badgeClass = item.type === 'lost' ? 'badge-lost' : 'badge-found';
    const detailStatusClass = getReviewStatusClass(item.reviewStatus);
    const availabilityCopy = getItemAvailabilityCopy(item);
    const reviewStatusMarkup = !isApprovedItem || isStaffRole(itemDetailCurrentUserRole)
        ? `<span class="${detailStatusClass}">Review: ${escapeHtml(item.reviewStatus || 'pending')}</span>`
        : '';
    const activeStatusMarkup = item.status === 'resolved'
        ? '<span class="status-pill status-pill--success">Resolved</span>'
        : '<span class="status-pill status-pill--info">Active</span>';
    const claimButtonLabel = isOwnItem
        ? 'Your Item'
        : (isClaimAvailable ? buttonText : 'Not Available For Claims');
    const staffResolveMarkup = canResolveItem
        ? `
            <form id="resolve-item-form" class="item-resolve-form">
                <label for="handed-over-to" class="item-resolve-form__label">Handed Over To (optional)</label>
                <input
                    id="handed-over-to"
                    name="handedOverTo"
                    type="text"
                    maxlength="120"
                    class="filter-input item-resolve-form__input"
                    placeholder="Student name, ID, or notes"
                >
                <div class="item-resolve-form__actions">
                    <button type="submit" class="btn btn-outline btn-outline-success">Mark As Handed Over</button>
                    <p id="resolve-item-message" class="form-message" hidden></p>
                </div>
            </form>
        `
        : '';

    itemDetailContainer.innerHTML = `
        <div class="item-detail-layout">
            <div class="item-detail-media">
                <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.title || 'Item image')}" class="item-detail-image">
            </div>
            <div class="item-detail-summary">
                <span class="item-badge item-detail-badge ${badgeClass}">${escapeHtml((item.type || 'item').toUpperCase())}</span>
                <h1 class="item-detail-title">${escapeHtml(item.title || 'Untitled Item')}</h1>
                ${getResolvedMessage(item)}
                <p class="item-detail-description">${escapeHtml(item.description || 'No description provided.')}</p>
                <div class="item-detail-meta">
                    <p><strong>Category:</strong> ${escapeHtml(item.category || 'Not provided')}</p>
                    <p><strong>Location:</strong> ${escapeHtml(item.location || 'Not provided')}</p>
                    <p><strong>Date:</strong> ${escapeHtml(item.date || 'Not provided')}</p>
                    <p><strong>Posted By:</strong> ${escapeHtml(item.creatorName || 'Unknown User')}</p>
                </div>
                <div class="item-detail-status-row">
                    ${reviewStatusMarkup}
                    ${activeStatusMarkup}
                </div>
                <div class="item-detail-actions">
                    <button id="claim-btn" class="btn btn-primary" ${isClaimAvailable ? '' : 'disabled'}>${escapeHtml(claimButtonLabel)}</button>
                </div>
                ${availabilityCopy ? `<p class="item-detail-note">${escapeHtml(availabilityCopy)}</p>` : ''}
                ${staffResolveMarkup}
            </div>
        </div>
    `;

    const claimBtn = document.getElementById('claim-btn');
    if (claimBtn && isClaimAvailable) {
        claimBtn.addEventListener('click', async () => {
            if (!auth.currentUser) {
                window.location.href = 'login.html';
                return;
            }

            if (!itemDetailCurrentItem || !isApprovedActiveItem(itemDetailCurrentItem)) {
                alert('This item is no longer available for claims.');
                return;
            }

            if (auth.currentUser.uid === item.createdBy) {
                alert('You cannot claim your own item.');
                return;
            }

            try {
                claimBtn.textContent = 'Initiating Secure Chat...';
                claimBtn.disabled = true;

                const chatRef = await addDoc(collection(db, 'chats'), {
                    itemId: item.id,
                    itemTitle: item.title,
                    itemType: item.type,
                    userId: auth.currentUser.uid,
                    userName: getSafeDisplayNameFromUser(auth.currentUser),
                    staffId: null,
                    status: 'active',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });

                await addDoc(collection(db, 'mail'), {
                    to: auth.currentUser.email,
                    message: {
                        subject: 'Claim Registered: ' + item.title,
                        html: [
                            '<div>',
                            '<h2>Claim Initiated</h2>',
                            `<p>Hello ${getSafeDisplayNameFromUser(auth.currentUser)},</p>`,
                            `<p>You have initiated a claim for <b>${escapeHtml(item.title)}</b>.</p>`,
                            '<p>A WUB staff member will connect with you shortly to verify your ownership/finding. Please log in to your dashboard to check your Active Chats.</p>',
                            '<p>Thank you,<br>WUB Lost & Found Security Team</p>',
                            '</div>'
                        ].join('')
                    }
                });

                await writeAuditLog({
                    type: 'chat_initiated',
                    message: `${getSafeDisplayNameFromUser(auth.currentUser)} initiated a secure claim chat for ${item.title || 'an item'}.`,
                    targetId: chatRef.id,
                    targetType: 'chat',
                    meta: {
                        itemId: item.id,
                        itemTitle: item.title || '',
                        itemType: item.type || ''
                    }
                });

                window.location.href = 'user/chat.html?chatId=' + chatRef.id;
            } catch (error) {
                console.error('Error initiating handover process:', error);
                alert('Failed to initiate claim. Please try again.');
                claimBtn.textContent = buttonText;
                claimBtn.disabled = false;
            }
        });
    }

    const resolveItemForm = document.getElementById('resolve-item-form');
    if (resolveItemForm) {
        resolveItemForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            if (!itemDetailCurrentItem || !canViewerResolveItem(itemDetailCurrentItem, itemDetailCurrentUserRole)) {
                return;
            }

            const submitButton = resolveItemForm.querySelector('button[type="submit"]');
            const resolveMessage = document.getElementById('resolve-item-message');
            const handedOverToInput = document.getElementById('handed-over-to');
            const handedOverTo = handedOverToInput?.value.trim();

            if (!confirm('Mark this item as officially handed over? This will stop new public comments and claims.')) {
                return;
            }

            setSubmitButtonState(submitButton, 'Saving...', true);
            setFormMessage(resolveMessage, '', 'success');

            try {
                const payload = {
                    status: 'resolved',
                    resolvedBy: itemDetailCurrentUser?.uid || null,
                    resolvedAt: serverTimestamp()
                };

                if (handedOverTo) {
                    payload.handedOverTo = handedOverTo;
                }

                await updateDoc(doc(db, 'items', itemDetailCurrentItem.id), payload);
                await writeAuditLog({
                    type: 'item_resolved',
                    message: `Item ${itemDetailCurrentItem.title || itemDetailCurrentItem.id} was marked as handed over from the item details page.`,
                    targetId: itemDetailCurrentItem.id,
                    targetType: 'item',
                    meta: {
                        handedOverTo: handedOverTo || '',
                        source: 'item_details'
                    }
                });
                alert('Item marked as handed over.');
            } catch (error) {
                console.error('Error resolving item:', error);
                setFormMessage(resolveMessage, 'Could not update the item status. Please try again.', 'error');
                setSubmitButtonState(submitButton, 'Mark As Handed Over', false);
            }
        });
    }
}

function syncCommentsState(item) {
    const canReadComments = Boolean(
        item &&
        item.type === 'found' &&
        canViewerReadItem(item, itemDetailCurrentUser, itemDetailCurrentUserRole)
    );

    stopCommentsSubscription();
    resetCommentComposer();

    if (!canReadComments) {
        showCommentsSection(false);
        return;
    }

    showCommentsSection(true);
    renderLoadingState(commentsList, 'Loading comments...');
    setFormMessage(commentsStatusMessage, '', 'success');

    if (isCommentableFoundItem(item)) {
        if (!itemDetailCurrentUser) {
            setCommentComposerState({
                enabled: false,
                accessMessage: 'Log in to add a discussion comment. Official ownership still goes through staff moderation.',
                accessType: 'error'
            });
        } else {
            setCommentComposerState({
                enabled: true,
                accessMessage: 'Comments are for discussion only. Official ownership is verified through staff moderation.',
                accessType: 'success'
            });
        }
    } else if (item.status === 'resolved') {
        setCommentComposerState({
            enabled: false,
            accessMessage: 'This item has already been handed over. New comments are closed.',
            accessType: 'error'
        });
    } else {
        setCommentComposerState({
            enabled: false,
            accessMessage: 'Comments are available only on approved active found items.',
            accessType: 'error'
        });
    }

    const commentsQuery = query(
        collection(db, 'items', item.id, 'comments'),
        where('status', '==', 'visible'),
        orderBy('createdAt', 'desc')
    );

    unsubscribeItemComments = onSnapshot(commentsQuery, (snapshot) => {
        renderCommentList(snapshot.docs);
    }, (error) => {
        console.error('Error loading item comments:', error);
        if (commentsList) {
            commentsList.innerHTML = '<p class="item-comments-empty">Comments are not available right now.</p>';
        }
        setFormMessage(commentsStatusMessage, 'Could not load comments for this item.', 'error');
    });
}

function subscribeToItemDetail(itemId) {
    if (!itemDetailContainer || !itemId) {
        return;
    }

    stopItemDetailSubscription();

    stopCommentsSubscription();
    renderLoadingState(itemDetailContainer, 'Loading item details...');

    unsubscribeItemDetail = onSnapshot(doc(db, 'items', itemId), (docSnap) => {
        if (!docSnap.exists()) {
            itemDetailCurrentItem = null;
            renderItemDetailMessage('Item not found.');
            showCommentsSection(false);
            return;
        }

        const item = {
            id: docSnap.id,
            ...docSnap.data()
        };

        itemDetailCurrentItem = item;

        if (!canViewerReadItem(item, itemDetailCurrentUser, itemDetailCurrentUserRole)) {
            renderItemDetailMessage('This item is not available to your account or you do not have permission to view it.');
            showCommentsSection(false);
            return;
        }

        renderItemDetail(item);
        syncCommentsState(item);
    }, (error) => {
        console.error('Error loading item details:', error);
        itemDetailCurrentItem = null;
        renderItemDetailMessage('This item is not available to your account or you do not have permission to view it.');
        showCommentsSection(false);
    });
}

if (createPostForm) {
    const urlParams = new URLSearchParams(window.location.search);
    const submitBtn = createPostForm.querySelector('button[type="submit"]');
    const submitMessage = document.getElementById('submit-message');
    const imageInput = document.getElementById('image');

    setSubmitButtonState(submitBtn, 'Checking Session...', true);
    setFormMessage(submitMessage, 'Checking your session...', 'success');

    onAuthStateChanged(auth, (user) => {
        hasCreatePostAuthResolved = true;
        createPostCurrentUser = user;
        resolveCreatePostAuthReady();

        if (!user) {
            setSubmitButtonState(submitBtn, 'Redirecting To Login...', true);
            setFormMessage(submitMessage, 'Your session expired. Redirecting to login...', 'error');
            return;
        }

        setSubmitButtonState(submitBtn, 'Submit Post', false);
        setFormMessage(submitMessage, '', 'success');
    }, (error) => {
        console.error('Error resolving auth state for create-post form:', error);
        hasCreatePostAuthResolved = true;
        createPostCurrentUser = null;
        resolveCreatePostAuthReady();
        setSubmitButtonState(submitBtn, 'Submit Post', true);
        setFormMessage(submitMessage, 'Could not verify your session. Please refresh the page and try again.', 'error');
    });

    if (urlParams.has('type')) {
        const typeSelect = document.getElementById('type');
        const requestedType = urlParams.get('type');
        if (typeSelect && (requestedType === 'lost' || requestedType === 'found')) {
            typeSelect.value = requestedType;
        }
    }

    if (imageInput) {
        imageInput.addEventListener('change', () => {
            const imageValidationError = validateImageFile(imageInput.files[0]);
            setFormMessage(submitMessage, imageValidationError || '', imageValidationError ? 'error' : 'success');
        });
    }

    createPostForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (!createPostCurrentUser) {
            setFormMessage(submitMessage, 'Checking your session. Please wait a moment and try again.', 'error');
        }

        if (!hasCreatePostAuthResolved) {
            await createPostAuthReady;
        }

        const user = createPostCurrentUser;
        if (!user) {
            setFormMessage(submitMessage, 'You must be logged in to post. Redirecting to login...', 'error');
            window.location.href = '../login.html';
            return;
        }

        const type = document.getElementById('type').value;
        const category = document.getElementById('category').value;
        const title = document.getElementById('title').value;
        const date = document.getElementById('date').value;
        const location = document.getElementById('location').value;
        const description = document.getElementById('description').value;
        const imageFile = document.getElementById('image').files[0];
        const imageValidationError = validateImageFile(imageFile);

        setFormMessage(submitMessage, '', 'success');

        if (imageValidationError) {
            setFormMessage(submitMessage, imageValidationError, 'error');
            return;
        }

        setSubmitButtonState(submitBtn, 'Posting...', true);
        let stage = 'save';

        try {
            let imageUrl = null;

            if (imageFile) {
                stage = 'upload';
                setSubmitButtonState(submitBtn, 'Uploading Image...', true);
                imageUrl = await uploadItemImageToImgbb(imageFile);
            }

            stage = 'save';
            setSubmitButtonState(submitBtn, 'Saving Details...', true);

            const initialReviewStatus = type === 'lost' ? 'approved' : 'pending';

            await createItemPost({
                type,
                category,
                title,
                description,
                location,
                date,
                imageUrl,
                createdBy: user.uid,
                creatorName: getSafeDisplayNameFromUser(user),
                reviewStatus: initialReviewStatus,
                status: 'active',
                createdAt: serverTimestamp()
            });

            setFormMessage(submitMessage, 'Post submitted successfully!', 'success');
            createPostForm.reset();

            const successModal = document.getElementById('success-modal');
            if (successModal) {
                const modalMessage = successModal.querySelector('.modal-message');
                if (modalMessage) {
                    modalMessage.textContent = type === 'lost'
                        ? 'Your item is now live.'
                        : 'Your item has been submitted for administrative review.';
                }

                successModal.classList.add('active');
                const closeBtn = document.getElementById('close-modal-btn');
                if (closeBtn) {
                    closeBtn.onclick = () => {
                        successModal.classList.remove('active');
                        window.location.href = '../index.html';
                    };
                }
            } else {
                alert('Success! Your post has been submitted.');
                window.location.href = '../index.html';
            }
        } catch (error) {
            console.error('Error creating post:', error);
            const errorMessage = getCreatePostErrorMessage(error, stage);
            setFormMessage(submitMessage, errorMessage, 'error');
        } finally {
            if (createPostCurrentUser) {
                setSubmitButtonState(submitBtn, 'Submit Post', false);
            }
        }
    });
}

const statsSection = document.querySelector('.stats-section');

if (latestLostGrid || latestFoundGrid || itemsGrid || statsSection) {
    const fetchHomePageItems = async () => {
        try {
            if (latestLostGrid) {
                renderLoadingState(latestLostGrid, 'Loading recently lost items...');
                const lostQuery = query(
                    collection(db, 'items'),
                    where('type', '==', 'lost'),
                    where('status', '==', 'active'),
                    where('reviewStatus', '==', 'approved'),
                    orderBy('createdAt', 'desc'),
                    limit(4)
                );
                const lostSnapshot = await getDocs(lostQuery);
                await renderItems(lostSnapshot.docs, latestLostGrid);
            }

            if (latestFoundGrid) {
                renderLoadingState(latestFoundGrid, 'Loading approved found items...');
                const foundQuery = query(
                    collection(db, 'items'),
                    where('type', '==', 'found'),
                    where('status', '==', 'active'),
                    where('reviewStatus', '==', 'approved'),
                    orderBy('createdAt', 'desc'),
                    limit(4)
                );
                const foundSnapshot = await getDocs(foundQuery);
                await renderItems(foundSnapshot.docs, latestFoundGrid);
            }
        } catch (error) {
            console.error('Error fetching homepage items:', error);
            if (latestLostGrid) latestLostGrid.innerHTML = '<p>Error loading items.</p>';
            if (latestFoundGrid) latestFoundGrid.innerHTML = '<p>Error loading items.</p>';
        }
    };

    const fetchBrowseItems = async () => {
        if (!itemsGrid) return;

        const filterForm = document.getElementById('filter-form');
        const searchInput = document.getElementById('search');
        const typeSelect = document.getElementById('type');
        const categorySelect = document.getElementById('category');
        const urlParams = new URLSearchParams(window.location.search);

        renderLoadingState(itemsGrid, 'Loading items...');

        try {
            const typeFilter = urlParams.get('type') || 'all';
            const categoryFilter = urlParams.get('category') || 'all';
            const searchFilter = urlParams.get('search') || '';

            if (typeSelect) typeSelect.value = typeFilter;
            if (categorySelect) categorySelect.value = categoryFilter;
            if (searchInput) searchInput.value = searchFilter;

            const itemsQuery = query(
                collection(db, 'items'),
                where('status', '==', 'active'),
                where('reviewStatus', '==', 'approved'),
                orderBy('createdAt', 'desc'),
                limit(50)
            );

            const querySnapshot = await getDocs(itemsQuery);
            let items = querySnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

            if (typeFilter !== 'all') {
                items = items.filter((item) => item.type === typeFilter);
            }

            if (categoryFilter !== 'all') {
                items = items.filter((item) => item.category === categoryFilter);
            }

            if (searchFilter) {
                const lowerSearch = searchFilter.toLowerCase();
                items = items.filter((item) =>
                    (item.title || '').toLowerCase().includes(lowerSearch) ||
                    (item.description || '').toLowerCase().includes(lowerSearch) ||
                    (item.location || '').toLowerCase().includes(lowerSearch)
                );
            }

            const mockDocSnaps = items.map((item) => ({
                id: item.id,
                data: () => item
            }));
            await renderItems(mockDocSnaps, itemsGrid);
        } catch (error) {
            console.error('Error fetching browse items:', error);
            itemsGrid.innerHTML = '<p>Error loading items.</p>';
        }

        if (filterForm && searchInput && categorySelect) {
            filterForm.onsubmit = (event) => {
                event.preventDefault();
                const currentTypeFilter = typeSelect ? typeSelect.value : (urlParams.get('type') || 'all');
                const newCategory = categorySelect.value;
                const newSearch = searchInput.value.trim();
                const newUrl = new URL(window.location);

                if (currentTypeFilter !== 'all') newUrl.searchParams.set('type', currentTypeFilter);
                else newUrl.searchParams.delete('type');

                if (newCategory !== 'all') newUrl.searchParams.set('category', newCategory);
                else newUrl.searchParams.delete('category');

                if (newSearch) newUrl.searchParams.set('search', newSearch);
                else newUrl.searchParams.delete('search');

                window.location.href = newUrl.toString();
            };
        }
    };

    onAuthStateChanged(auth, async (user) => {
        const currentUserRole = await resolveUserRole(user);

        if (latestLostGrid || latestFoundGrid) {
            await fetchHomePageItems();
        }

        if (itemsGrid) {
            await fetchBrowseItems();
        }

        if (statsSection && isStaffRole(currentUserRole)) {
            fetchHomeStats();
        }
    });
}

async function fetchHomeStats() {
    try {
        const itemsSnapshot = await getDocs(collection(db, 'items'));
        const totalItems = itemsSnapshot.size;

        const resolvedQuery = query(collection(db, 'items'), where('status', '==', 'resolved'));
        const resolvedSnapshot = await getDocs(resolvedQuery);
        const totalResolved = resolvedSnapshot.size;

        const usersSnapshot = await getDocs(collection(db, 'users'));
        const totalUsers = usersSnapshot.size;

        const statMap = {
            'Items Reported': totalItems,
            'Items Returned': totalResolved,
            'Active Students': totalUsers
        };

        document.querySelectorAll('.stat-item').forEach((item) => {
            const label = item.querySelector('p')?.textContent.trim();
            const counter = item.querySelector('.counter');

            if (!counter || statMap[label] === undefined) {
                return;
            }

            const finalValue = statMap[label];
            const duration = 2000;
            const startTime = performance.now();

            function updateCounter(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const ease = 1 - Math.pow(1 - progress, 4);
                const current = Math.floor(ease * finalValue);

                counter.textContent = current + '+';
                counter.setAttribute('data-target', finalValue);

                if (progress < 1) {
                    requestAnimationFrame(updateCounter);
                } else {
                    counter.textContent = finalValue + '+';
                }
            }

            requestAnimationFrame(updateCounter);
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
    }
}

if (myPostsList) {
    onAuthStateChanged(auth, async (user) => {
        if (!user) return;

        try {
            const postsQuery = query(
                collection(db, 'items'),
                where('createdBy', '==', user.uid),
                orderBy('createdAt', 'desc')
            );
            const postsSnapshot = await getDocs(postsQuery);
            myPostsList.innerHTML = '';

            if (postsSnapshot.empty) {
                myPostsList.innerHTML = '<p>You haven\'t posted any items yet.</p>';
                return;
            }

            postsSnapshot.forEach((docSnap) => {
                const item = docSnap.data();
                const card = document.createElement('div');
                card.className = 'post-item';

                const statusClass = getReviewStatusClass(item.reviewStatus);
                const returnedBadge = item.status === 'resolved'
                    ? '<span class="status-pill status-pill--success">Returned</span>'
                    : '<span class="status-pill status-pill--info">Active</span>';

                card.innerHTML = `
                    <div class="post-item__content">
                        <h3 class="post-item__title">${escapeHtml(item.title || 'Untitled Item')} (${escapeHtml(item.type || 'item')})</h3>
                        <p>${escapeHtml(item.date || 'Date not provided')} - ${escapeHtml(item.location || 'Location not provided')}</p>
                        <div class="post-item__actions">
                            <span class="${statusClass}">Status: ${escapeHtml(item.reviewStatus || 'pending')}</span>
                            ${returnedBadge}
                        </div>
                    </div>
                    <div class="post-item__actions">
                        <a href="../item-details.html?id=${docSnap.id}" class="btn btn-secondary">View</a>
                    </div>
                `;
                myPostsList.appendChild(card);
            });
        } catch (error) {
            console.error(error);
            myPostsList.innerHTML = '<p>Error loading posts.</p>';
        }
    });
}

if (itemDetailContainer) {
    const urlParams = new URLSearchParams(window.location.search);
    const itemId = urlParams.get('id');

    if (!itemId) {
        renderItemDetailMessage('Invalid item link.');
        showCommentsSection(false);
    } else {
        onAuthStateChanged(auth, async (user) => {
            itemDetailCurrentUser = user;
            itemDetailCurrentUserRole = await resolveUserRole(user);

            subscribeToItemDetail(itemId);
        });
    }
}

if (commentForm) {
    commentForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (!itemDetailCurrentItem || !itemDetailCurrentItem.id) {
            setFormMessage(commentFormMessage, 'Item details are still loading. Please try again.', 'error');
            return;
        }

        if (!itemDetailCurrentUser) {
            setFormMessage(commentFormMessage, 'Please log in to add a comment.', 'error');
            return;
        }

        if (!isCommentableFoundItem(itemDetailCurrentItem)) {
            setFormMessage(commentFormMessage, 'Comments are only available on approved active found items.', 'error');
            return;
        }

        const trimmedComment = commentTextarea?.value.trim() || '';
        if (!trimmedComment) {
            setFormMessage(commentFormMessage, 'Please enter a comment before submitting.', 'error');
            return;
        }

        const submitButton = commentForm.querySelector('button[type="submit"]');
        setSubmitButtonState(submitButton, 'Posting...', true);
        setFormMessage(commentFormMessage, '', 'success');

        try {
            await addDoc(collection(db, 'items', itemDetailCurrentItem.id, 'comments'), {
                text: trimmedComment,
                createdBy: itemDetailCurrentUser.uid,
                creatorName: getSafeDisplayNameFromUser(itemDetailCurrentUser),
                createdAt: serverTimestamp(),
                status: 'visible'
            });

            if (commentTextarea) {
                commentTextarea.value = '';
            }

            setFormMessage(commentFormMessage, 'Comment posted successfully.', 'success');
        } catch (error) {
            console.error('Error posting comment:', error);
            setFormMessage(commentFormMessage, 'Could not post your comment. Please try again.', 'error');
        } finally {
            setSubmitButtonState(submitButton, 'Post Comment', false);
        }
    });
}
