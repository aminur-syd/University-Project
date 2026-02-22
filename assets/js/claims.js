import { db, auth, storage } from './firebase-config.js';
import {
    collection,
    addDoc,
    getDocs,
    query,
    where,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const myClaimsList = document.getElementById('my-claims-list');

// Submit Claim (Handled from item-details.html technically, but logic here)
// Note: We need to attach the event listener dynamically in item-details.html or export this function
// For simplicity, I will attach a global listener or look for the form here if it exists (it exists dynamically)

document.addEventListener('submit', async (e) => {
    if (e.target && e.target.id === 'claim-form') {
        e.preventDefault();

        const user = auth.currentUser;
        if (!user) return;

        const urlParams = new URLSearchParams(window.location.search);
        const itemId = urlParams.get('id');
        const message = document.getElementById('claim-message').value;
        const submitBtn = e.target.querySelector('button[type="submit"]');

        if (!itemId) return;

        submitBtn.disabled = true;
        submitBtn.textContent = "Submitting...";

        try {
            // Check if already claimed? (Optional)

            await addDoc(collection(db, "claims"), {
                itemId: itemId,
                claimerUid: user.uid,
                claimerName: user.displayName || user.email,
                message: message,
                evidenceFiles: [], // TODO: Add file upload if needed, just text for now as per minimal req
                status: "pending", // pending, approved, rejected
                createdAt: serverTimestamp()
            });

            alert("Claim submitted successfully! Staff will review it.");
            window.location.href = "user/my-claims.html";
        } catch (error) {
            console.error("Error submitting claim:", error);
            alert("Error submitting claim: " + error.message);
            submitBtn.disabled = false;
        }
    }
});

// Fetch My Claims
if (myClaimsList) {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            try {
                const q = query(
                    collection(db, "claims"),
                    where("claimerUid", "==", user.uid),
                    orderBy("createdAt", "desc")
                );

                const querySnapshot = await getDocs(q);
                myClaimsList.innerHTML = '';

                if (querySnapshot.empty) {
                    myClaimsList.innerHTML = '<p>You haven\'t made any claims yet.</p>';
                    return;
                }

                querySnapshot.forEach((doc) => {
                    const claim = doc.data();
                    const div = document.createElement('div');
                    div.className = 'post-item';

                    let statusColor = 'orange';
                    if (claim.status === 'approved') statusColor = 'green';
                    if (claim.status === 'rejected') statusColor = 'red';

                    div.innerHTML = `
                         <div>
                            <h3>Claim for Item ID: ${claim.itemId}</h3>
                            <p>Message: ${claim.message}</p>
                            <span style="color: ${statusColor}; font-weight: bold; font-size: 0.9rem;">Status: ${claim.status}</span>
                        </div>
                        <a href="../item-details.html?id=${claim.itemId}" class="btn btn-secondary">View Item</a>
                    `;
                    myClaimsList.appendChild(div);
                });
            } catch (error) {
                console.error(error);
                myClaimsList.innerHTML = '<p>Error loading claims.</p>';
            }
        }
    });
}
