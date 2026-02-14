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
                <div>
                    <h3>${item.title} (${item.type})</h3>
                    <p>Posted by: ${item.creatorName}</p>
                    <p>${item.description}</p>
                </div>
                <div style="display: flex; gap: 10px;">
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
            div.innerHTML = `
                <div>
                    <h3>Claim for Item ID: <a href="../item-details.html?id=${claim.itemId}">${claim.itemId}</a></h3>
                    <p>Claimer: ${claim.claimerName}</p>
                    <p>Message: ${claim.message}</p>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-primary approve-claim-btn" data-id="${docSnap.id}" data-item="${claim.itemId}">Approve</button>
                    <button class="btn btn-danger reject-claim-btn" style="background: var(--danger); color: white;" data-id="${docSnap.id}">Reject</button>
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
    try {
        const claimRef = doc(db, "claims", claimId);
        await updateDoc(claimRef, {
            status: status,
            reviewedBy: auth.currentUser.uid,
            reviewedAt: serverTimestamp()
        });

        if (status === 'approved' && itemId) {
            // Update Item Status to Resolved
            const itemRef = doc(db, "items", itemId);
            await updateDoc(itemRef, {
                status: 'resolved'
            });
        }

        alert(`Claim ${status} successfully.`);
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
