# fshare 🚀

fshare is a self-hosted, encrypted file storage and sharing web application built with **Node.js**, **Express**, **MySQL**, and **vanilla JavaScript**.  
It lets users securely upload, store, share, and manage files through a clean web dashboard, with per-user quotas and server-side encryption support.

---

## Features ✨

- **Secure Authentication** 🔑  — User login with bcrypt password hashing and session IDs.
- **Encrypted File Storage** 🛡  — Files are encrypted server-side using AES-256-GCM before saving.
- **Quota Management** 📏  — Per-user disk space and file count tracking.
- **File Sharing** 📤  — Generate time-limited public share links with expiry options (1h, 1d, 1w, 1m).
- **Revocable Links** ❌  — Revoke shared files anytime.
- **File Manager UI** 🗂  — List, preview, search, and delete uploaded files.
- **Multiple Views** 🖼  — List view and gallery view (with optional grid or fluid layout).
- **Preview Support** 🎥  — Image, video, and audio preview in browser.
- **Drag & Drop Uploads** 📂  — Easy file uploads with progress indication.
- **Hash Comparison Tool** 🔍  — Compare server-stored file hash with local file hash.
- **Responsive Design** 📱  — Mobile and desktop friendly dashboard.

---

## Tech Stack 🛠

### Backend
- [Node.js](https://nodejs.org/)
- [Express](https://expressjs.com/)
- [MySQL2](https://www.npmjs.com/package/mysql2)
- [Multer](https://www.npmjs.com/package/multer) (for file uploads)
- [bcrypt](https://www.npmjs.com/package/bcrypt) (for password hashing)
- [crypto](https://nodejs.org/api/crypto.html) (AES-256-GCM encryption)

### Frontend
- HTML5 / CSS3 (responsive layout)
- Vanilla JavaScript (file manager logic, encryption key handling)
- [CryptoJS](https://cryptojs.gitbook.io/docs/) for cryptographic utilities

---

## Installation ⚙️

### Prerequisites
- Node.js 16+  
- MySQL Server  
- Git  

### Steps
1. **Clone the repository** 📥
   ```bash
   git clone https://github.com/yourusername/fshare.git
   cd fshare
2. **Install dependencies** 📦
   ```bash
   npm install express mysql2 multer bcrypt
3. **Configure MySQL database** 🗄
   ```bash
    CREATE DATABASE fshare_db;
    CREATE USER 'fshare'@'localhost' IDENTIFIED BY 'fshare';
    GRANT ALL PRIVILEGES ON fshare_db.* TO 'fshare'@'localhost';
    FLUSH PRIVILEGES;
  
  Import the tables from the SQL files

4. **Start the server** ▶️
    ```bash
    node server.js
5. Access the dashboard 🌐
Visit: http://localhost:3000/dashboard.html

---

# Usage 📚
### 1. **Login** 🔑

  - Navigate to the login page (not included in the files above, but assumed present).
    
  - Enter your username & password.

### 2. **Upload Files** 📤

  - Select a file or drag-and-drop into the dashboard file manager.

  - Enter your encryption key when prompted (stored locally in localStorage).

### 3. **Manage Files** 🗂

  - Switch between List View and Gallery View.
  
  - Preview images, videos, and audio files directly.

  - Download or delete files.

### 4. **Share Files** 🔗

  - Right-click a file → "Share"
  
  - Select expiration time.
  
  - Copy generated share link.

### 5. **View / Revoke Shared Files** ❌

  - Click Files Shared in the stats panel.
  
  - Use the context menu to revoke links or copy them again.

---

# API Endpoints 📡
## Authentication
  - `POST /api/login` — Authenticate user.

  - `GET /api/auth?sid=SESSION_ID` — Check if session is valid.

  - `GET /api/userdata?sid=SESSION_ID` — Get user details & last login.

## File Management
  - `POST /api/upload` — Upload and encrypt file.

  - `GET /api/files?sid=SESSION_ID` — List uploaded files.

  - `POST /api/deletefile?sid=SESSION_ID&fname=FILENAME` — Delete file.

  - `GET /uploads/:userId/:filename?crypto-key=KEY` — Download & decrypt file.

## Sharing
  - `POST /api/sharefile` — Create share link.

  - `GET /api/usershares` — List user’s active shares.

  - `POST /api/revokeshare` — Revoke a share.

---

# Security Notes 🔒
  - **Encryption Key Handling**: The encryption key is provided by the user and stored in browser localStorage; the server never permanently stores it.

  - **Password Hashing**: All passwords are stored hashed with bcrypt.

  - **Link Expiration**: Shared links are automatically deleted when expired.