import { db, auth } from './firebase-config.js';
import { writeAuditLog } from './audit-log.js';
import {
    collection,
    addDoc,
    getDocs,
    getDoc,
    query,
    where,
    orderBy,
    serverTimestamp,
    doc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const myClaimsList = document.getElementById('my-claims-list');

function getClaimStatusClass(status) {
    if (status === 'approved') return 'status-label status-label--approved';
    if (status === 'rejected') return 'status-label status-label--rejected';
    return 'status-label status-label--pending';
}

function getLegacyClaimType(itemType) {
    if (itemType === 'found') return 'ownership_claim';
    if (itemType === 'lost') return 'finder_report';
    return 'general_claim';
}

function generateClaimToken() {
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X');
    return `CLM-${Date.now().toString(36).toUpperCase()}-${suffix}`;
}

document.addEventListener('submit', async (event) => {
    // Legacy fallback path: no current HTML page uses this form, but older claim links can still hit it.
    if (!event.target || event.target.id !== 'claim-form') {
        return;
    }

    event.preventDefault();

    const user = auth.currentUser;
    if (!user) return;

    const urlParams = new URLSearchParams(window.location.search);
    const itemId = urlParams.get('id');
    const message = document.getElementById('claim-message').value;
    const submitBtn = event.target.querySelector('button[type="submit"]');

    if (!itemId || !submitBtn) {
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
        const itemSnapshot = await getDoc(doc(db, 'items', itemId));
        if (!itemSnapshot.exists()) {
            throw new Error('The related item could not be found.');
        }

        const itemData = itemSnapshot.data();
        const itemTitle = itemData.title || 'Unknown Item';
        const itemType = itemData.type || 'unknown';
        const claimerName = user.displayName || user.email || 'Unknown User';

        const claimRef = await addDoc(collection(db, 'claims'), {
            itemId,
            itemTitle,
            itemType,
            claimerUid: user.uid,
            claimerName,
            claimerEmail: user.email || 'No email on account',
            message,
            evidenceFiles: [],
            status: 'pending',
            type: getLegacyClaimType(itemData.type),
            claimToken: generateClaimToken(),
            createdAt: serverTimestamp()
        });

        await writeAuditLog({
            type: 'claim_created',
            message: `${user.displayName || user.email || 'A user'} submitted a claim.`,
            targetId: claimRef.id,
            targetType: 'claim',
            meta: {
                itemId
            }
        });

        alert('Claim submitted successfully! Staff will review it.');
        window.location.href = 'user/my-claims.html';
    } catch (error) {
        console.error('Error submitting claim:', error);
        alert('Error submitting claim: ' + error.message);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit';
    }
});

if (myClaimsList) {
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            return;
        }

        try {
            const claimsQuery = query(
                collection(db, 'claims'),
                where('claimerUid', '==', user.uid),
                orderBy('createdAt', 'desc')
            );
            const claimsSnapshot = await getDocs(claimsQuery);
            myClaimsList.innerHTML = '';

            if (claimsSnapshot.empty) {
                myClaimsList.innerHTML = '<p>No legacy direct claims found. If you have an active handover, track it from your Dashboard.</p>';
                return;
            }

            claimsSnapshot.forEach((docSnap) => {
                const claim = docSnap.data();
                const card = document.createElement('div');
                card.className = 'post-item';
                card.innerHTML = `
                    <div class="post-item__content">
                        <h3 class="post-item__title">Claim for Item ID: ${claim.itemId}</h3>
                        <p>Message: ${claim.message}</p>
                        <span class="${getClaimStatusClass(claim.status)}">Status: ${claim.status}</span>
                    </div>
                    <div class="post-item__actions">
                        <a href="../item-details.html?id=${claim.itemId}" class="btn btn-secondary">View Item</a>
                    </div>
                `;
                myClaimsList.appendChild(card);
            });
        } catch (error) {
            console.error(error);
            myClaimsList.innerHTML = '<p>Error loading claims.</p>';
        }
    });
}
