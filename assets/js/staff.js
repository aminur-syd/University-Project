import { db, auth } from './firebase-config.js';
import { writeAuditLog } from './audit-log.js';
import {
    collection,
    getDocs,
    query,
    where,
    orderBy,
    doc,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const pendingPostsList = document.getElementById('review-posts-list');
const pendingClaimsList = document.getElementById('review-claims-list');
const statsPosts = document.getElementById('pending-posts');
const statsClaims = document.getElementById('pending-claims');

function getTypePill(type) {
    if (type === 'lost') return '<span class="type-pill type-pill--lost">LOST</span>';
    if (type === 'found') return '<span class="type-pill type-pill--found">FOUND</span>';
    return '<span class="type-pill type-pill--neutral">UNKNOWN</span>';
}

function getReviewStatusClass(status) {
    if (status === 'approved') return 'status-label status-label--approved';
    if (status === 'rejected') return 'status-label status-label--rejected';
    return 'status-label status-label--pending';
}

function getClaimContext(claim) {
    if (claim.type === 'ownership_claim') {
        return {
            badge: '<span class="type-pill type-pill--lost">Claiming Ownership</span>',
            text: 'User claims they own this found item.'
        };
    }

    if (claim.type === 'finder_report') {
        return {
            badge: '<span class="type-pill type-pill--found">Finder Report</span>',
            text: 'User reports they found this lost item.'
        };
    }

    return {
        badge: '<span class="type-pill type-pill--neutral">General Claim</span>',
        text: 'General claim or report.'
    };
}

function renderPostsEmptyState(message) {
    if (pendingPostsList) {
        pendingPostsList.innerHTML = `<p>${message}</p>`;
    }
}

function renderClaimsEmptyState(message) {
    if (pendingClaimsList) {
        pendingClaimsList.innerHTML = `<p>${message}</p>`;
    }
}

if (pendingPostsList) {
    const fetchFoundItemsList = async () => {
        const itemsQuery = query(
            collection(db, 'items'),
            where('type', '==', 'found'),
            where('reviewStatus', '==', 'pending'),
            where('status', '==', 'active'),
            orderBy('createdAt', 'desc')
        );

        try {
            const querySnapshot = await getDocs(itemsQuery);
            pendingPostsList.innerHTML = '';

            if (querySnapshot.empty) {
                renderPostsEmptyState('No pending found items to review.');
                return;
            }

            querySnapshot.forEach((docSnap) => {
                const item = docSnap.data();
                const card = document.createElement('div');
                card.className = 'post-item';
                const reviewStatusClass = getReviewStatusClass(item.reviewStatus);
                card.innerHTML = `
                    <div class="post-item__layout">
                        <img src="${item.imageUrl || 'https://via.placeholder.com/150'}" alt="Item Image" class="post-item__image">
                        <div class="post-item__content">
                            <div class="post-item__title-row">
                                <h3 class="post-item__title">${item.title}</h3>
                                ${getTypePill(item.type)}
                                <span class="${reviewStatusClass}">Review: ${item.reviewStatus || 'pending'}</span>
                            </div>
                            <p><strong>Posted by:</strong> ${item.creatorName || 'Unknown User'}</p>
                            <p>${item.description || 'No description provided.'}</p>
                            <p class="post-item__meta">${item.date} | ${item.location}</p>
                            <a href="/item-details?id=${docSnap.id}" target="_blank" class="post-item__link">
                                View Details <i class="fas fa-external-link-alt"></i>
                            </a>
                        </div>
                    </div>
                    <div class="post-item__actions">
                        <button class="btn btn-success approve-post-btn" data-id="${docSnap.id}">Approve</button>
                        <button class="btn btn-danger reject-post-btn" data-id="${docSnap.id}">Reject</button>
                    </div>
                `;
                pendingPostsList.appendChild(card);
            });

            document.querySelectorAll('.approve-post-btn').forEach((button) => {
                button.addEventListener('click', () => updatePostReviewStatus(button.dataset.id, 'approved'));
            });

            document.querySelectorAll('.reject-post-btn').forEach((button) => {
                button.addEventListener('click', () => updatePostReviewStatus(button.dataset.id, 'rejected'));
            });
        } catch (error) {
            console.error('Error fetching items:', error);
            renderPostsEmptyState('Error loading items.');
        }
    };

    fetchFoundItemsList();
}

async function updatePostReviewStatus(itemId, reviewStatus) {
    if (!confirm(`Are you sure you want to ${reviewStatus} this found item post?`)) {
        return;
    }

    try {
        const itemRef = doc(db, 'items', itemId);
        await updateDoc(itemRef, {
            reviewStatus,
            reviewedBy: auth.currentUser.uid,
            reviewedAt: serverTimestamp()
        });
        await writeAuditLog({
            type: 'post_reviewed',
            message: `Found item post ${reviewStatus}.`,
            targetId: itemId,
            targetType: 'item',
            meta: {
                reviewStatus
            }
        });
        alert(`Post ${reviewStatus} successfully.`);
        window.location.reload();
    } catch (error) {
        console.error('Error updating post review status:', error);
        alert('Error: ' + error.message);
    }
}

if (pendingClaimsList) {
    const fetchPendingClaims = async () => {
        try {
            const claimsQuery = query(collection(db, 'claims'), where('status', '==', 'pending'));
            const querySnapshot = await getDocs(claimsQuery);

            pendingClaimsList.innerHTML = '';
            if (querySnapshot.empty) {
                renderClaimsEmptyState('No pending direct claims to review. Live handover chats are handled from the dashboard.');
                return;
            }

            querySnapshot.forEach((docSnap) => {
                const claim = docSnap.data();
                const claimContext = getClaimContext(claim);
                const timeAgo = claim.createdAt ? claim.createdAt.toDate().toLocaleDateString() : 'Just now';

                const card = document.createElement('div');
                card.className = 'post-item';
                card.innerHTML = `
                    <div class="post-item__content">
                        <div class="section-header-row">
                            <h3 class="post-item__title">${claim.itemTitle || 'Unknown Item'} <small>(${claim.itemType || 'N/A'})</small></h3>
                            ${claimContext.badge}
                        </div>

                        <div class="claim-context-card">
                            <p><strong>Claimer:</strong> ${claim.claimerName} (${claim.claimerEmail})</p>
                            <p><strong>Date:</strong> ${timeAgo}</p>
                            <p><strong>Context:</strong> ${claimContext.text}</p>
                        </div>

                        <div class="claim-proof">
                            <h4 class="claim-proof__title">Message / Proof:</h4>
                            <p class="claim-proof__body">"${claim.message}"</p>
                        </div>

                        <p class="claim-token">
                            <strong>Token:</strong>
                            <span class="claim-token__value">${claim.claimToken || 'N/A'}</span>
                        </p>
                        <p class="post-item__meta">
                            <a href="/item-details?id=${claim.itemId}" target="_blank" class="post-item__link">
                                View Original Post <i class="fas fa-external-link-alt"></i>
                            </a>
                        </p>
                    </div>
                    <div class="claim-review-actions">
                        <button class="btn btn-success approve-claim-btn" data-id="${docSnap.id}" data-item="${claim.itemId}" data-claimer="${claim.claimerName || ''}">
                            <i class="fas fa-check"></i>
                            Approve & Mark Returned
                        </button>
                        <button class="btn btn-danger reject-claim-btn" data-id="${docSnap.id}">
                            <i class="fas fa-times"></i>
                            Reject
                        </button>
                    </div>
                `;
                pendingClaimsList.appendChild(card);
            });

            document.querySelectorAll('.approve-claim-btn').forEach((button) => {
                button.addEventListener('click', () => updateClaimStatus(button.dataset.id, button.dataset.item, 'approved', button.dataset.claimer));
            });

            document.querySelectorAll('.reject-claim-btn').forEach((button) => {
                button.addEventListener('click', () => updateClaimStatus(button.dataset.id, null, 'rejected'));
            });
        } catch (error) {
            console.error('Error fetching pending claims:', error);
            renderClaimsEmptyState('Error loading direct claims.');
        }
    };

    fetchPendingClaims();
}

async function updateClaimStatus(claimId, itemId, status, claimerName = '') {
    if (!confirm(`Are you sure you want to ${status} this claim? This action cannot be undone.`)) {
        return;
    }

    try {
        const claimRef = doc(db, 'claims', claimId);
        await updateDoc(claimRef, {
            status,
            reviewedBy: auth.currentUser.uid,
            reviewedAt: serverTimestamp()
        });

        if (status === 'approved' && itemId) {
            const itemRef = doc(db, 'items', itemId);
            const itemPayload = {
                status: 'resolved',
                resolvedByClaim: claimId,
                resolvedAt: serverTimestamp()
            };

            if (claimerName) {
                itemPayload.handedOverTo = claimerName;
            }

            await updateDoc(itemRef, itemPayload);
            alert('Claim approved! The item has been marked as RETURNED.');
        } else {
            alert(`Claim ${status} successfully.`);
        }

        await writeAuditLog({
            type: 'claim_reviewed',
            message: `Claim ${status}.`,
            targetId: claimId,
            targetType: 'claim',
            meta: {
                status,
                itemId: itemId || '',
                claimerName: claimerName || ''
            }
        });

        window.location.reload();
    } catch (error) {
        console.error('Error updating claim:', error);
        alert('Error: ' + error.message);
    }
}

if (statsPosts && statsClaims) {
    getDocs(query(collection(db, 'items'), where('reviewStatus', '==', 'pending'))).then((snapshot) => {
        statsPosts.textContent = snapshot.size;
    });

    getDocs(query(collection(db, 'claims'), where('status', '==', 'pending'))).then((snapshot) => {
        statsClaims.textContent = snapshot.size;
    });
}
