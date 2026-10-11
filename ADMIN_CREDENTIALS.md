# 🔐 ShopHere — Database Credentials & RBAC Security Document

> **Confidential System Document**  
> Complete record of default user accounts, credentials, database privileges, and user management controls for the **Shop Here E-Commerce & Inventory Management System**.

---

## 👥 Default Accounts & Credentials

The system implements a dual-layer security model:
1. **Application-Layer RBAC**: User accounts stored in the MongoDB Atlas `users` collection with SHA-256 hashed passwords and active session tokens.
2. **Database-Layer RBAC**: Corresponding MongoDB native user roles configured via `db.createUser()`.

| Username | Display Name | Plain Password | SHA-256 Hashed Password | App Role | MongoDB DB Role | Access Scope |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `iyiola` | **Iyiola** | `Admin@2026` | `371c6dc0082729227181c0bc5c3ce8ba5c4e9ff76f1c429c9ef4c348f98c9287` | `superadmin` | `dbOwner` | **Full Authority**: User & role management, password resets, schema validator management, triggers, full `mongodump` backups, `mongoexport` reporting, storage alerts, and audit logs. |
| `tomiwa` | **Tomiwa** | `Staff@2026` | `e9d8926d24a87a2a0ce123f13904944fa9df8e59ec11497a7bb6f7881e18641b` | `staff` | `readWrite` | **Operations**: Inventory tracking, stock updates, incoming order status updates, reorder alert monitoring, directory view, monthly sales aggregations. |
| `solomon` | **Solomon** | `Staff@2026` | `e9d8926d24a87a2a0ce123f13904944fa9df8e59ec11497a7bb6f7881e18641b` | `staff` | `readWrite` | **Operations**: Inventory tracking, stock updates, incoming order status updates, reorder alert monitoring, directory view, monthly sales aggregations. |
| `samuel` | **Samuel** | `Staff@2026` | `e9d8926d24a87a2a0ce123f13904944fa9df8e59ec11497a7bb6f7881e18641b` | `staff` | `readWrite` | **Operations**: Inventory tracking, stock updates, incoming order status updates, reorder alert monitoring, directory view, monthly sales aggregations. |
| `consumer` | **Guest Shopper** | `Shop@2026` | `7be9ba28227ce74a589e525be91542f1cf1d2d506d888f72782b6dc7c2d1b71d` | `consumer` | `read` | **Public Shopper**: Browse catalog, filter categories, simulate order submissions. Denied access to admin panels and internal records. |

---

## 👑 Iyiola — Super Admin Authority & User Management

**Iyiola** is the sole user granted the `superadmin` application role and `dbOwner` database privilege. Only Iyiola has authorization to access the User Management Suite on the Security Panel (`/admin-security.html`).

### Exclusive Administrative Capabilities:
1. **Change & Update User Roles**:
   - Promote staff or consumers to `superadmin`
   - Reassign staff members between roles (`superadmin`, `staff`, `consumer`)
   - Dynamically updates the user's `dbRole` (`dbOwner`, `readWrite`, `read`) in MongoDB
   - Automatically invalidates active sessions to enforce immediate privilege transition
2. **Reset & Update User Passwords**:
   - Reset any employee or consumer password
   - Validates minimum length (6+ characters)
   - Automatically hashes the new password with SHA-256 before persisting to MongoDB Atlas
   - Immediately terminates existing sessions for that user to require re-authentication
3. **Provision New Database Accounts**:
   - Add new employees or administrative hires with custom usernames, passwords, emails, and roles
4. **Account Suspension & Activation**:
   - Toggle account `isActive` flag (`true`/`false`) to instantly lock out compromised or former staff accounts
5. **System-Level Operations**:
   - Trigger full `mongodump` backups to `./backups/`
   - Trigger daily order `mongoexport` snapshots
   - Configure Atlas storage capacity alerts (80% warning, 95% critical)
   - Clear system-wide reorder alerts
   - Inspect live security audit log

---

## 🛡️ Role-Based Permission Matrix

| Feature / Action | API Endpoint | Consumer (`read`) | Staff (`readWrite`) | Super Admin (`dbOwner`) |
| :--- | :--- | :---: | :---: | :---: |
| **Browse Catalog Items** | `GET /api/items` | ✅ Yes | ✅ Yes | ✅ Yes |
| **Filter by Category** | `GET /api/categories` | ✅ Yes | ✅ Yes | ✅ Yes |
| **Submit Order Request** | `POST /api/orders` | ✅ Yes | ✅ Yes | ✅ Yes |
| **View All Orders** | `GET /api/orders` | ❌ 403 | ✅ Yes | ✅ Yes |
| **Update Order Status** | `PATCH /api/orders/:id/status` | ❌ 403 | ✅ Yes | ✅ Yes |
| **Edit Item Stock Quantity** | `PATCH /api/items/:id/stock` | ❌ 403 | ✅ Yes | ✅ Yes |
| **View Suppliers Directory** | `GET /api/suppliers` | ❌ 403 | ✅ Yes | ✅ Yes |
| **View Employees Directory** | `GET /api/employees` | ❌ 403 | ✅ Yes | ✅ Yes |
| **View Reorder Alerts** | `GET /api/reorder-alerts` | ❌ 403 | ✅ Yes | ✅ Yes |
| **View Sales Analytics** | `GET /api/analytics/*` | ❌ 403 | ✅ Yes | ✅ Yes |
| **View User Accounts** | `GET /api/users` | ❌ 403 | ❌ 403 | ✅ **Iyiola Only** |
| **Change User Roles** | `PATCH /api/users/:id/role` | ❌ 403 | ❌ 403 | ✅ **Iyiola Only** |
| **Reset User Passwords** | `PATCH /api/users/:id/password` | ❌ 403 | ❌ 403 | ✅ **Iyiola Only** |
| **Create New User** | `POST /api/users` | ❌ 403 | ❌ 403 | ✅ **Iyiola Only** |
| **Toggle User Status** | `PATCH /api/users/:id/status` | ❌ 403 | ❌ 403 | ✅ **Iyiola Only** |
| **Trigger mongodump Backup**| `POST /api/admin/backup` | ❌ 403 | ❌ 403 | ✅ **Iyiola Only** |
| **Trigger mongoexport** | `POST /api/admin/export` | ❌ 403 | ❌ 403 | ✅ **Iyiola Only** |
| **Configure Storage Alerts**| `POST /api/admin/storage-alerts` | ❌ 403 | ❌ 403 | ✅ **Iyiola Only** |
| **Clear All Alerts** | `DELETE /api/reorder-alerts` | ❌ 403 | ❌ 403 | ✅ **Iyiola Only** |

---

## 🔌 API Reference for Password Auth & User Management

### 1. Authenticate with Password
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "iyiola",
  "password": "Admin@2026"
}
```
**Response (200 OK):**
```json
{
  "success": true,
  "token": "a1b2c3d4e5f6...",
  "user": {
    "_id": "660c1...",
    "username": "iyiola",
    "displayName": "Iyiola",
    "role": "superadmin",
    "dbRole": "dbOwner",
    "email": "iyiola@shophere.com"
  },
  "permissions": ["view_items", "manage_users", "run_backup", "..."]
}
```

### 2. Update a User's Role (Iyiola Only)
```http
PATCH /api/users/:id/role
Content-Type: application/json
x-auth-token: <iyiola_token> (or x-user-role: superadmin)

{
  "role": "superadmin"
}
```

### 3. Reset a User's Password (Iyiola Only)
```http
PATCH /api/users/:id/password
Content-Type: application/json
x-auth-token: <iyiola_token> (or x-user-role: superadmin)

{
  "newPassword": "NewStaffPassword@2026"
}
```

---

## 🗄️ MongoDB Atlas User Creation Commands (mongosh)

To verify or recreate the native database users directly in MongoDB Atlas:

```javascript
// Connect to the ShopHere database
use ShopHere

// 1. Super Admin — Iyiola (dbOwner)
db.createUser({
  user: "iyiola",
  pwd: "Admin@2026",
  roles: [
    { role: "dbOwner", db: "ShopHere" }
  ]
})

// 2. Staff — Tomiwa (readWrite)
db.createUser({
  user: "tomiwa",
  pwd: "Staff@2026",
  roles: [
    { role: "readWrite", db: "ShopHere" }
  ]
})

// 3. Staff — Solomon (readWrite)
db.createUser({
  user: "solomon",
  pwd: "Staff@2026",
  roles: [
    { role: "readWrite", db: "ShopHere" }
  ]
})

// 4. Staff — Samuel (readWrite)
db.createUser({
  user: "samuel",
  pwd: "Staff@2026",
  roles: [
    { role: "readWrite", db: "ShopHere" }
  ]
})

// 5. Consumer — Public Shopper (read)
db.createUser({
  user: "consumer",
  pwd: "Shop@2026",
  roles: [
    { role: "read", db: "ShopHere" }
  ]
})
```

---

## 💻 On-Demand mongosh Query Dispatcher (Admin UI)

The Admin Operations Desk (`/admin.html`) includes a dedicated **mongosh Query Dispatcher** under the **`💻 mongosh Query Studio`** tab. It allows authorized users to generate and execute queries on demand categorized by requesting persona:

1. **Store Manager Inquiries**:
   - Category Inventory Asset Valuation in Naira (`₦`)
   - Staff Fulfilled Sales Revenue Breakdown (`$group`)
   - High-Value Catalog Assets (`unitPrice >= 100`)
   - Supplier Inventory & Item Share
2. **Warehouse Supervisor Inquiries**:
   - Safety Stock Replenishment List (`quantityInHand <= reorderLevel`)
   - In-Transit Shipment Intake Checklist
   - Out-of-Stock Items Audit (`quantityInHand <= 0`)
   - Active Automated Reorder Trigger Queue
3. **Database Admin (DBA) Inquiries**:
   - System Users & Role Clearances Audit
   - Index Execution Plan & Query Performance (`.explain("executionStats")`)
   - Orders Document Count Diagnostic
   - Orders Status & Schema Field Verification
4. **Ad-Hoc / Custom Query Inquiries**:
   - Interactive MQL builder for any collection, filter, projection, and limit.

Results can be viewed on demand in both **Formatted Data Table** and **Raw JSON**, with 1-click export to **CSV** or **JSON**.
