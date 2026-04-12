# University Lost & Found System

Web-based Lost & Found platform for a university campus. Users can post lost/found items, browse listings, and submit claims. Admin and staff dashboards support moderation and review.

## Features

- Authentication: register, login, email verification, password reset
- Item posts: create/browse item listings with details and images
- Claims workflow: submit and review ownership claims
- Role-based dashboards: admin, staff, and end-user views

## Tech Stack

- Frontend: HTML/CSS/JavaScript (static pages)
- Backend services: Firebase (Authentication, Firestore, Storage)
- Rules: Firestore and Storage security rules included

## Project Structure

- `index.html`, `browse.html`, `item-details.html`: public pages
- `user/`: end-user pages (dashboard, my posts, my claims, chat)
- `staff/`: staff review pages
- `admin/`: admin dashboard and management pages
- `assets/js/`: client-side logic (auth, posts, claims, chat, admin/staff)
- `assets/css/`: styles
- `firestore.rules`, `storage.rules`: Firebase security rules

## Code Organization for Presentation

- `*.html` files are page entrypoints only. They contain page structure and references to external assets.
- `assets/css/` contains styling only. Shared styles live in `style.css` and dashboard layout lives in `dashboard.css`, with extra page-specific CSS files where needed.
- `assets/js/` contains behavior only. Authentication, page loading, dashboard logic, posts, claims, chats, and admin/staff actions are all handled from external JavaScript modules.
- This separation keeps HTML, CSS, and JavaScript independent so the project is easier to review and explain in class without changing how the website works.

## Run Locally

Because this is a static frontend, you can serve it with any local HTTP server.

Option A (Python):

```bash
cd /var/www/mylostandfound
python3 -m http.server 8080
```

Then open `http://localhost:8080/`.

## Firebase Setup

1. Create a Firebase project.
2. Enable:
	- Authentication: Email/Password
	- Firestore Database
	- Storage
3. Update your Firebase web app config in `assets/js/firebase-config.js`.
4. Deploy rules:
	- Firestore rules: `firestore.rules`
	- Storage rules: `storage.rules`

## Manual Firebase Console Steps

1. Enable the Authentication providers used by this site:
	- Email/Password
	- Google
	- Phone
2. Enable Firestore Database.
	- Missing this breaks browsing, item details, moderation, claims, chats, comments, and admin audit logs.
3. Enable Firebase Storage.
	- Missing this breaks item image uploads.
4. Deploy `firestore.rules`.
	- Missing this can block public approved-item browsing, comments, moderation, chats, claims, or admin audit log access.
5. Deploy `storage.rules`.
	- Missing this can block or overexpose image uploads.
6. Create the Firestore composite indexes required by the current repository queries:
	- `items`: `type ASC, status ASC, reviewStatus ASC, createdAt DESC`
	- `items`: `status ASC, reviewStatus ASC, createdAt DESC`
	- `items`: `createdBy ASC, createdAt DESC`
	- `items/{itemId}/comments`: `status ASC, createdAt DESC`
	- `claims`: `claimerUid ASC, createdAt DESC`
	- `chats`: `userId ASC, status ASC, updatedAt DESC`
	- `chats`: `status ASC, createdAt DESC`
	- Missing indexes cause the affected list or dashboard query to fail with a Firestore index error.
7. Install and configure the Firebase Trigger Email extension if you use the `mail` collection for notification emails.
	- Without it, chat and claim actions still work, but notification emails will not send.

## Deployment

This project can be deployed on Firebase Hosting or any static hosting provider. Ensure the Firebase configuration points to the correct project.

## Contributors

- [Sunjida Sabbir Moon](https://github.com/sunjedam00n)
- [Susmita Dhar Priya](https://github.com/Priya-Dhar10)
