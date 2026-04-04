import { db, auth } from './firebase-config.js';
import {
    collection,
    getDocs,
    query,
    where,
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
            where('status', '==', 'active'),
            orderBy('createdAt', 'desc')
        );

        try {
            const querySnapshot = await getDocs(itemsQuery);
            pendingPostsList.innerHTML = '';

            if (querySnapshot.empty) {
                renderPostsEmptyState('No items reported yet.');
                return;
            }

            querySnapshot.forEach((docSnap) => {
                const item = docSnap.data();
                const card = document.createElement('div');
                card.className = 'post-item';
                card.innerHTML = `
                    <div class="post-item__layout">
                        <img src="${item.imageUrl || 'https://via.placeholder.com/150'}" alt="Item Image" class="post-item__image">
                        <div class="post-item__content">
                            <div class="post-item__title-row">
                                <h3 class="post-item__title">${item.title}</h3>
                                ${getTypePill(item.type)}
                            </div>
                            <p><strong>Posted by:</strong> ${item.creatorName || 'Unknown User'}</p>
                            <p>${item.description || 'No description provided.'}</p>
                            <p class="post-item__meta">${item.date} | ${item.location}</p>
                            <a href="../item-details.html?id=${docSnap.id}" target="_blank" class="post-item__link">
                                View Details <i class="fas fa-external-link-alt"></i>
                            </a>
                        </div>
                    </div>
                    <div class="post-item__actions">
                        <button class="btn btn-danger delete-post-btn" data-id="${docSnap.id}">Delete Post</button>
                    </div>
                `;
                pendingPostsList.appendChild(card);
            });

            document.querySelectorAll('.delete-post-btn').forEach((button) => {
                button.addEventListener('click', () => deletePost(button.dataset.id));
            });
        } catch (error) {
            console.error('Error fetching items:', error);
            renderPostsEmptyState('Error loading items.');
        }
    };

    fetchFoundItemsList();
}

async function deletePost(itemId) {
    if (!confirm('Are you sure you want to delete this found item post?')) {
        return;
    }

    try {
        const itemRef = doc(db, 'items', itemId);
        await updateDoc(itemRef, {
            status: 'removed',
            removedBy: auth.currentUser.uid,
            removedAt: serverTimestamp()
        });
        alert('Post deleted successfully.');
        window.location.reload();
    } catch (error) {
        console.error('Error deleting post:', error);
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
                renderClaimsEmptyState('No pending claims to review.');
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
                            <a href="../item-details.html?id=${claim.itemId}" target="_blank" class="post-item__link">
                                View Original Post <i class="fas fa-external-link-alt"></i>
                            </a>
                        </p>

                        <div class="claim-email-action">
                            <button class="btn btn-outline btn-sm send-email-btn" data-email="${claim.claimerEmail}" data-name="${claim.claimerName}" data-item="${claim.itemTitle}" data-token="${claim.claimToken || 'N/A'}">
                                <i class="fas fa-envelope"></i>
                                Send Email
                            </button>
                        </div>
                    </div>
                    <div class="claim-review-actions">
                        <button class="btn btn-success approve-claim-btn" data-id="${docSnap.id}" data-item="${claim.itemId}">
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
                button.addEventListener('click', () => updateClaimStatus(button.dataset.id, button.dataset.item, 'approved'));
            });

            document.querySelectorAll('.reject-claim-btn').forEach((button) => {
                button.addEventListener('click', () => updateClaimStatus(button.dataset.id, null, 'rejected'));
            });

            document.querySelectorAll('.send-email-btn').forEach((button) => {
                button.addEventListener('click', () => {
                    const serviceID = 'YOUR_SERVICE_ID';
                    const templateID = 'YOUR_TEMPLATE_ID';

                    if (serviceID === 'YOUR_SERVICE_ID') {
                        alert('Please configure EmailJS Service ID and Template ID in assets/js/staff.js');
                        return;
                    }

                    button.disabled = true;
                    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

                    const templateParams = {
                        to_email: button.dataset.email,
                        to_name: button.dataset.name,
                        item_name: button.dataset.item,
                        claim_token: button.dataset.token,
                        message: `We received your claim for: ${button.dataset.item}. Your Token is: ${button.dataset.token}. Please reply with details.`
                    };

                    window.emailjs.send(serviceID, templateID, templateParams)
                        .then(() => {
                            alert('Email sent successfully!');
                            button.innerHTML = '<i class="fas fa-check"></i> Sent';
                        })
                        .catch((error) => {
                            console.error('EmailJS Error:', error);
                            alert('Failed to send email. Check console for details.');
                            button.disabled = false;
                            button.innerHTML = '<i class="fas fa-envelope"></i> Send Email';
                        });
                });
            });
        } catch (error) {
            console.error('Error fetching pending claims:', error);
            renderClaimsEmptyState('Error loading claims.');
        }
    };

    fetchPendingClaims();
}

async function updateClaimStatus(claimId, itemId, status) {
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
            await updateDoc(itemRef, {
                status: 'resolved',
                resolvedByClaim: claimId,
                resolvedAt: serverTimestamp()
            });
            alert('Claim approved! The item has been marked as RETURNED.');
        } else {
            alert(`Claim ${status} successfully.`);
        }

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
