# OmniStock

> Enterprise Inventory & Supply Chain Management System

OmniStock is a full-stack inventory and supply chain management platform built to streamline stock tracking, procurement, sales operations, and organizational workflows. The system provides secure multi-role access, real-time inventory monitoring, and centralized business management through a scalable DBMS architecture.

---

## 📌 Features

### 🔐 Authentication & Access Control
- Role-Based Access Control (RBAC)
- Secure login system
- Password recovery using secure keys
- Account activation/deactivation by Admin

### 📦 Inventory Management
- Real-time stock tracking
- Automatic low-stock and out-of-stock alerts
- Product category organization
- Inventory valuation tracking

### 🏢 Supplier Management
- Supplier database management
- Procurement history tracking
- Vendor contact management

### 💸 Sales Management
- Fast billing workflow
- Automatic inventory deduction
- Sales history tracking
- Revenue calculations

### 🛒 Procurement Management
- Purchase order logging
- Automatic stock updates
- Dynamic unit price adjustments

### 📊 Analytics & Reporting
- Monthly sales summaries
- Revenue analytics
- Product movement tracking
- Staff-linked audit logs

---

# 🏗 System Architecture

OmniStock follows a standard:

Frontend → Backend → Database

### Frontend
- HTML5
- CSS3
- JavaScript
- Bootstrap 5

### Backend
- Node.js
- Express.js

### Database
- MySQL
- Relational Schema
- SQL Views
- Foreign Key Constraints

---

# 🗄 Database Design

The database is designed using **Third Normal Form (3NF)** principles to ensure:
- Reduced redundancy
- Data consistency
- Optimized query performance

### Key Database Features
- Foreign Key Constraints
- `ON DELETE RESTRICT`
- SQL Views for reporting
- Transaction-safe operations

### Example Views
- `vw_SalesSummary`
- `vw_PurchaseDetails`

---

# 🛠 Tech Stack

| Category | Technology |
|----------|------------|
| Frontend | HTML5, CSS3, JavaScript |
| Styling | Bootstrap 5 |
| Backend | Node.js, Express.js |
| Database | MySQL |
| API Communication | Fetch API |

---

# 📂 Project Structure

```bash
OmniStock/
│
├── frontend/
│   ├── admin/
│   ├── manager/
│   ├── sales/
│   ├── purchase/
│   ├── assets/
│   ├── css/
│   ├── js/
│   └── login_page.html
│
├── backend/
│   ├── server.js
│   ├── routes/
│   ├── controllers/
│   ├── middleware/
│   └── config/
│
├── database/
│   └── OmniStock.sql
│
├── screenshots/
│
├── README.md
├── package.json
└── .gitignore
```

---

# ⚙️ Installation & Setup

## 1️⃣ Clone Repository

```bash
git clone https://github.com/your-username/omnistock.git
cd omnistock
```

---

## 2️⃣ Configure Database

Import the SQL file into MySQL:

```sql
SOURCE path/to/OmniStock.sql;
```

---

## 3️⃣ Install Dependencies

```bash
npm install express mysql2 cors
```

---

## 4️⃣ Configure MySQL Credentials

Update your `server.js`:

```javascript
const db = mysql.createConnection({
  host: "localhost",
  user: "YOUR_USERNAME",
  password: "YOUR_PASSWORD",
  database: "omnistock"
});
```

---

## 5️⃣ Run Server

```bash
node server.js
```

---

## 6️⃣ Launch Application

Open:

```bash
login_page.html
```

in your browser.

---

# 🎨 Design Philosophy

OmniStock follows a clean and professional dashboard-oriented UI approach.

### Design Goals
- Minimal visual clutter
- Responsive layouts
- Fast workflow navigation
- Role-specific interfaces
- Professional enterprise appearance

### Typography
- Outfit
- Space Grotesk

---

# 🔮 Future Enhancements

- Barcode Scanner Integration
- AI-Based Demand Prediction
- Multi-Warehouse Support
- Invoice PDF Generation
- Cloud Deployment
- Real-Time Notifications
- Mobile App Version

---

# 🤝 Contributors

- TRG — Project Developer

---

# 🛡 License

This project is licensed under the MIT License.

Feel free to use, modify, and distribute this project for educational and portfolio purposes.
