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

// Fetch Found Items (For Staff/Admin Only)
if (pendingPostsList) {
    const fetchFoundItemsList = async () => {
        // Fetch ALL items (Lost & Found), ordered by date
        const q = query(
            collection(db, "items"),
            where("status", "==", "active"), // Only active ones
            orderBy("createdAt", "desc")
        );

        try {
            const querySnapshot = await getDocs(q);

            pendingPostsList.innerHTML = '';
            if (querySnapshot.empty) {
                pendingPostsList.innerHTML = '<p>No items reported yet.</p>';
                return;
            }

            querySnapshot.forEach((docSnap) => {
                const item = docSnap.data();
                const div = document.createElement('div');
                div.className = 'post-item';

                const badgeClass = item.type === 'lost' ? 'badge-lost' : 'badge-found';

                div.innerHTML = `
                    <div style="display: flex; gap: 15px; align-items: start;">
                        <img src="${item.imageUrl || 'https://via.placeholder.com/150'}" alt="Item Image" style="width: 100px; height: 100px; object-fit: cover; border-radius: 8px;">
                        <div>
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                                <h3 style="margin: 0;">${item.title}</h3>
                                <span class="item-badge ${badgeClass}">${item.type.toUpperCase()}</span>
                            </div>
                            <p><strong>Posted by:</strong> ${item.creatorName}</p>
                            <p>${item.description}</p>
                            <p><small>${item.date} | ${item.location}</small></p>
                            <a href="../item-details.html?id=${docSnap.id}" target="_blank" style="color: var(--primary-color);">View Details <i class="fas fa-external-link-alt"></i></a>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px; margin-top: 10px;">
                        <button class="btn btn-danger delete-post-btn" style="background: var(--danger); color: white;" data-id="${docSnap.id}">Delete Post</button>
                    </div>
                `;
                pendingPostsList.appendChild(div);
            });

            // Add Event Listeners
            document.querySelectorAll('.delete-post-btn').forEach(btn => {
                btn.addEventListener('click', () => deletePost(btn.dataset.id));
            });
        } catch (error) {
            console.error("Error fetching items:", error);
            pendingPostsList.innerHTML = '<p>Error loading items.</p>';
        }
    };

    fetchFoundItemsList();
}

async function deletePost(itemId) {
    if (!confirm("Are you sure you want to delete this found item post?")) return;

    try {
        const itemRef = doc(db, "items", itemId);
        await updateDoc(itemRef, {
            status: 'removed',
            removedBy: auth.currentUser.uid,
            removedAt: serverTimestamp()
        });
        alert(`Post deleted successfully.`);
        window.location.reload();
    } catch (error) {
        console.error("Error deleting post:", error);
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

                        <p style="font-size: 0.9rem; color: var(--text-light); margin-top: 10px;"><strong>Token:</strong> <span style="font-family: monospace; background: #e5e7eb; padding: 2px 5px; border-radius: 4px;">${claim.claimToken || 'N/A'}</span></p>
                        <p style="font-size: 0.9rem;"><a href="../item-details.html?id=${claim.itemId}" target="_blank" style="color: var(--primary-color);">View Original Post <i class="fas fa-external-link-alt"></i></a></p>
                        
                        <div style="margin-top: 10px;">
                             <button class="btn btn-outline send-email-btn" data-email="${claim.claimerEmail}" data-name="${claim.claimerName}" data-item="${claim.itemTitle}" data-token="${claim.claimToken || 'N/A'}" style="font-size: 0.8rem; padding: 5px 10px;">
                                <i class="fas fa-envelope"></i> Send Email
                            </button>
                        </div>
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

        // EmailJS Event Listeners
        document.querySelectorAll('.send-email-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const email = btn.dataset.email;
                const name = btn.dataset.name;
                const itemTitle = btn.dataset.item;
                const token = btn.dataset.token;

                // SERVICE ID and TEMPLATE ID
                const serviceID = "YOUR_SERVICE_ID";
                const templateID = "YOUR_TEMPLATE_ID";

                if (serviceID === "YOUR_SERVICE_ID") {
                    alert("Please configure EmailJS Service ID and Template ID in assets/js/staff.js");
                    return;
                }

                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

                const templateParams = {
                    to_email: email,
                    to_name: name,
                    item_name: itemTitle,
                    claim_token: token,
                    message: `We received your claim for: ${itemTitle}. Your Token is: ${token}. Please reply with details.`
                };

                emailjs.send(serviceID, templateID, templateParams)
                    .then(() => {
                        alert("Email sent successfully!");
                        btn.innerHTML = '<i class="fas fa-check"></i> Sent';
                    })
                    .catch((err) => {
                        console.error("EmailJS Error:", err);
                        alert("Failed to send email. Check console for details.");
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fas fa-envelope"></i> Send Email';
                    });
            });
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
