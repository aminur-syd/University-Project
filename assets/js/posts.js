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
    getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const createPostForm = document.getElementById('create-post-form');
const latestItemsGrid = document.getElementById('latest-items-grid');
const itemsGrid = document.getElementById('items-grid');
const myPostsList = document.getElementById('my-posts-list');
const itemDetailContainer = document.getElementById('item-detail-container');

// Create Post
if (createPostForm) {
    createPostForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const user = auth.currentUser;
        if (!user) {
            alert("You must be logged in to post.");
            window.location.href = "../login.html";
            return;
        }

        const type = document.getElementById('type').value;
        const category = document.getElementById('category').value;
        const title = document.getElementById('title').value;
        const date = document.getElementById('date').value;
        const location = document.getElementById('location').value;
        const description = document.getElementById('description').value;
        const imageFile = document.getElementById('image').files[0];
        const submitBtn = createPostForm.querySelector('button[type="submit"]');
        const messageP = document.getElementById('submit-message');

        submitBtn.disabled = true;
        submitBtn.textContent = "Posting...";

        try {
            let imageUrl = null;
            if (imageFile) {
                const storageRef = ref(storage, `items/${user.uid}/${Date.now()}_${imageFile.name}`);
                await uploadBytes(storageRef, imageFile);
                imageUrl = await getDownloadURL(storageRef);
            }

            await addDoc(collection(db, "items"), {
                type,
                category,
                title,
                description,
                location,
                date,
                imageUrl,
                createdBy: user.uid,
                creatorName: user.displayName,
                reviewStatus: "pending", // pending, approved, rejected
                status: "active", // active, resolved, removed
                createdAt: serverTimestamp()
            });

            messageP.style.display = 'block';
            messageP.style.color = 'green';
            messageP.textContent = "Post submitted! It will be visible after staff approval.";
            createPostForm.reset();
        } catch (error) {
            console.error(error);
            messageP.style.display = 'block';
            messageP.style.color = 'red';
            messageP.textContent = "Error creating post: " + error.message;
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Submit Post";
        }
    });
}

// Fetch Latest Items (Home Page) or Browse Items
if (latestItemsGrid || itemsGrid) {
    const fetchItems = async () => {
        const grid = latestItemsGrid || itemsGrid;
        grid.innerHTML = '<div class="loading-spinner">Loading items...</div>';

        try {
            const q = query(
                collection(db, "items"),
                where("reviewStatus", "==", "approved"),
                where("status", "==", "active"),
                orderBy("createdAt", "desc")
            );

            const querySnapshot = await getDocs(q);
            grid.innerHTML = '';

            if (querySnapshot.empty) {
                grid.innerHTML = '<p>No items found.</p>';
                return;
            }

            querySnapshot.forEach((doc) => {
                const item = doc.data();
                const card = document.createElement('div');
                card.className = 'item-card';
                card.innerHTML = `
                    <div class="item-image" style="background-image: url('${item.imageUrl || 'https://via.placeholder.com/300x200?text=No+Image'}');"></div>
                    <div class="item-content">
                        <span class="item-badge ${item.type === 'lost' ? 'badge-lost' : 'badge-found'}">${item.type}</span>
                        <h3 class="item-title">${item.title}</h3>
                        <p class="item-location"><i class="fas fa-map-marker-alt"></i> ${item.location}</p>
                        <p class="item-date"><i class="far fa-calendar-alt"></i> ${item.date}</p>
                        <a href="item-details.html?id=${doc.id}" class="btn btn-outline" style="color: var(--primary-color); border-color: var(--primary-color); margin-top: 10px; width: 100%; text-align: center;">View Details</a>
                    </div>
                `;
                grid.appendChild(card);
            });
        } catch (error) {
            console.error(error);
            grid.innerHTML = '<p>Error loading items.</p>';
        }
    };

    fetchItems();
}

// Fetch My Posts (User Dashboard)
if (myPostsList) {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            try {
                const q = query(
                    collection(db, "items"),
                    where("createdBy", "==", user.uid),
                    orderBy("createdAt", "desc")
                );

                const querySnapshot = await getDocs(q);
                myPostsList.innerHTML = '';

                if (querySnapshot.empty) {
                    myPostsList.innerHTML = '<p>You haven\'t posted any items yet.</p>';
                    return;
                }

                querySnapshot.forEach((doc) => {
                    const item = doc.data();
                    const div = document.createElement('div');
                    div.className = 'post-item';

                    let statusColor = 'orange';
                    if (item.reviewStatus === 'approved') statusColor = 'green';
                    if (item.reviewStatus === 'rejected') statusColor = 'red';

                    div.innerHTML = `
                         <div>
                            <h3>${item.title} (${item.type})</h3>
                            <p>${item.date} - ${item.location}</p>
                            <span style="color: ${statusColor}; font-weight: bold; font-size: 0.9rem;">Status: ${item.reviewStatus}</span>
                        </div>
                        <a href="../item-details.html?id=${doc.id}" class="btn btn-secondary">View</a>
                    `;
                    myPostsList.appendChild(div);
                });
            } catch (error) {
                console.error(error);
                myPostsList.innerHTML = '<p>Error loading posts.</p>';
            }
        }
    });
}

// Item Details Page
if (itemDetailContainer) {
    const urlParams = new URLSearchParams(window.location.search);
    const itemId = urlParams.get('id');

    if (itemId) {
        getDoc(doc(db, "items", itemId)).then((docSnap) => {
            if (docSnap.exists()) {
                const item = docSnap.data();
                itemDetailContainer.innerHTML = `
                    <div style="display: flex; gap: 40px; flex-wrap: wrap;">
                         <div style="flex: 1; min-width: 300px;">
                            <img src="${item.imageUrl || 'https://via.placeholder.com/600x400?text=No+Image'}" style="width: 100%; border-radius: 8px;">
                        </div>
                        <div style="flex: 1; min-width: 300px;">
                            <span class="item-badge ${item.type === 'lost' ? 'badge-lost' : 'badge-found'}" style="font-size: 1rem; padding: 6px 12px;">${item.type.toUpperCase()}</span>
                            <h1 style="margin: 15px 0;">${item.title}</h1>
                            <p style="font-size: 1.1rem; color: var(--text-light); margin-bottom: 20px;">${item.description}</p>
                            
                            <div style="margin-bottom: 20px;">
                                <p><strong>Category:</strong> ${item.category}</p>
                                <p><strong>Location:</strong> ${item.location}</p>
                                <p><strong>Date:</strong> ${item.date}</p>
                            </div>

                            ${item.type === 'found' ? `<button id="claim-btn" class="btn btn-primary">Claim This Item</button>` : `<button class="btn btn-primary" onclick="alert('Please contact the finder if you have information.')">I Found This!</button>`}
                            
                            <div id="claim-form-container" style="display: none; margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
                                <h3>Submit a Claim</h3>
                                <form id="claim-form">
                                    <div class="form-group">
                                        <label>Message / Proof Description</label>
                                        <textarea id="claim-message" class="form-control" rows="3" required></textarea>
                                    </div>
                                    <button type="submit" class="btn btn-primary">Submit Claim</button>
                                </form>
                            </div>
                        </div>
                    </div>
                `;

                // Handle Claim Button
                const claimBtn = document.getElementById('claim-btn');
                if (claimBtn) {
                    claimBtn.addEventListener('click', () => {
                        if (!auth.currentUser) {
                            window.location.href = "login.html";
                            return;
                        }
                        document.getElementById('claim-form-container').style.display = 'block';
                    });
                }

                // Handle Claim Form Submission (will be moved to claims.js or handled here)
                // For simplicity, I'll dispatch a custom event or let claims.js handle it if it's imported
            } else {
                itemDetailContainer.innerHTML = '<p>Item not found.</p>';
            }
        });
    }
}
