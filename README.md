# 🛒 Shop Here — E-Commerce & Inventory Management System

> A full-stack web application built on **MongoDB Atlas**, **Express.js**, and **Vanilla HTML5/CSS3/JavaScript (ES6+)** with strict **Role-Based Access Control (RBAC)** enforcement at both the database and application layers.

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Architecture](#-architecture)
- [Technology Stack](#-technology-stack)
- [Database Schema Design](#-database-schema-design)
- [User Roles & Access Control](#-user-roles--access-control)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Installation & Setup](#-installation--setup)
- [Running the Application](#-running-the-application)
- [Application Pages](#-application-pages)
- [API Reference](#-api-reference)
- [Schema Validation Rules](#-schema-validation-rules)
- [Atlas Trigger Logic](#-atlas-trigger-logic)
- [Testing & Verification](#-testing--verification)
- [Scripts Reference](#-scripts-reference)

---

## 🎯 Overview

**Shop Here** is a production-grade inventory management and e-commerce system designed to demonstrate:

- **Strict MongoDB `$jsonSchema` Validation** — enforcing data integrity at the database level with regex patterns, enum constraints, numeric minimums, and required field enforcement.
- **Role-Based Access Control (RBAC)** — three distinct permission tiers (Consumer, Staff, Super Admin) controlling both API route access and UI visibility.
- **Atlas Trigger Simulation** — automated stock-level updates and reorder alert generation when supply orders are received.
- **Aggregation Pipelines** — `$lookup` joins, `$group` analytics, and `$unwind` transformations for executive reporting.
- **Index Performance Analysis** — `.explain("executionStats")` introspection on indexed queries with visual output.

The system is purpose-built for **evaluation and grading**, with a dedicated Proof-of-Work panel that allows evaluators to interactively test every feature.

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT (Browser)                        │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Store    │  │  Admin   │  │ Security │  │  Proof   │   │
│  │  .html   │  │  .html   │  │  .html   │  │  .html   │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │              │              │              │         │
│       └──────────────┴──────────────┴──────────────┘         │
│                          │                                   │
│              x-user-role / x-user-name headers               │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    HTTP REST API
                           │
┌──────────────────────────┴──────────────────────────────────┐
│                   EXPRESS.JS SERVER                          │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │    RBAC     │  │  REST API    │  │   Trigger Engine  │  │
│  │  Middleware │──│  Endpoints   │──│  (03_stock_trigger)│  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                   MongoDB Driver
                           │
┌──────────────────────────┴──────────────────────────────────┐
│                  MONGODB ATLAS (ShopHere DB)                │
│                                                             │
│  ┌────────────┐ ┌──────────┐ ┌───────────┐ ┌────────────┐ │
│  │ categories │ │ suppliers│ │ employees │ │   items    │ │
│  └────────────┘ └──────────┘ └───────────┘ └────────────┘ │
│  ┌────────────┐ ┌──────────────┐                           │
│  │   orders   │ │reorderAlerts │ ← Auto-populated          │
│  └────────────┘ └──────────────┘                           │
│                                                             │
│  $jsonSchema Validators · Indexes · Aggregation Pipelines  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠 Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | HTML5, CSS3, JavaScript (ES6+) | Vanilla — no React, Vue, or Angular |
| **Styling** | Custom CSS with CSS Variables | Dark theme, glassmorphism, micro-animations |
| **Typography** | Google Fonts (Inter) | Modern, clean typeface |
| **Backend** | Node.js + Express.js | REST API server with middleware |
| **Database** | MongoDB Atlas | Cloud-hosted NoSQL with `$jsonSchema` validation |
| **Driver** | mongodb (Node.js driver) | Native MongoDB interaction |
| **Auth Sim** | Custom RBAC middleware | Header-based role switching for demonstration |
| **Environment** | dotenv | Environment variable management |

---

## 🗄 Database Schema Design

The **ShopHere** database contains **6 collections**, each with strict `$jsonSchema` validators:

### Collections

| Collection | Documents | Key Validations |
|-----------|-----------|----------------|
| `categories` | 4 | `categoryName` restricted to enum: `Household`, `Sports`, `Accessories`, `Clothing` |
| `suppliers` | 3 | Phone regex: `^[0-9]{2}-[0-9]{3}-[0-9]{4}-[0-9]{3}-[0-9]{3}$` |
| `employees` | 3 | Same phone regex validation + required fields |
| `items` | 5 | `unitPrice >= 0.01` (double), `quantityInHand >= 1` (int), FK refs to categories & suppliers |
| `orders` | 5 | `orderStatus` enum: `InTransit`, `Received`, `Cancelled`. Nullable `receivingDate` & `quantityReceived` |
| `reorderAlerts` | Auto | Generated by trigger when stock ≤ reorder level after order receipt |

### Indexes

```
items:        categoryId ↑, supplierId ↑, itemName (text)
orders:       orderStatus ↑, itemId ↑, employeeId ↑
reorderAlerts: alertDate ↓, resolved ↑
```

### Entity Relationships

```
categories  ←──── items (categoryId)
suppliers   ←──── items (supplierId)
items       ←──── orders (itemId)
employees   ←──── orders (employeeId)
items       ←──── reorderAlerts (itemId)
```

---

## 👥 User Roles & Access Control

### Role Hierarchy

| Role | DB Role | Users | Access Level |
|------|---------|-------|-------------|
| **Super Admin** | `dbOwner` | Iyiola | Full system control — schema, users, backups, exports, audit logs |
| **Staff** | `readWrite` | Tomiwa, Solomon, Samuel | Operational — orders, stock, suppliers, employees, analytics |
| **Consumer** | `readOnly` | Public / Guest | Storefront only — browse items, filter categories, place orders |

### Permission Matrix

| Permission | Consumer | Staff | Super Admin |
|------------|:--------:|:-----:|:-----------:|
| `view_items` | ✅ | ✅ | ✅ |
| `filter_categories` | ✅ | ✅ | ✅ |
| `place_order_request` | ✅ | ✅ | ✅ |
| `create_order` | ❌ | ✅ | ✅ |
| `update_order_status` | ❌ | ✅ | ✅ |
| `update_stock` | ❌ | ✅ | ✅ |
| `view_suppliers` | ❌ | ✅ | ✅ |
| `view_employees` | ❌ | ✅ | ✅ |
| `view_orders` | ❌ | ✅ | ✅ |
| `view_reorder_alerts` | ❌ | ✅ | ✅ |
| `view_analytics` | ❌ | ✅ | ✅ |
| `manage_schema` | ❌ | ❌ | ✅ |
| `manage_users` | ❌ | ❌ | ✅ |
| `run_backup` | ❌ | ❌ | ✅ |
| `run_export` | ❌ | ❌ | ✅ |
| `view_audit_log` | ❌ | ❌ | ✅ |
| `clear_alerts` | ❌ | ❌ | ✅ |
| `configure_storage_alerts` | ❌ | ❌ | ✅ |

### RBAC Enforcement Mechanism

The Express middleware reads role headers from each request:

```
x-user-role: consumer | staff | superadmin
x-user-name: Guest | Tomiwa | Solomon | Samuel | Iyiola
```

The `requirePermission()` middleware checks the role's permission array before allowing route access. Unauthorized requests receive a **403 Forbidden** response with a descriptive error message.

---

## 📁 Project Structure

```
ShopHere_website/
│
├── .env                          # MongoDB Atlas connection URI + config
├── package.json                  # NPM dependencies and scripts
│
├── 01_schema_setup.js            # Creates collections with $jsonSchema validators
├── 02_seed_data.js               # Inserts sample data in dependency order
├── 03_stock_trigger.js           # Atlas Trigger simulation module
├── 04_rbac_setup.js              # RBAC matrix + Atlas shell commands
│
├── server.js                     # Express.js application server
│
└── public/                       # Static frontend files
    ├── store.html                # Consumer storefront
    ├── admin.html                # Staff & Admin dashboard
    ├── admin-security.html       # Super Admin system panel
    └── proof-of-work.html        # Evaluation & testing bench
```

### File Descriptions

| File | Lines | Description |
|------|:-----:|-------------|
| `01_schema_setup.js` | ~185 | Drops and recreates all 6 collections with strict `$jsonSchema` validators. Builds performance indexes on `items`, `orders`, and `reorderAlerts`. |
| `02_seed_data.js` | ~155 | Inserts sample data in strict FK dependency order: categories → suppliers → employees → items → orders. Uses proper BSON types (`Int32`, `Double`, `ObjectId`). |
| `03_stock_trigger.js` | ~60 | Exports `onOrderReceived()` — when an order transitions to `"Received"`, increments item stock and generates a reorder alert if `quantityInHand ≤ reorderLevel`. |
| `04_rbac_setup.js` | ~95 | Exports the RBAC permission matrix consumed by the Express middleware. Also prints `db.createUser()` commands for Atlas shell execution. |
| `server.js` | ~380 | The application core — 25+ REST endpoints, RBAC middleware, aggregation pipelines, proof-of-work validators, and the inline trigger engine. |
| `store.html` | ~340 | Dark-themed consumer storefront with product grid cards, category filter chips, quick-order modal, and toast notifications. |
| `admin.html` | ~420 | Tabbed admin dashboard with 5 panels: Orders (with receive/cancel actions), Inventory (inline stock editing), Reorder Alerts, Supplier/Employee Directory, and Executive Analytics. |
| `admin-security.html` | ~310 | Super Admin panel displaying the full RBAC permission matrix table, backup/export CLI command generators, Atlas storage alert configuration, and security audit log. |
| `proof-of-work.html` | ~470 | Interactive evaluation bench with 4 tabs: Schema Validation Test Bench (8 pre-configured tests), Index Performance Analyzer, Step-by-Step Trigger Demo, and RBAC Permission Testing Grid. |

---

## ⚙ Prerequisites

- **Node.js** v18+ and **npm** v9+
- **MongoDB Atlas** account with a configured cluster
- Atlas cluster **Network Access** allowing your IP (or `0.0.0.0/0` for development)
- A database user with `atlasAdmin` or `readWriteAnyDatabase` privileges

---

## 🚀 Installation & Setup

### 1. Clone / Navigate to the Project

```bash
cd ShopHere_website
```

### 2. Install Dependencies

```bash
npm install
```

Installs: `express`, `mongodb`, `dotenv`, `cors`

### 3. Configure Environment Variables

Edit the `.env` file with your MongoDB Atlas connection string:

```env
MONGODB_URI=mongodb+srv://your_username:your_password@your_cluster.mongodb.net/
DB_NAME=ShopHere
PORT=3000
```

### 4. Initialize the Database

```bash
# Create collections with validators + build indexes
npm run setup

# Seed sample data (4 categories, 3 suppliers, 3 employees, 5 items, 5 orders)
npm run seed
```

Or both at once:

```bash
npm run init-db
```

### 5. (Optional) View RBAC Shell Commands

```bash
npm run rbac
```

Prints the `db.createUser()` commands to create database-level users in the Atlas shell.

---

## ▶ Running the Application

```bash
npm start
```

Output:

```
✅  Connected to MongoDB Atlas — database: ShopHere

🚀  ShopHere server running at http://localhost:3000
   📦  Storefront:      http://localhost:3000/store.html
   🛠  Admin Dashboard:  http://localhost:3000/admin.html
   🔐  Security Panel:   http://localhost:3000/admin-security.html
   🧪  Proof of Work:    http://localhost:3000/proof-of-work.html
```

---

## 📄 Application Pages

### 🛒 Storefront (`/store.html`)

The public-facing product catalog accessible to all roles.

- **Product Grid** — Cards displaying item name, price, stock status, category badge, and supplier
- **Category Filters** — Toggle between All, Household, Sports, Accessories, Clothing
- **Quick Order Modal** — Customers can place purchase orders with name and quantity
- **Role Switcher** — Top-bar toolbar for toggling between all 5 user identities

### 📊 Admin Dashboard (`/admin.html`)

Staff and Admin operational control center with 5 tabbed panels:

- **📦 Orders** — View all orders with status badges. Receive or cancel InTransit orders (triggers stock logic).
- **📋 Inventory** — View stock levels with inline editing. Color-coded health indicators (Healthy/Low/Critical).
- **🔔 Reorder Alerts** — Live feed of alerts generated when stock drops below reorder level.
- **📇 Directory** — Searchable supplier and employee contact tables with phone, email, and address.
- **📈 Analytics** — Summary stat cards + monthly sales breakdown by employee + top suppliers ranking.

> **Access Control**: Consumers see an "Access Denied" screen. Staff and Admin have full access.

### 🔐 Security Panel (`/admin-security.html`)

Iyiola-only system administration panel:

- **RBAC Matrix** — Full permission table showing all 17 permissions across 3 roles
- **Backup Control** — Generates `mongodump` commands with timestamped output paths
- **Daily Export** — Generates `mongoexport` commands for today's orders
- **Storage Alerts** — Displays Atlas cluster storage alert configurations (80% warning, 95% critical)
- **Audit Log** — Chronological security event trail

> **Access Control**: Only accessible when role is set to `superadmin` (Iyiola). Staff and Consumers are blocked.

### 🧪 Proof of Work (`/proof-of-work.html`)

Interactive evaluation and grading panel with 4 test sections:

- **📝 Schema Validation** — 8 pre-configured test buttons attempting valid and invalid inserts against `$jsonSchema` validators. Shows real MongoDB rejection errors in a formatted output box.
- **⚡ Index Performance** — Runs `.explain("executionStats")` on 4 indexed queries showing execution stage, index name, documents examined, and timing.
- **🔔 Trigger Demo** — Step-by-step animated workflow: find InTransit order → receive it → update stock → check reorder threshold → create alert.
- **🔐 RBAC Testing** — 14-card permission grid. Select a role, click any card to see `200 OK` (allowed) or `403 Forbidden` (denied).

---

## 🔌 API Reference

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/items` | List items with `$lookup` joins (category + supplier). Optional `?category=` filter. |
| `GET` | `/api/items/:id` | Get single item by ID |
| `GET` | `/api/categories` | List all categories |
| `POST` | `/api/store/order` | Consumer order request (auto-assigns employee) |
| `GET` | `/api/roles` | View RBAC permission matrix |
| `GET` | `/api/current-role` | View current session role and permissions |

### Staff Endpoints (readWrite)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/orders` | List orders with item + employee joins |
| `POST` | `/api/orders` | Create new supply order |
| `PATCH` | `/api/orders/:id` | Update order status (triggers stock logic on "Received") |
| `PATCH` | `/api/items/:id/stock` | Update item stock quantity |
| `GET` | `/api/suppliers` | List suppliers |
| `GET` | `/api/employees` | List employees |
| `GET` | `/api/reorder-alerts` | List reorder alerts |
| `GET` | `/api/analytics/sales-by-employee` | Monthly sales aggregation |
| `GET` | `/api/analytics/top-suppliers` | Top suppliers by product count |

### Super Admin Endpoints (dbOwner)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/admin/backup` | Generate mongodump backup command |
| `POST` | `/api/admin/export` | Generate mongoexport command for daily orders |
| `GET` | `/api/admin/audit-log` | View security audit trail |
| `GET` | `/api/admin/storage-alerts` | View Atlas storage alert configurations |
| `DELETE` | `/api/reorder-alerts` | Clear all reorder alerts |

### Proof-of-Work Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/proof/validate/:collection` | Test schema validation (insert + cleanup) |
| `POST` | `/api/proof/explain` | Run `.explain("executionStats")` on a query |
| `POST` | `/api/proof/trigger-demo` | Execute trigger workflow demonstration |
| `POST` | `/api/proof/test-permission` | Test role-permission combination |
| `GET` | `/api/proof/validation-rules` | View active `$jsonSchema` rules for all collections |

---

## 📐 Schema Validation Rules

### Categories

```javascript
categoryName: { enum: ["Household", "Sports", "Accessories", "Clothing"] }
```

### Suppliers & Employees — Phone Pattern

```javascript
phone: { pattern: "^[0-9]{2}-[0-9]{3}-[0-9]{4}-[0-9]{3}-[0-9]{3}$" }
// Valid:   23-456-7890-123-456
// Invalid: 08012345678
```

### Items — Numeric Constraints

```javascript
unitPrice:       { bsonType: "double", minimum: 0.01 }
quantityInHand:  { bsonType: "int",    minimum: 1    }
reorderLevel:    { bsonType: "int",    minimum: 1    }
reorderQuantity: { bsonType: "int",    minimum: 1    }
```

### Orders — Status Enum + Nullable Fields

```javascript
orderStatus:      { enum: ["InTransit", "Received", "Cancelled"] }
receivingDate:    { bsonType: ["date", "null"] }   // nullable
quantityReceived: { bsonType: ["int", "null"]  }   // nullable
```

---

## ⚡ Atlas Trigger Logic

The `03_stock_trigger.js` module implements the following automated workflow:

```
Order status → "Received"
       │
       ▼
┌──────────────────────────┐
│ 1. Increment item stock  │
│    quantityInHand += qty │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ 2. Check reorder level   │
│    stock ≤ reorderLevel? │
└──────────┬───────────────┘
           │
      ┌────┴────┐
      │  YES    │  NO
      ▼         ▼
┌───────────┐  (done)
│ 3. Create │
│  reorder  │
│   alert   │
└───────────┘
```

This runs inline on the server whenever `PATCH /api/orders/:id` sets `orderStatus: "Received"`.

---

## 🧪 Testing & Verification

### Quick Verification Checklist

| # | Test | Expected Result |
|---|------|----------------|
| 1 | Insert category `"Electronics"` | ❌ Schema rejection (enum violation) |
| 2 | Insert supplier with phone `"08012345678"` | ❌ Schema rejection (regex violation) |
| 3 | Insert item with `unitPrice: 0.00` | ❌ Schema rejection (minimum violation) |
| 4 | Insert order with status `"Pending"` | ❌ Schema rejection (enum violation) |
| 5 | Insert valid category `"Household"` | ✅ Passes validation |
| 6 | Consumer accesses `/api/suppliers` | ❌ 403 Forbidden |
| 7 | Staff accesses `/api/admin/backup` | ❌ 403 Forbidden |
| 8 | Iyiola accesses `/api/admin/backup` | ✅ 200 OK |
| 9 | Receive an InTransit order | ✅ Stock incremented + potential alert |
| 10 | Run `.explain()` on indexed query | ✅ Shows IXSCAN stage |
| 11 | Non-admin accesses `/api/users` | ❌ 403 Forbidden |
| 12 | Iyiola updates user role / password | ✅ 200 OK — Updated in MongoDB |

---

## 🔐 Credentials & Password Authentication

All user accounts, passwords, SHA-256 hashes, and database permissions are documented in:
👉 [**`ADMIN_CREDENTIALS.md`**](file:///c:/Users/user/Documents/ShopHere_website/ADMIN_CREDENTIALS.md)

| Username | Password | Role | Database Privilege | Primary Authority |
|----------|----------|------|-------------------|-------------------|
| `iyiola` | `Admin@2026` | `superadmin` | `dbOwner` | Full user & password control, schema, backups |
| `tomiwa` | `Staff@2026` | `staff` | `readWrite` | Stock management, orders fulfillment |
| `solomon` | `Staff@2026` | `staff` | `readWrite` | Stock management, orders fulfillment |
| `samuel` | `Staff@2026` | `staff` | `readWrite` | Stock management, orders fulfillment |
| `consumer` | `Shop@2026` | `consumer` | `read` | Catalog discovery & order requests |

---

## 🚀 Hosting on Vercel

The application is structured for instant serverless deployment on **Vercel**:

```bash
# 1. Install Vercel CLI (or connect GitHub repository)
npm install -g vercel

# 2. Login to your Vercel account
vercel login

# 3. Deploy project
vercel

# 4. Add Environment Variables
vercel env add MONGODB_URI
# → Paste: mongodb+srv://pc:laptop@cluster0.utghrsn.mongodb.net/
vercel env add DB_NAME
# → Enter: ShopHere

# 5. Production Release
vercel --prod
```

---

## 📜 Scripts Reference

| Command | Description |
|---------|-------------|
| `npm run setup` | Creates collections with `$jsonSchema` validators and indexes |
| `npm run seed` | Inserts sample data (categories, suppliers, employees, items, orders) |
| `npm run users` | Seeds `users` collection with SHA-256 hashed passwords & roles |
| `npm run init-all` | Runs setup + seed + users in sequence |
| `npm start` | Starts the Express server on port 3000 |
| `npm run dev` | Alias for `npm start` |
| `npm run rbac` | Prints Atlas shell `db.createUser()` commands |

---

## 📝 License

ISC

---

## 👨‍💻 Authors

Built as an academic project demonstrating MongoDB Atlas database architecture, `$jsonSchema` validation, RBAC enforcement, aggregation pipelines, and full-stack web development with vanilla technologies.
