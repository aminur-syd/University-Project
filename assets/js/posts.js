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

const createPostForm = document.getElementById('create-post-form');
const latestItemsGrid = document.getElementById('latest-items-grid');
const itemsGrid = document.getElementById('items-grid');
const myPostsList = document.getElementById('my-posts-list');
const itemDetailContainer = document.getElementById('item-detail-container');

// Create Post
if (createPostForm) {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('type')) {
        const typeSelect = document.getElementById('type');
        if (typeSelect && (urlParams.get('type') === 'lost' || urlParams.get('type') === 'found')) {
            typeSelect.value = urlParams.get('type');
        }
    }

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
            const IMGBB_API_KEY = 'b7d7a635920b14b3b0a9868f055eb0b9'; // Provided by user

            let imageUrl = null;
            if (imageFile) {
                submitBtn.textContent = "Uploading Image...";

                const formData = new FormData();
                formData.append('image', imageFile);

                try {
                    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
                        method: 'POST',
                        body: formData
                    });

                    const result = await response.json();

                    if (result.success) {
                        imageUrl = result.data.url;
                    } else {
                        throw new Error('ImgBB Upload Failed: ' + (result.error?.message || 'Unknown error'));
                    }
                } catch (apiError) {
                    throw new Error('Image Upload Error: ' + apiError.message);
                }
            }

            submitBtn.textContent = "Saving Details...";

            // AUTOMATIC APPROVAL LOGIC
            // Lost items are instantly active. Found items require staff review to prevent false claims.
            const initialReviewStatus = type === 'lost' ? "approved" : "pending";
            // Hidden items shouldn't appear in public queries, even if active, so we rely on reviewStatus

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
                reviewStatus: initialReviewStatus,
                status: "active", // Active means not resolved/deleted
                createdAt: serverTimestamp()
            });

            messageP.style.display = 'block';
            messageP.style.color = 'green';
            messageP.textContent = "Post submitted successfully!";
            createPostForm.reset();

            // Show Custom Modal
            const successModal = document.getElementById('success-modal');
            if (successModal) {
                // Update modal message if possible (or keep generic 'Success!')
                const modalMsg = successModal.querySelector('p');
                if (modalMsg) modalMsg.textContent = "Your post is now live.";

                successModal.classList.add('active');

                // Handle Close / Continue
                const closeBtn = document.getElementById('close-modal-btn');
                if (closeBtn) {
                    closeBtn.onclick = () => {
                        successModal.classList.remove('active');
                        // Redirect to Home or Dashboard
                        window.location.href = "../index.html";
                    };
                }
            } else {
                alert("Success! Your post is now live.");
                window.location.href = "../index.html";
            }
        } catch (error) {
            console.error("Error creating post:", error);
            messageP.style.display = 'block';
            messageP.style.color = 'red';

            let errorMsg = "Error: " + error.message;
            if (error.code === 'storage/unauthorized') {
                errorMsg = "Error: Permission Denied. Please check your Firebase Storage Rules.";
            }

            messageP.textContent = errorMsg;
            alert(errorMsg + "\n\nSee debugging guide for help.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Submit Post";
        }
    });
}

// Fetch Latest Items (Home Page) or Browse Items
const latestFoundGrid = document.getElementById('latest-found-grid');
const latestLostGrid = document.getElementById('latest-lost-grid');

if (latestFoundGrid || latestLostGrid || itemsGrid) {
    const renderItems = async (items, container) => {
        container.innerHTML = '';
        if (items.length === 0) {
            container.innerHTML = '<p>No items found.</p>';
            return;
        }

        // Check if current user is staff/admin for visibility rules
        let isStaff = false;
        if (auth.currentUser) {
            try {
                const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
                if (userDoc.exists() && ['staff', 'admin'].includes(userDoc.data().role)) {
                    isStaff = true;
                }
            } catch (e) {
                console.error("Error checking role for render", e);
            }
        }

        items.forEach((docSnap) => {
            const item = docSnap.data();
            const card = document.createElement('div');
            card.className = 'item-card';

            // OBSCURE DATA LOGIC for FOUND items if not staff
            let displayLocation = item.location;
            let displayDescription = item.description;
            let displayDate = item.date;

            // Strict rendering: If it's a found item, hide sensitive data from the public
            // The item.status != 'resolved' prevents masking items that are already returned and public
            if (item.type === 'found' && !isStaff && item.status !== 'resolved') {
                displayLocation = "Location Hidden for Security";
                displayDate = "Date Hidden";
                // Optionally truncate description or hide it completely on the card
            }

            card.innerHTML = `
                <div class="item-image" style="background-image: url('${item.imageUrl || 'https://via.placeholder.com/300x200?text=No+Image'}');"></div>
                <div class="item-content">
                    <span class="item-badge ${item.type === 'lost' ? 'badge-lost' : 'badge-found'}">${item.type}</span>
                    <h3 class="item-title">${item.title}</h3>
                    <p class="item-location"><i class="fas fa-map-marker-alt"></i> ${displayLocation}</p>
                    <p class="item-date"><i class="far fa-calendar-alt"></i> ${displayDate}</p>
                    <a href="item-details.html?id=${docSnap.id}" class="btn btn-outline" style="color: var(--primary-color); border-color: var(--primary-color); margin-top: 10px; width: 100%; text-align: center;">View Details</a>
                </div>
            `;
            container.appendChild(card);
        });
    };


    // Fetch Latest Items (Home Page)
    const fetchHomePageItems = async () => {
        try {
            // Fetch Latest Lost Items (Approved is default for Lost)
            if (latestLostGrid) {
                latestLostGrid.innerHTML = '<div class="loading-spinner">Loading recently lost items...</div>';
                const qLost = query(
                    collection(db, "items"),
                    where("type", "==", "lost"),
                    where("status", "==", "active"),
                    where("reviewStatus", "==", "approved"),
                    orderBy("createdAt", "desc"),
                    limit(4)
                );
                const snapLost = await getDocs(qLost);
                await renderItems(snapLost.docs, latestLostGrid);
            }

            // Fetch Latest Found Items (MUST BE APPROVED)
            if (latestFoundGrid) {
                latestFoundGrid.innerHTML = '<div class="loading-spinner">Loading approved found items...</div>';
                const qFound = query(
                    collection(db, "items"),
                    where("type", "==", "found"),
                    where("status", "==", "active"),
                    where("reviewStatus", "==", "approved"), // Core requirement: Only show approved found items
                    orderBy("createdAt", "desc"),
                    limit(4)
                );
                const snapFound = await getDocs(qFound);
                await renderItems(snapFound.docs, latestFoundGrid);
            }

        } catch (error) {
            console.error("Error fetching homepage items:", error);
            if (latestLostGrid) latestLostGrid.innerHTML = '<p>Error loading items.</p>';
            if (latestFoundGrid) latestFoundGrid.innerHTML = '<p>Error loading items.</p>';
        }
    };

    // Browse Page Logic (Separate Function)
    const fetchBrowseItems = async () => {
        if (!itemsGrid) return;

        const filterForm = document.getElementById('filter-form');
        const searchInput = document.getElementById('search');
        const typeSelect = document.getElementById('type');
        const categorySelect = document.getElementById('category');

        itemsGrid.innerHTML = '<div class="loading-spinner">Loading items...</div>';

        try {
            // 1. Get Filters from URL
            const urlParams = new URLSearchParams(window.location.search);
            const typeFilter = urlParams.get('type') || 'lost'; // Default to LOST
            const categoryFilter = urlParams.get('category') || 'all';
            const searchFilter = urlParams.get('search') || '';

            // 2. Set Form Values (Sync UI with URL)
            if (typeSelect) typeSelect.value = typeFilter;
            // Handle case where 'found' is selected but not visible/allowed? 
            // For now, keep it simple. If staff uses type=found, let it work.
            // But if regular user lands here, it defaults to lost.

            if (categorySelect) categorySelect.value = categoryFilter;
            if (searchInput) searchInput.value = searchFilter;

            // 3. Build Query
            const q = query(
                collection(db, "items"),
                where("status", "==", "active"),
                orderBy("createdAt", "desc"),
                limit(50)
            );

            const querySnapshot = await getDocs(q);
            let items = [];

            querySnapshot.forEach(doc => {
                items.push({ id: doc.id, ...doc.data() });
            });

            // 4. Apply Filters In-Memory
            if (typeFilter !== 'all') {
                items = items.filter(item => item.type === typeFilter);
            }
            if (categoryFilter !== 'all') {
                items = items.filter(item => item.category === categoryFilter);
            }
            if (searchFilter) {
                const lowerSearch = searchFilter.toLowerCase();
                items = items.filter(item =>
                    item.title.toLowerCase().includes(lowerSearch) ||
                    (item.description && item.description.toLowerCase().includes(lowerSearch)) ||
                    (item.location && item.location.toLowerCase().includes(lowerSearch))
                );
            }

            // Mock DocSnap structure for renderItems
            const mockDocSnaps = items.map(item => ({
                id: item.id,
                data: () => item
            }));
            await renderItems(mockDocSnaps, itemsGrid);

        } catch (error) {
            console.error("Error fetching browse items:", error);
            itemsGrid.innerHTML = '<p>Error loading items.</p>';
        }

        // 5. Handle Filter Form Submit (Update URL)
        if (filterForm) {
            filterForm.onsubmit = (e) => {
                e.preventDefault();
                // Default to 'lost' if element is missing.
                const newType = typeSelect ? typeSelect.value : 'lost';
                const newCategory = categorySelect.value;
                const newSearch = searchInput.value;

                const newUrl = new URL(window.location);
                if (newType !== 'all') newUrl.searchParams.set('type', newType); else newUrl.searchParams.delete('type');
                if (newCategory !== 'all') newUrl.searchParams.set('category', newCategory); else newUrl.searchParams.delete('category');
                if (newSearch) newUrl.searchParams.set('search', newSearch); else newUrl.searchParams.delete('search');

                window.location.href = newUrl.toString();
            };
        }
    };

    if (latestFoundGrid || latestLostGrid) {
        fetchHomePageItems();
    }

    if (itemsGrid) {
        fetchBrowseItems();
    }
}

// Fetch Homepage Stats
const fetchHomeStats = async () => {
    try {
        // Get Total Items Reported
        const itemsSnapshot = await getDocs(collection(db, "items"));
        const totalItems = itemsSnapshot.size;

        // Get Items Returned (Status 'resolved')
        const qResolved = query(collection(db, "items"), where("status", "==", "resolved"));
        const resolvedSnapshot = await getDocs(qResolved);
        const totalResolved = resolvedSnapshot.size;

        // Get Active Students (Users)
        const usersSnapshot = await getDocs(collection(db, "users"));
        const totalUsers = usersSnapshot.size;

        // Create a mapping of stat labels to their new values
        const statMap = {
            "Items Reported": totalItems,
            "Items Returned": totalResolved,
            "Active Students": totalUsers
        };

        // Update DOM
        document.querySelectorAll('.stat-item').forEach(item => {
            const label = item.querySelector('p').textContent.trim();
            const counterElement = item.querySelector('.counter');

            if (statMap[label] !== undefined) {
                const finalValue = statMap[label];
                // Animate the counter
                let start = 0;
                const duration = 2000;
                const startTime = performance.now();

                function update(currentTime) {
                    const elapsed = currentTime - startTime;
                    const progress = Math.min(elapsed / duration, 1);

                    // Ease out quart
                    const ease = 1 - Math.pow(1 - progress, 4);

                    const current = Math.floor(ease * finalValue);
                    counterElement.textContent = current + "+";
                    counterElement.setAttribute('data-target', finalValue);

                    if (progress < 1) {
                        requestAnimationFrame(update);
                    } else {
                        counterElement.textContent = finalValue + "+";
                    }
                }
                requestAnimationFrame(update);
            }
        });

    } catch (error) {
        console.error("Error fetching stats:", error);
    }
};

// Only run on homepage
if (document.querySelector('.stats-section')) {
    fetchHomeStats();
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
                            ${item.status === 'resolved' ? '<span class="item-badge" style="background: var(--success); margin-left: 10px;">RETURNED</span>' : ''}
                        </div>
                        <div style="display: flex; gap: 10px;">
                            ${item.status !== 'resolved' && item.reviewStatus === 'approved' ? `<button class="btn btn-outline mark-resolved-btn" data-id="${doc.id}" style="color: var(--success); border-color: var(--success);">Mark as Returned</button>` : ''}
                            <a href="../item-details.html?id=${doc.id}" class="btn btn-secondary">View</a>
                        </div>
                    `;
                    myPostsList.appendChild(div);
                });

                document.querySelectorAll('.mark-resolved-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.preventDefault();
                        if (confirm("Did you find this item/return it to its owner? This will mark it as returned on the site.")) {
                            try {
                                const itemRef = doc(db, "items", btn.dataset.id);
                                await updateDoc(itemRef, {
                                    status: 'resolved',
                                    resolvedBy: 'owner', // Self-resolution
                                    resolvedAt: serverTimestamp()
                                });
                                alert("Item marked as returned!");
                                window.location.reload();
                            } catch (error) {
                                console.error("Error updating status:", error);
                                alert("Error: " + error.message);
                            }
                        }
                    });
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
                const claimType = item.type === 'found' ? 'ownership_claim' : 'finder_report';
                const buttonText = item.type === 'found' ? 'Claim My Product' : 'I Found This!';

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

                            <button id="claim-btn" class="btn btn-primary">${buttonText}</button>
                        </div>
                    </div>
                `;

                // Handle Claim Button (Initiates Handover Chat)
                const claimBtn = document.getElementById('claim-btn');
                if (claimBtn) {
                    claimBtn.addEventListener('click', async () => {
                        if (!auth.currentUser) {
                            window.location.href = "login.html";
                            return;
                        }
                        // Prevent users from claiming their own items
                        if (auth.currentUser.uid === item.createdBy) {
                            alert("You cannot claim your own item.");
                            return;
                        }

                        // Initiate Chat & Email Flow
                        try {
                            claimBtn.textContent = "Initiating Secure Chat...";
                            claimBtn.disabled = true;

                            // 1. Create a new Chat Session Document
                            const chatRef = await addDoc(collection(db, "chats"), {
                                itemId: docSnap.id,
                                itemTitle: item.title,
                                itemType: item.type, // 'lost' or 'found'
                                userId: auth.currentUser.uid,
                                userName: auth.currentUser.displayName || "Student",
                                staffId: null, // Waits for staff response
                                status: "active",
                                createdAt: serverTimestamp(),
                                updatedAt: serverTimestamp()
                            });

                            // 2. Write to the 'mail' collection to trigger Email Extension
                            await addDoc(collection(db, "mail"), {
                                to: auth.currentUser.email,
                                message: {
                                    subject: "Claim Registered: " + item.title,
                                    html: "<div style='font-family: Arial, sans-serif;'>" +
                                        "<h2>Claim Initiated</h2>" +
                                        "<p>Hello " + (auth.currentUser.displayName || "Student") + ",</p>" +
                                        "<p>You have initiated a claim for <b>" + item.title + "</b>.</p>" +
                                        "<p>A WUB staff member will connect with you shortly to verify your ownership/finding. Please log in to your dashboard to check your Active Chats.</p>" +
                                        "<br><p>Thank you,<br>WUB Lost & Found Security Team</p></div>"
                                }
                            });

                            // 3. Redirect the UI instantly into the newly created Chat interface
                            window.location.href = "user/chat.html?chatId=" + chatRef.id;

                        } catch (error) {
                            console.error("Error initiating handover process:", error);
                            alert("Failed to initiate claim. Please try again.");
                            claimBtn.textContent = buttonText;
                            claimBtn.disabled = false;
                        }
                    });
                }
            } else {
                itemDetailContainer.innerHTML = '<p>Item not found.</p>';
            }
        });
    }
}
