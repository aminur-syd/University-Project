import { db, auth, storage } from './firebase-config.js';
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
    limit
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const createPostForm = document.getElementById('create-post-form');
const latestLostGrid = document.getElementById('latest-lost-grid');
const latestFoundGrid = document.getElementById('latest-found-grid');
const itemsGrid = document.getElementById('items-grid');
const myPostsList = document.getElementById('my-posts-list');
const itemDetailContainer = document.getElementById('item-detail-container');

const FALLBACK_CARD_IMAGE = 'https://via.placeholder.com/300x200?text=No+Image';
const FALLBACK_DETAIL_IMAGE = 'https://via.placeholder.com/600x400?text=No+Image';
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const FIREBASE_OPERATION_TIMEOUT_MS = 15000;

let createPostCurrentUser = auth.currentUser;
let hasCreatePostAuthResolved = !createPostForm;
let resolveCreatePostAuthReady = () => {};
const createPostAuthReady = createPostForm
    ? new Promise((resolve) => {
        resolveCreatePostAuthReady = resolve;
    })
    : Promise.resolve();

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

async function uploadItemImage(userId, imageFile) {
    const safeFileName = sanitizeFileName(imageFile.name) || 'item-image';
    const imageRef = ref(storage, `items/${userId}/${Date.now()}-${safeFileName}`);
    const uploadTimeoutError = createFirebaseError(
        'storage/timeout',
        'Firebase Storage did not respond in time. Enable Storage in Firebase Console and verify the bucket name in firebase-config.js.'
    );

    await withTimeout(uploadBytes(imageRef, imageFile, {
        contentType: imageFile.type
    }), FIREBASE_OPERATION_TIMEOUT_MS, uploadTimeoutError);

    return withTimeout(
        getDownloadURL(imageRef),
        FIREBASE_OPERATION_TIMEOUT_MS,
        createFirebaseError(
            'storage/url-timeout',
            'Image upload finished, but Firebase did not return a download URL in time.'
        )
    );
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
        case 'storage/timeout':
        case 'storage/url-timeout':
        case 'storage/bucket-not-found':
        case 'storage/project-not-found':
        case 'storage/no-default-bucket':
            return 'Firebase Storage is not ready for this project. Enable Storage in Firebase Console, then update the bucket name in firebase-config.js.';
        case 'storage/unauthorized':
            return 'Firebase Storage denied the image upload. Publish the latest storage.rules and try again.';
        case 'storage/retry-limit-exceeded':
            return 'The image upload timed out. Please try again after Firebase Storage is enabled and configured.';
        case 'storage/invalid-format':
            return 'Please upload a valid image file.';
        case 'storage/canceled':
            return 'The image upload was canceled before it finished.';
        case 'permission-denied':
            return stage === 'save'
                ? 'Firestore denied the item save. Publish the latest firestore.rules and try again.'
                : 'Firebase denied this operation. Please verify the current Firebase rules.';
        case 'deadline-exceeded':
        case 'unavailable':
            return 'Firebase did not respond in time. Please try again.';
        default:
            if (stage === 'upload') {
                return error?.message || 'Image upload failed. Please verify Firebase Storage is enabled and configured correctly.';
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
    container.innerHTML = '';
    if (!items.length) {
        container.innerHTML = '<p>No items found.</p>';
        return;
    }

    let isStaff = false;
    if (auth.currentUser) {
        try {
            const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
            if (userDoc.exists() && ['staff', 'admin'].includes(userDoc.data().role)) {
                isStaff = true;
            }
        } catch (error) {
            console.error('Error checking role for render', error);
        }
    }

    items.forEach((docSnap) => {
        const item = docSnap.data();
        const card = document.createElement('div');
        card.className = 'item-card';

        let displayLocation = item.location;
        let displayDate = item.date;

        if (item.type === 'found' && !isStaff && item.status !== 'resolved') {
            displayLocation = 'Location Hidden for Security';
            displayDate = 'Date Hidden';
        }

        const badgeClass = item.type === 'lost' ? 'badge-lost' : 'badge-found';
        const imageUrl = item.imageUrl || FALLBACK_CARD_IMAGE;

        card.innerHTML = `
            <div class="item-media">
                <img class="item-image" src="${imageUrl}" alt="${item.title}">
                <span class="item-badge ${badgeClass}">${item.type}</span>
            </div>
            <div class="item-content">
                <h3 class="item-title">${item.title}</h3>
                <p class="item-location"><i class="fas fa-map-marker-alt"></i> ${displayLocation}</p>
                <p class="item-date"><i class="far fa-calendar-alt"></i> ${displayDate}</p>
                <a href="item-details.html?id=${docSnap.id}" class="btn btn-outline item-card__action">View Details</a>
            </div>
        `;
        container.appendChild(card);
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
                imageUrl = await uploadItemImage(user.uid, imageFile);
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
                creatorName: user.displayName,
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

if (latestLostGrid || latestFoundGrid || itemsGrid) {
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

        renderLoadingState(itemsGrid, 'Loading items...');

        try {
            const urlParams = new URLSearchParams(window.location.search);
            const typeFilter = urlParams.get('type') || 'lost';
            const categoryFilter = urlParams.get('category') || 'all';
            const searchFilter = urlParams.get('search') || '';

            if (typeSelect) typeSelect.value = typeFilter;
            if (categorySelect) categorySelect.value = categoryFilter;
            if (searchInput) searchInput.value = searchFilter;

            const itemsQuery = query(
                collection(db, 'items'),
                where('status', '==', 'active'),
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
                    item.title.toLowerCase().includes(lowerSearch) ||
                    (item.description && item.description.toLowerCase().includes(lowerSearch)) ||
                    (item.location && item.location.toLowerCase().includes(lowerSearch))
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
                const newType = typeSelect ? typeSelect.value : 'lost';
                const newCategory = categorySelect.value;
                const newSearch = searchInput.value;
                const newUrl = new URL(window.location);

                if (newType !== 'all') newUrl.searchParams.set('type', newType);
                else newUrl.searchParams.delete('type');

                if (newCategory !== 'all') newUrl.searchParams.set('category', newCategory);
                else newUrl.searchParams.delete('category');

                if (newSearch) newUrl.searchParams.set('search', newSearch);
                else newUrl.searchParams.delete('search');

                window.location.href = newUrl.toString();
            };
        }
    };

    if (latestLostGrid || latestFoundGrid) {
        fetchHomePageItems();
    }

    if (itemsGrid) {
        fetchBrowseItems();
    }
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
            const label = item.querySelector('p').textContent.trim();
            const counter = item.querySelector('.counter');

            if (statMap[label] === undefined) {
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

if (document.querySelector('.stats-section')) {
    fetchHomeStats();
}

if (myPostsList) {
    auth.onAuthStateChanged(async (user) => {
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
                    : '';
                const resolveButton = item.status !== 'resolved' && item.reviewStatus === 'approved'
                    ? `<button class="btn btn-outline btn-outline-success mark-resolved-btn" data-id="${docSnap.id}">Mark as Returned</button>`
                    : '';

                card.innerHTML = `
                    <div class="post-item__content">
                        <h3 class="post-item__title">${item.title} (${item.type})</h3>
                        <p>${item.date} - ${item.location}</p>
                        <div class="post-item__actions">
                            <span class="${statusClass}">Status: ${item.reviewStatus}</span>
                            ${returnedBadge}
                        </div>
                    </div>
                    <div class="post-item__actions">
                        ${resolveButton}
                        <a href="../item-details.html?id=${docSnap.id}" class="btn btn-secondary">View</a>
                    </div>
                `;
                myPostsList.appendChild(card);
            });

            document.querySelectorAll('.mark-resolved-btn').forEach((button) => {
                button.addEventListener('click', async (event) => {
                    event.preventDefault();
                    if (!confirm('Did you find this item/return it to its owner? This will mark it as returned on the site.')) {
                        return;
                    }

                    try {
                        const itemRef = doc(db, 'items', button.dataset.id);
                        await updateDoc(itemRef, {
                            status: 'resolved',
                            resolvedBy: 'owner',
                            resolvedAt: serverTimestamp()
                        });
                        alert('Item marked as returned!');
                        window.location.reload();
                    } catch (error) {
                        console.error('Error updating status:', error);
                        alert('Error: ' + error.message);
                    }
                });
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

    if (itemId) {
        getDoc(doc(db, 'items', itemId)).then((docSnap) => {
            if (!docSnap.exists()) {
                itemDetailContainer.innerHTML = '<p>Item not found.</p>';
                return;
            }

            const item = docSnap.data();
            const buttonText = item.type === 'found' ? 'Claim My Product' : 'I Found This!';
            const imageUrl = item.imageUrl || FALLBACK_DETAIL_IMAGE;
            const badgeClass = item.type === 'lost' ? 'badge-lost' : 'badge-found';

            itemDetailContainer.innerHTML = `
                <div class="item-detail-layout">
                    <div class="item-detail-media">
                        <img src="${imageUrl}" alt="${item.title}" class="item-detail-image">
                    </div>
                    <div class="item-detail-summary">
                        <span class="item-badge item-detail-badge ${badgeClass}">${item.type.toUpperCase()}</span>
                        <h1 class="item-detail-title">${item.title}</h1>
                        <p class="item-detail-description">${item.description}</p>
                        <div class="item-detail-meta">
                            <p><strong>Category:</strong> ${item.category}</p>
                            <p><strong>Location:</strong> ${item.location}</p>
                            <p><strong>Date:</strong> ${item.date}</p>
                        </div>
                        <button id="claim-btn" class="btn btn-primary">${buttonText}</button>
                    </div>
                </div>
            `;

            const claimBtn = document.getElementById('claim-btn');
            if (!claimBtn) {
                return;
            }

            claimBtn.addEventListener('click', async () => {
                if (!auth.currentUser) {
                    window.location.href = 'login.html';
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
                        itemId: docSnap.id,
                        itemTitle: item.title,
                        itemType: item.type,
                        userId: auth.currentUser.uid,
                        userName: auth.currentUser.displayName || 'Student',
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
                                `<p>Hello ${auth.currentUser.displayName || 'Student'},</p>`,
                                `<p>You have initiated a claim for <b>${item.title}</b>.</p>`,
                                '<p>A WUB staff member will connect with you shortly to verify your ownership/finding. Please log in to your dashboard to check your Active Chats.</p>',
                                '<p>Thank you,<br>WUB Lost & Found Security Team</p>',
                                '</div>'
                            ].join('')
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
        });
    }
}
