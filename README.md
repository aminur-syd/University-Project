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

## Deployment

This project can be deployed on Firebase Hosting or any static hosting provider. Ensure the Firebase configuration points to the correct project.

## Contributors

- [Sunjida Sabbir Moon](https://github.com/sunjedam00n)
- [Susmita Dhar Priya](https://github.com/Priya-Dhar10)
