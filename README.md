# 🏫 University Lost & Found System

A modern, responsive web application designed to help university students, staff, and faculty report and recover lost items efficiently. Built with vanilla JavaScript and Firebase for real-time data management.

![Project Status](https://img.shields.io/badge/status-active-success.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## 🚀 Features

### 🔐 Advanced Authentication
- **Multi-Method Login**: Support for **Email/Password**, **Google Sign-In**, and **Phone Number** authentication.
- **Role-Based Access Control (RBAC)**: Distinct dashboards for **admins**, **staff**, and **students**.
- **Secure Registration**: Form validation with strict password policies and essential user details (Address, City, Zip).

### 📱 User Interface & Experience
- **Responsive Design**: optimized for both desktop and mobile devices.
- **Modern Aesthetics**: Clean UI with Google Fonts (Inter), Font Awesome icons, and smooth transitions.
- **Dynamic Content**: Real-time updates for lost and found items using Firestore.
- **Team Section**: 'Our Team' section featuring member profiles with professional styling and social links.
- **Admin Enhancements**: Improved navigation context and dedicated review pages for administrators.

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3 (Custom Variables & Flexbox/Grid), Vanilla JavaScript (ES6+)
- **Backend**: Google Firebase (Authentication, Firestore Database, Storage)
- **Deployment**: GitHub Pages / Netlify (Ready)

## 📂 Project Structure

```
/
├── assets/
│   ├── css/            # Global styles and variables
│   ├── js/             # Auth logic, database interactions
│   └── images/         # Static assets and uploads
├── admin/              # Admin dashboard & controls
├── staff/              # Staff dashboard
├── user/               # User dashboard
├── index.html          # Landing page
├── login.html          # Login interface
├── register.html       # Registration interface
└── README.md           # Project documentation
```

## ⚡ Getting Started

### Prerequisites
- A Google Firebase account.
- Basic web server (VS Code Live Server recommended).

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/YourUsername/University-Lost-Found.git
    cd University-Lost-Found
    ```

2.  **Configure Firebase**
    - Create a project in [Firebase Console](https://console.firebase.google.com/).
    - Enable **Authentication** (Email, Google, Phone).
    - Create a **Firestore Database** and **Storage**.
    - specific your web app configuration.
    - Update `assets/js/firebase-config.js`:
      ```javascript
      const firebaseConfig = {
          apiKey: "YOUR_API_KEY",
          authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
          projectId: "YOUR_PROJECT_ID",
          // ... other config
      };
      ```

3.  **Run the Application**
    - Open `index.html` with Live Server or open it directly in your browser.

## 🛡️ Security

- **Input Validation**: Client-side validation for all forms.
- **Protected Routes**: Dashboard access is restricted based on user roles stored in Firestore.

## 🤝 Contributing

Contributions are welcome! Please fork the repository and submit a pull request for any enhancements.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---
*Built with ❤️ for University Campus Safety*
