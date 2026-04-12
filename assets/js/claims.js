import { db, auth } from './firebase-config.js';
import { writeAuditLog } from './audit-log.js';
import {
    collection,
    addDoc,
    getDocs,
    query,
    where,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const myClaimsList = document.getElementById('my-claims-list');

function getClaimStatusClass(status) {
    if (status === 'approved') return 'status-label status-label--approved';
    if (status === 'rejected') return 'status-label status-label--rejected';
    return 'status-label status-label--pending';
}

document.addEventListener('submit', async (event) => {
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
        const claimRef = await addDoc(collection(db, 'claims'), {
            itemId,
            claimerUid: user.uid,
            claimerName: user.displayName || user.email,
            message,
            evidenceFiles: [],
            status: 'pending',
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
                myClaimsList.innerHTML = '<p>You haven\'t made any claims yet.</p>';
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
