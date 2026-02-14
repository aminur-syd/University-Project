import { db, auth } from './firebase-config.js';
import {
    collection,
    getDocs,
    query,
    where,
    doc,
    updateDoc,
    getDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const pendingPostsList = document.getElementById('review-posts-list');
const pendingClaimsList = document.getElementById('review-claims-list');
const statsPosts = document.getElementById('pending-posts');
const statsClaims = document.getElementById('pending-claims');

// Fetch Pending Posts
if (pendingPostsList) {
    const fetchPendingPosts = async () => {
        const q = query(collection(db, "items"), where("reviewStatus", "==", "pending"));
        const querySnapshot = await getDocs(q);

        pendingPostsList.innerHTML = '';
        if (querySnapshot.empty) {
            pendingPostsList.innerHTML = '<p>No pending posts to review.</p>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const item = docSnap.data();
            const div = document.createElement('div');
            div.className = 'post-item';
            div.innerHTML = `
                <div style="display: flex; gap: 15px; align-items: start;">
                    <img src="${item.imageUrl || 'https://via.placeholder.com/150'}" alt="Item Image" style="width: 100px; height: 100px; object-fit: cover; border-radius: 8px;">
                    <div>
                        <h3>${item.title} (${item.type})</h3>
                        <p><strong>Posted by:</strong> ${item.creatorName}</p>
                        <p>${item.description}</p>
                        <p><small>${item.date} | ${item.location}</small></p>
                    </div>
                </div>
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <button class="btn btn-primary approve-post-btn" data-id="${docSnap.id}">Approve</button>
                    <button class="btn btn-danger reject-post-btn" style="background: var(--danger); color: white;" data-id="${docSnap.id}">Reject</button>
                </div>
            `;
            pendingPostsList.appendChild(div);
        });

        // Add Event Listeners
        document.querySelectorAll('.approve-post-btn').forEach(btn => {
            btn.addEventListener('click', () => updatePostStatus(btn.dataset.id, 'approved'));
        });
        document.querySelectorAll('.reject-post-btn').forEach(btn => {
            btn.addEventListener('click', () => updatePostStatus(btn.dataset.id, 'rejected'));
        });
    };

    fetchPendingPosts();
}

async function updatePostStatus(itemId, status) {
    try {
        const itemRef = doc(db, "items", itemId);
        await updateDoc(itemRef, {
            reviewStatus: status,
            status: status === 'approved' ? 'active' : 'removed', // Set to active if approved
            reviewedBy: auth.currentUser.uid,
            reviewedAt: serverTimestamp()
        });
        alert(`Post ${status} successfully.`);
        window.location.reload();
    } catch (error) {
        console.error("Error updating post:", error);
        alert("Error: " + error.message);
    }
}

// Fetch Pending Claims
if (pendingClaimsList) {
    const fetchPendingClaims = async () => {
        const q = query(collection(db, "claims"), where("status", "==", "pending"));
        const querySnapshot = await getDocs(q);

        pendingClaimsList.innerHTML = '';
        if (querySnapshot.empty) {
            pendingClaimsList.innerHTML = '<p>No pending claims to review.</p>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const claim = docSnap.data();
            const div = document.createElement('div');
            div.className = 'post-item';

            // Format timestamps or default text
            const timeAgo = claim.createdAt ? new Date(claim.createdAt.toDate()).toLocaleDateString() : 'Just now';

            // Determine Context
            let contextBadge = '';
            let contextText = '';

            if (claim.type === 'ownership_claim') {
                contextBadge = '<span class="item-badge badge-lost">Claiming Ownership</span>';
                contextText = `User claims they <strong>own</strong> this found item.`;
            } else if (claim.type === 'finder_report') {
                contextBadge = '<span class="item-badge badge-found">Finder Report</span>';
                contextText = `User reports they <strong>found</strong> this lost item.`;
            } else {
                contextBadge = '<span class="item-badge" style="background: #9ca3af;">General Claim</span>';
                contextText = `General claim or report.`;
            }

            div.innerHTML = `
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                        <h3>${claim.itemTitle || 'Unknown Item'} <small>(${claim.itemType || 'N/A'})</small></h3>
                        ${contextBadge}
                    </div>
                    
                    <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                        <p style="margin-bottom: 5px;"><strong>Claimer:</strong> ${claim.claimerName} (${claim.claimerEmail})</p>
                        <p style="margin-bottom: 5px;"><strong>Date:</strong> ${timeAgo}</p>
                        <p><strong>Context:</strong> ${contextText}</p>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <h4 style="font-size: 0.95rem; margin-bottom: 5px; color: var(--text-light);">Message / Proof:</h4>
                        <p style="font-style: italic; color: var(--text-color); background: #fff; padding: 10px; border: 1px solid #e5e7eb; border-radius: 4px;">"${claim.message}"</p>
                    </div>

                    <p style="font-size: 0.9rem;"><a href="../item-details.html?id=${claim.itemId}" target="_blank" style="color: var(--primary-color);">View Original Post <i class="fas fa-external-link-alt"></i></a></p>
                </div>
                <div style="display: flex; gap: 10px; margin-top: 15px; border-top: 1px solid #e5e7eb; padding-top: 15px;">
                    <button class="btn btn-primary approve-claim-btn" data-id="${docSnap.id}" data-item="${claim.itemId}" style="background: var(--success); border-color: var(--success);">
                        <i class="fas fa-check"></i> Approve & Mark Returned
                    </button>
                    <button class="btn btn-danger reject-claim-btn" style="background: var(--danger); color: white;" data-id="${docSnap.id}">
                        <i class="fas fa-times"></i> Reject
                    </button>
                </div>
            `;
            pendingClaimsList.appendChild(div);
        });

        document.querySelectorAll('.approve-claim-btn').forEach(btn => {
            btn.addEventListener('click', () => updateClaimStatus(btn.dataset.id, btn.dataset.item, 'approved'));
        });
        document.querySelectorAll('.reject-claim-btn').forEach(btn => {
            btn.addEventListener('click', () => updateClaimStatus(btn.dataset.id, null, 'rejected'));
        });
    };

    fetchPendingClaims();
}

async function updateClaimStatus(claimId, itemId, status) {
    if (!confirm(`Are you sure you want to ${status} this claim? This action cannot be undone.`)) return;

    try {
        const claimRef = doc(db, "claims", claimId);

        // 1. Update Claim Status
        await updateDoc(claimRef, {
            status: status,
            reviewedBy: auth.currentUser.uid,
            reviewedAt: serverTimestamp()
        });

        // 2. If Approved, Mark Item as Resolved (Returned)
        if (status === 'approved' && itemId) {
            const itemRef = doc(db, "items", itemId);
            await updateDoc(itemRef, {
                status: 'resolved',
                resolvedByClaim: claimId,
                resolvedAt: serverTimestamp()
            });
            alert(`Claim approved! The item has been marked as RETURNED.`);
        } else {
            alert(`Claim ${status} successfully.`);
        }

        window.location.reload();
    } catch (error) {
        console.error("Error updating claim:", error);
        alert("Error: " + error.message);
    }
}

// Stats
if (statsPosts && statsClaims) {
    // This is a quick fetch, normally counting requires specific queries or counters
    getDocs(query(collection(db, "items"), where("reviewStatus", "==", "pending"))).then(snap => {
        statsPosts.textContent = snap.size;
    });
    getDocs(query(collection(db, "claims"), where("status", "==", "pending"))).then(snap => {
        statsClaims.textContent = snap.size;
    });
}
