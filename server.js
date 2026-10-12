/**
 * server.js
 * ══════════════════════════════════════════════════════════════
 * ShopHere — Express.js Application Server (v2)
 *
 * Features:
 *   • Password-based authentication with users collection
 *   • Session-based RBAC middleware
 *   • User management (Iyiola only)
 *   • REST API for all collections
 *   • Analytics aggregation pipelines
 *   • Proof-of-work endpoints
 *   • Inline trigger simulation
 *   • Demo/onboarding tour data
 * ══════════════════════════════════════════════════════════════
 */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const { MongoClient, ObjectId, Int32, Double } = require("mongodb");
const { onOrderReceived } = require("./03_stock_trigger");
const { translateNaturalLanguageQuery } = require("./ai-query-translator");

const app = express();
const PORT = process.env.PORT || 3000;
const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || "ShopHere";

/* ── Global DB handle ─────────────────────────────────────── */
let db;

/* ── RBAC Permissions Map ─────────────────────────────────── */
const ROLE_PERMISSIONS = {
  consumer: {
    label: "Consumer (Public)",
    dbRole: "read",
    permissions: ["view_items", "filter_categories", "place_order_request"]
  },
  staff: {
    label: "Staff / Inventory Manager",
    dbRole: "readWrite",
    permissions: [
      "view_items", "filter_categories", "place_order_request",
      "create_order", "update_order_status", "update_stock",
      "view_suppliers", "view_employees", "view_orders",
      "view_reorder_alerts", "view_analytics"
    ]
  },
  superadmin: {
    label: "Super Admin (Iyiola)",
    dbRole: "dbOwner",
    permissions: [
      "view_items", "filter_categories", "place_order_request",
      "create_order", "update_order_status", "update_stock",
      "view_suppliers", "view_employees", "view_orders",
      "view_reorder_alerts", "view_analytics",
      "manage_schema", "manage_users", "run_backup", "run_export",
      "view_audit_log", "clear_alerts", "configure_storage_alerts"
    ]
  }
};

/* ── Helpers ───────────────────────────────────────────────── */
function hashPassword(plain) {
  return crypto.createHash("sha256").update(plain).digest("hex");
}

/* ── Middleware ────────────────────────────────────────────── */
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ══════════════════════════════════════════════════════════════
   RBAC MIDDLEWARE
   ══════════════════════════════════════════════════════════════
   Supports two modes:
   1. Session token via x-auth-token header (password-based login)
   2. Fallback to x-user-role / x-user-name headers (demo/quick-switch)
   ────────────────────────────────────────────────────────────── */
const activeSessions = new Map(); // token -> { user, expiry }

function extractRole(req, _res, next) {
  const authHeader = req.headers["authorization"];
  const bearerToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const token = req.headers["x-auth-token"] || bearerToken;

  if (token && activeSessions.has(token)) {
    const session = activeSessions.get(token);
    if (session.expiry > Date.now()) {
      req.userRole = session.user.role;
      req.userName = session.user.displayName;
      req.userId = session.user._id;
      req.permissions = ROLE_PERMISSIONS[session.user.role]?.permissions || ROLE_PERMISSIONS.consumer.permissions;
      next();
      return;
    } else {
      activeSessions.delete(token);
    }
  }

  // Fallback: header-based (for demo role switcher)
  const role = (req.headers["x-user-role"] || "consumer").toLowerCase();
  const name = req.headers["x-user-name"] || "Guest";
  req.userRole = ROLE_PERMISSIONS[role] ? role : "consumer";
  req.userName = name;
  req.permissions = ROLE_PERMISSIONS[req.userRole]?.permissions || ROLE_PERMISSIONS.consumer.permissions;
  next();
}
app.use(extractRole);

function requirePermission(...perms) {
  return (req, res, next) => {
    for (const p of perms) {
      if (!req.permissions.includes(p)) {
        return res.status(403).json({
          error: "Forbidden",
          message: `Role "${req.userRole}" (${req.userName}) lacks permission: ${p}`,
          requiredPermission: p,
          currentRole: req.userRole
        });
      }
    }
    next();
  };
}

/* ══════════════════════════════════════════════════════════════
   AUTHENTICATION ENDPOINTS
   ══════════════════════════════════════════════════════════════ */

/* Login */
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const user = await db.collection("users").findOne({
      username: username.toLowerCase(),
      isActive: true
    });

    if (!user || user.password !== hashPassword(password)) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // Generate session token
    const token = crypto.randomBytes(32).toString("hex");
    const expiry = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

    activeSessions.set(token, { user, expiry });

    // Update last login
    await db.collection("users").updateOne(
      { _id: user._id },
      { $set: { lastLogin: new Date() } }
    );

    const { password: _, ...safeUser } = user;
    res.json({
      success: true,
      token,
      user: safeUser,
      permissions: ROLE_PERMISSIONS[user.role]?.permissions || []
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* Logout */
app.post("/api/auth/logout", (req, res) => {
  const token = req.headers["x-auth-token"];
  if (token) activeSessions.delete(token);
  res.json({ success: true });
});

/* Get current session */
app.get("/api/auth/me", (req, res) => {
  const token = req.headers["x-auth-token"];
  if (token && activeSessions.has(token)) {
    const session = activeSessions.get(token);
    const { password: _, ...safeUser } = session.user;
    return res.json({
      authenticated: true,
      user: safeUser,
      role: session.user.role,
      permissions: ROLE_PERMISSIONS[session.user.role]?.permissions || []
    });
  }
  res.json({
    authenticated: false,
    role: req.userRole,
    userName: req.userName,
    permissions: req.permissions
  });
});

/* List all user accounts (for quick-login UI) — public, no passwords */
app.get("/api/auth/accounts", async (_req, res) => {
  try {
    const users = await db.collection("users").find(
      { isActive: true },
      { projection: { password: 0 } }
    ).toArray();
    res.json(users);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════════════════════
   USER MANAGEMENT (Iyiola only)
   ══════════════════════════════════════════════════════════════ */

/* Get all users */
app.get("/api/users", requirePermission("manage_users"), async (_req, res) => {
  try {
    const users = await db.collection("users").find(
      {},
      { projection: { password: 0 } }
    ).toArray();
    res.json(users);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Update user role */
app.patch("/api/users/:id/role", requirePermission("manage_users"), async (req, res) => {
  try {
    const { role } = req.body;
    if (!["superadmin", "staff", "consumer"].includes(role)) {
      return res.status(400).json({ error: "Invalid role. Must be: superadmin, staff, consumer" });
    }
    const dbRoleMap = { superadmin: "dbOwner", staff: "readWrite", consumer: "read" };
    await db.collection("users").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { role, dbRole: dbRoleMap[role] } }
    );
    // Invalidate any active sessions for this user
    for (const [token, session] of activeSessions) {
      if (session.user._id.toString() === req.params.id) {
        activeSessions.delete(token);
      }
    }
    const updated = await db.collection("users").findOne(
      { _id: new ObjectId(req.params.id) },
      { projection: { password: 0 } }
    );
    res.json({ success: true, user: updated });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/* Reset user password */
app.patch("/api/users/:id/password", requirePermission("manage_users"), async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    await db.collection("users").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { password: hashPassword(newPassword) } }
    );
    // Invalidate sessions
    for (const [token, session] of activeSessions) {
      if (session.user._id.toString() === req.params.id) {
        activeSessions.delete(token);
      }
    }
    res.json({ success: true, message: "Password updated" });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/* Toggle user active status */
app.patch("/api/users/:id/status", requirePermission("manage_users"), async (req, res) => {
  try {
    const { isActive } = req.body;
    await db.collection("users").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { isActive: !!isActive } }
    );
    const updated = await db.collection("users").findOne(
      { _id: new ObjectId(req.params.id) },
      { projection: { password: 0 } }
    );
    res.json({ success: true, user: updated });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/* Create new user */
app.post("/api/users", requirePermission("manage_users"), async (req, res) => {
  try {
    const { username, password, displayName, role, email } = req.body;
    if (!username || !password || !displayName || !role) {
      return res.status(400).json({ error: "All fields required: username, password, displayName, role" });
    }
    const dbRoleMap = { superadmin: "dbOwner", staff: "readWrite", consumer: "read" };
    const doc = {
      username: username.toLowerCase(),
      password: hashPassword(password),
      displayName,
      role,
      dbRole: dbRoleMap[role] || "read",
      email: email || "",
      isActive: true,
      createdAt: new Date(),
      lastLogin: null
    };
    const result = await db.collection("users").insertOne(doc);
    const { password: _, ...safeDoc } = doc;
    res.status(201).json({ success: true, user: { _id: result.insertedId, ...safeDoc } });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: "Username already exists" });
    res.status(400).json({ error: e.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   DEMO / ONBOARDING TOUR DATA
   ══════════════════════════════════════════════════════════════ */
app.get("/api/demo/tour/:role", (req, res) => {
  const role = req.params.role;

  const tours = {
    superadmin: {
      title: "Super Admin Tour — Iyiola",
      subtitle: "Full system control over ShopHere",
      steps: [
        {
          id: "welcome",
          title: "Welcome, Iyiola! 👑",
          description: "As Super Admin (dbOwner), you have complete control over the ShopHere system. This tour will walk you through every capability available to you.",
          icon: "🏠",
          action: null
        },
        {
          id: "user-management",
          title: "User & Role Management",
          description: "Create new user accounts, change roles (consumer → staff → admin), reset passwords, and deactivate accounts. Only you can access this.",
          icon: "👥",
          action: { type: "navigate", target: "/admin-security.html", section: "users" }
        },
        {
          id: "rbac-matrix",
          title: "RBAC Permission Matrix",
          description: "View the complete 17-permission matrix across all 3 roles. See exactly what each role can and cannot do in the system.",
          icon: "🛡",
          action: { type: "navigate", target: "/admin-security.html", section: "rbac" }
        },
        {
          id: "order-management",
          title: "Order Control Center",
          description: "View all orders, update status (InTransit → Received → Cancelled). When you mark an order as Received, the system automatically updates stock levels.",
          icon: "📦",
          action: { type: "navigate", target: "/admin.html", section: "orders" }
        },
        {
          id: "inventory",
          title: "Inventory Management",
          description: "Monitor stock levels across all items. Directly edit quantities. Items below reorder level are flagged as Critical.",
          icon: "📋",
          action: { type: "navigate", target: "/admin.html", section: "inventory" }
        },
        {
          id: "reorder-alerts",
          title: "Reorder Alert System",
          description: "View automated alerts generated when stock drops below reorder level. Only you can clear all alerts system-wide.",
          icon: "🔔",
          action: { type: "navigate", target: "/admin.html", section: "alerts" }
        },
        {
          id: "analytics",
          title: "Executive Analytics",
          description: "View monthly sales aggregations per employee, total inventory value, and top supplier rankings — powered by MongoDB aggregation pipelines.",
          icon: "📈",
          action: { type: "navigate", target: "/admin.html", section: "analytics" }
        },
        {
          id: "backup-export",
          title: "Backup & Export Control",
          description: "Trigger full database backups (mongodump) and daily order exports (mongoexport). These commands are prepared for server-side execution.",
          icon: "💾",
          action: { type: "navigate", target: "/admin-security.html", section: "backup" }
        },
        {
          id: "storage-alerts",
          title: "Atlas Storage Monitoring",
          description: "Configure near-capacity alerts (80% warning, 95% critical) that send notifications to your email when cluster storage is running low.",
          icon: "📊",
          action: { type: "navigate", target: "/admin-security.html", section: "storage" }
        },
        {
          id: "audit-log",
          title: "Security Audit Trail",
          description: "View a chronological log of all system-level actions: schema changes, data seeding, index creation, and RBAC configuration events.",
          icon: "📋",
          action: { type: "navigate", target: "/admin-security.html", section: "audit" }
        },
        {
          id: "schema-validation",
          title: "Schema Validation Testing",
          description: "The Proof of Work panel lets you test $jsonSchema validators live — attempt invalid inserts and see MongoDB rejection errors in real time.",
          icon: "🧪",
          action: { type: "navigate", target: "/proof-of-work.html", section: "schema" }
        }
      ]
    },
    staff: {
      title: "Staff Tour — Inventory Manager",
      subtitle: "Operational access to orders, inventory & analytics",
      steps: [
        {
          id: "welcome",
          title: "Welcome to the Team! 👋",
          description: "As an Inventory Manager (readWrite), you have operational access to manage orders, track stock, and view analytics. Let's explore what you can do.",
          icon: "🏠",
          action: null
        },
        {
          id: "storefront",
          title: "Customer Storefront",
          description: "This is what your customers see — a product catalog with category filters and ordering. You can browse it too!",
          icon: "🛒",
          action: { type: "navigate", target: "/store.html" }
        },
        {
          id: "order-management",
          title: "Managing Orders",
          description: "Your primary task: view incoming supply orders, mark them as Received when goods arrive, or Cancel if needed. Receiving triggers automatic stock updates.",
          icon: "📦",
          action: { type: "navigate", target: "/admin.html", section: "orders" }
        },
        {
          id: "inventory",
          title: "Stock Level Monitoring",
          description: "Track current stock for every item. You can directly edit stock quantities. Watch for Critical items that need reordering.",
          icon: "📋",
          action: { type: "navigate", target: "/admin.html", section: "inventory" }
        },
        {
          id: "reorder-alerts",
          title: "Reorder Alerts",
          description: "When you receive an order and stock is still below the reorder level, the system automatically creates an alert here. Stay on top of low-stock items.",
          icon: "🔔",
          action: { type: "navigate", target: "/admin.html", section: "alerts" }
        },
        {
          id: "directory",
          title: "Supplier & Employee Directory",
          description: "Access contact information for all suppliers and fellow employees. Useful for coordinating reorders and shipments.",
          icon: "📇",
          action: { type: "navigate", target: "/admin.html", section: "directory" }
        },
        {
          id: "analytics",
          title: "Performance Analytics",
          description: "View your monthly sales performance alongside your colleagues. See total orders processed, items received, and revenue generated.",
          icon: "📈",
          action: { type: "navigate", target: "/admin.html", section: "analytics" }
        },
        {
          id: "restrictions",
          title: "What You Can't Do ⚠️",
          description: "You cannot: run backups/exports, manage user accounts, modify database schemas, or configure storage alerts. These are reserved for the Super Admin (Iyiola).",
          icon: "🚫",
          action: null
        }
      ]
    },
    consumer: {
      title: "Consumer Tour — Shopper",
      subtitle: "Browse products and place orders",
      steps: [
        {
          id: "welcome",
          title: "Welcome to Shop Here! 🛍",
          description: "As a shopper, you can browse our premium catalog, filter by category, and place orders. Let's show you around.",
          icon: "🏠",
          action: null
        },
        {
          id: "browse",
          title: "Browse Products",
          description: "Our storefront displays all available products with prices, stock levels, and supplier information in a beautiful card grid.",
          icon: "📦",
          action: { type: "navigate", target: "/store.html" }
        },
        {
          id: "filter",
          title: "Filter by Category",
          description: "Use the filter chips to narrow down products: Household, Sports, Accessories, or Clothing. Click 'All Products' to see everything.",
          icon: "🏷",
          action: { type: "highlight", target: "#filter-bar" }
        },
        {
          id: "order",
          title: "Place an Order",
          description: "Click 'Order Now' on any product to open the order modal. Enter your name and quantity — your order will be submitted as InTransit.",
          icon: "🛒",
          action: { type: "highlight", target: ".btn-order" }
        },
        {
          id: "restrictions",
          title: "Your Access Level",
          description: "As a consumer, you can view products and place orders. You cannot access the Admin Dashboard, manage inventory, or view internal data like supplier contacts or employee info.",
          icon: "ℹ️",
          action: null
        }
      ]
    }
  };

  const tour = tours[role];
  if (!tour) return res.status(404).json({ error: `No tour available for role: ${role}` });
  res.json(tour);
});

/* ══════════════════════════════════════════════════════════════
   ROLE INFO
   ══════════════════════════════════════════════════════════════ */
app.get("/api/roles", (_req, res) => res.json(ROLE_PERMISSIONS));

app.get("/api/current-role", (req, res) => {
  res.json({
    role: req.userRole,
    userName: req.userName,
    permissions: req.permissions,
    label: ROLE_PERMISSIONS[req.userRole]?.label
  });
});

/* ══════════════════════════════════════════════════════════════
   CATEGORIES
   ══════════════════════════════════════════════════════════════ */
app.get("/api/categories", async (_req, res) => {
  try {
    const docs = await db.collection("categories").find().toArray();
    res.json(docs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════════════════════
   ITEMS
   ══════════════════════════════════════════════════════════════ */
app.get("/api/items", async (req, res) => {
  try {
    const pipeline = [
      { $lookup: { from: "categories", localField: "categoryId", foreignField: "_id", as: "category" } },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "suppliers", localField: "supplierId", foreignField: "_id", as: "supplier" } },
      { $unwind: { path: "$supplier", preserveNullAndEmptyArrays: true } }
    ];
    if (req.query.category) {
      pipeline.push({ $match: { "category.categoryName": req.query.category } });
    }
    const items = await db.collection("items").aggregate(pipeline).toArray();
    res.json(items);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/items/:id", async (req, res) => {
  try {
    const item = await db.collection("items").findOne({ _id: new ObjectId(req.params.id) });
    if (!item) return res.status(404).json({ error: "Item not found" });
    res.json(item);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/items/:id/stock", requirePermission("update_stock"), async (req, res) => {
  try {
    const { quantityInHand } = req.body;
    await db.collection("items").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { quantityInHand: new Int32(parseInt(quantityInHand)) } }
    );
    const item = await db.collection("items").findOne({ _id: new ObjectId(req.params.id) });
    res.json(item);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════════════════════
   SUPPLIERS
   ══════════════════════════════════════════════════════════════ */
app.get("/api/suppliers", requirePermission("view_suppliers"), async (_req, res) => {
  try { res.json(await db.collection("suppliers").find().toArray()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════════════════════
   EMPLOYEES
   ══════════════════════════════════════════════════════════════ */
app.get("/api/employees", requirePermission("view_employees"), async (_req, res) => {
  try { res.json(await db.collection("employees").find().toArray()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════════════════════
   ORDERS
   ══════════════════════════════════════════════════════════════ */
app.get("/api/orders", requirePermission("view_orders"), async (_req, res) => {
  try {
    const pipeline = [
      { $lookup: { from: "items", localField: "itemId", foreignField: "_id", as: "item" } },
      { $unwind: { path: "$item", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "employees", localField: "employeeId", foreignField: "_id", as: "employee" } },
      { $unwind: { path: "$employee", preserveNullAndEmptyArrays: true } },
      { $sort: { orderDate: -1 } }
    ];
    res.json(await db.collection("orders").aggregate(pipeline).toArray());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/orders", requirePermission("create_order"), async (req, res) => {
  try {
    const { itemId, quantityOrdered, employeeId } = req.body;
    const doc = {
      itemId: new ObjectId(itemId),
      quantityOrdered: new Int32(parseInt(quantityOrdered)),
      orderDate: new Date(),
      orderStatus: "InTransit",
      receivingDate: null,
      quantityReceived: null,
      employeeId: new ObjectId(employeeId)
    };
    const result = await db.collection("orders").insertOne(doc);
    res.status(201).json({ insertedId: result.insertedId, ...doc });
  } catch (e) { res.status(400).json({ error: e.message, codeName: e.codeName }); }
});

app.patch("/api/orders/:id", requirePermission("update_order_status"), async (req, res) => {
  try {
    const { orderStatus, quantityReceived } = req.body;
    const update = { $set: { orderStatus } };
    if (orderStatus === "Received") {
      update.$set.receivingDate = new Date();
      if (quantityReceived != null) update.$set.quantityReceived = new Int32(parseInt(quantityReceived));
    }
    await db.collection("orders").updateOne({ _id: new ObjectId(req.params.id) }, update);
    const order = await db.collection("orders").findOne({ _id: new ObjectId(req.params.id) });
    let triggerResult = {};
    if (orderStatus === "Received") triggerResult = await onOrderReceived(db, order);
    res.json({ order, triggerResult });
  } catch (e) { res.status(400).json({ error: e.message, codeName: e.codeName }); }
});

/* Consumer order */
app.post("/api/store/order", async (req, res) => {
  try {
    const { itemId, quantity, customerName } = req.body;
    const defaultEmployee = await db.collection("employees").findOne();
    const doc = {
      itemId: new ObjectId(itemId),
      quantityOrdered: new Int32(parseInt(quantity) || 1),
      orderDate: new Date(),
      orderStatus: "InTransit",
      receivingDate: null,
      quantityReceived: null,
      employeeId: defaultEmployee._id,
      customerNote: customerName || "Walk-in Customer"
    };
    const result = await db.collection("orders").insertOne(doc);
    res.status(201).json({ success: true, orderId: result.insertedId });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════════════════════
   REORDER ALERTS
   ══════════════════════════════════════════════════════════════ */
app.get("/api/reorder-alerts", requirePermission("view_reorder_alerts"), async (_req, res) => {
  try { res.json(await db.collection("reorderAlerts").find().sort({ alertDate: -1 }).toArray()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/reorder-alerts", requirePermission("clear_alerts"), async (_req, res) => {
  try { const r = await db.collection("reorderAlerts").deleteMany({}); res.json({ deletedCount: r.deletedCount }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════════════════════
   ANALYTICS
   ══════════════════════════════════════════════════════════════ */
app.get("/api/analytics/sales-by-employee", requirePermission("view_analytics"), async (_req, res) => {
  try {
    const pipeline = [
      { $match: { orderStatus: "Received" } },
      { $lookup: { from: "employees", localField: "employeeId", foreignField: "_id", as: "employee" } },
      { $unwind: "$employee" },
      { $lookup: { from: "items", localField: "itemId", foreignField: "_id", as: "item" } },
      { $unwind: "$item" },
      {
        $group: {
          _id: {
            employeeId: "$employeeId",
            employeeName: { $concat: ["$employee.firstName", " ", "$employee.lastName"] },
            month: { $month: "$orderDate" },
            year: { $year: "$orderDate" }
          },
          totalOrders: { $sum: 1 },
          totalQuantity: { $sum: "$quantityReceived" },
          totalValue: { $sum: { $multiply: ["$quantityReceived", "$item.unitPrice"] } }
        }
      },
      { $sort: { "_id.year": -1, "_id.month": -1 } }
    ];
    res.json(await db.collection("orders").aggregate(pipeline).toArray());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/analytics/top-suppliers", requirePermission("view_analytics"), async (_req, res) => {
  try {
    const pipeline = [
      { $lookup: { from: "items", localField: "_id", foreignField: "supplierId", as: "suppliedItems" } },
      { $project: { supplierName: 1, phone: 1, email: 1, itemCount: { $size: "$suppliedItems" }, totalStock: { $sum: "$suppliedItems.quantityInHand" } } },
      { $sort: { itemCount: -1 } }
    ];
    res.json(await db.collection("suppliers").aggregate(pipeline).toArray());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/analytics/category-valuation", requirePermission("view_analytics"), async (_req, res) => {
  try {
    const pipeline = [
      { $lookup: { from: "categories", localField: "categoryId", foreignField: "_id", as: "category" } },
      { $unwind: "$category" },
      {
        $group: {
          _id: "$category.categoryName",
          itemCount: { $sum: 1 },
          totalStock: { $sum: "$quantityInHand" },
          totalValuation: { $sum: { $multiply: ["$quantityInHand", "$unitPrice"] } }
        }
      },
      { $sort: { totalValuation: -1 } }
    ];
    res.json(await db.collection("items").aggregate(pipeline).toArray());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/query/run", requirePermission("view_analytics"), async (req, res) => {
  const startTime = Date.now();
  try {
    const { collection, operation = "find", filter = {}, pipeline = [], sort = {}, limit = 50, projection = {} } = req.body;
    if (!collection) return res.status(400).json({ error: "Collection name is required." });

    const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 100);
    const col = db.collection(collection);
    let results = [];

    if (operation === "aggregate") {
      results = await col.aggregate(Array.isArray(pipeline) ? pipeline : []).limit(safeLimit).toArray();
    } else if (operation === "count") {
      const count = await col.countDocuments(filter || {});
      results = [{ count, collection, filter }];
    } else if (operation === "explain") {
      const explainData = await col.find(filter || {}).explain("executionStats");
      results = [explainData];
    } else {
      results = await col.find(filter || {}).project(projection || {}).sort(sort || {}).limit(safeLimit).toArray();
    }

    const executionTimeMs = Date.now() - startTime;
    res.json({
      success: true,
      collection,
      operation,
      count: results.length,
      executionTimeMs,
      timestamp: new Date(),
      results
    });
  } catch (e) {
    res.status(500).json({ error: e.message, executionTimeMs: Date.now() - startTime });
  }
});

app.post("/api/query/ai-translate", requirePermission("view_analytics"), async (req, res) => {
  try {
    const { prompt, forceEngine, timeoutMs, customEndpoint, model } = req.body;
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "Please provide a valid natural language prompt." });
    }

    const result = await translateNaturalLanguageQuery(prompt, { forceEngine, timeoutMs, customEndpoint, model });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   SUPER ADMIN ENDPOINTS
   ══════════════════════════════════════════════════════════════ */
app.post("/api/admin/backup", requirePermission("run_backup"), async (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  res.json({ success: true, message: "Backup command prepared (execute manually on server)", command: `mongodump --uri="${uri}" --db=${dbName} --out=./backups/backup_${timestamp}`, timestamp: new Date() });
});

app.post("/api/admin/export", requirePermission("run_export"), async (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  res.json({ success: true, message: "Export command prepared", command: `mongoexport --uri="${uri}" --db=${dbName} --collection=orders --out=./exports/daily_orders_${timestamp}.json`, timestamp: new Date() });
});

app.get("/api/admin/audit-log", requirePermission("view_audit_log"), async (_req, res) => {
  res.json([
    { ts: new Date(), action: "SCHEMA_VALIDATED", user: "Iyiola", detail: "All 7 collection schemas verified (incl. users)" },
    { ts: new Date(Date.now() - 3600000), action: "SEED_DATA", user: "Iyiola", detail: "Initial data seeded: 4 categories, 3 suppliers, 3 employees, 5 items, 5 orders, 5 users" },
    { ts: new Date(Date.now() - 7200000), action: "INDEX_CREATED", user: "Iyiola", detail: "Performance indexes built on items, orders, reorderAlerts, users" },
    { ts: new Date(Date.now() - 10800000), action: "RBAC_CONFIGURED", user: "Iyiola", detail: "Password-based auth configured with SHA-256 hashing" },
    { ts: new Date(Date.now() - 14400000), action: "USER_CREATED", user: "Iyiola", detail: "Created accounts: iyiola (dbOwner), tomiwa, solomon, samuel (readWrite), consumer (read)" }
  ]);
});

app.get("/api/admin/storage-alerts", requirePermission("configure_storage_alerts"), async (_req, res) => {
  res.json({ alerts: [
    { name: "Near-Capacity Warning", condition: "Storage usage > 80%", action: "Email notification to Iyiola", status: "Active", threshold: "80%" },
    { name: "Critical Storage Alert", condition: "Storage usage > 95%", action: "SMS + Email to Iyiola + auto-scale trigger", status: "Active", threshold: "95%" }
  ]});
});

/* ══════════════════════════════════════════════════════════════
   PROOF-OF-WORK ENDPOINTS
   ══════════════════════════════════════════════════════════════ */
app.post("/api/proof/validate/:collection", async (req, res) => {
  try {
    const col = req.params.collection;
    const validCollections = ["categories","suppliers","employees","items","orders"];
    if (!validCollections.includes(col)) return res.status(400).json({ error: `Invalid collection: ${col}` });
    let doc = req.body;
    if (col === "items" && doc.unitPrice !== undefined) doc.unitPrice = new Double(parseFloat(doc.unitPrice));
    if (col === "items") {
      if (doc.quantityInHand !== undefined) doc.quantityInHand = new Int32(parseInt(doc.quantityInHand));
      if (doc.reorderLevel !== undefined) doc.reorderLevel = new Int32(parseInt(doc.reorderLevel));
      if (doc.reorderQuantity !== undefined) doc.reorderQuantity = new Int32(parseInt(doc.reorderQuantity));
      if (doc.categoryId) doc.categoryId = new ObjectId(doc.categoryId);
      if (doc.supplierId) doc.supplierId = new ObjectId(doc.supplierId);
    }
    if (col === "orders") {
      if (doc.itemId) doc.itemId = new ObjectId(doc.itemId);
      if (doc.employeeId) doc.employeeId = new ObjectId(doc.employeeId);
      if (doc.quantityOrdered !== undefined) doc.quantityOrdered = new Int32(parseInt(doc.quantityOrdered));
      if (doc.orderDate) doc.orderDate = new Date(doc.orderDate);
    }
    const result = await db.collection(col).insertOne(doc);
    await db.collection(col).deleteOne({ _id: result.insertedId });
    res.json({ success: true, message: `Document passed schema validation on "${col}" (cleaned up)`, insertedId: result.insertedId });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message, codeName: e.codeName || "ValidationError", errInfo: e.errInfo || null, collection: req.params.collection });
  }
});

app.post("/api/proof/explain", async (req, res) => {
  try {
    const { collection, query } = req.body;
    const explanation = await db.collection(collection || "items").find(query || { categoryId: { $exists: true } }).explain("executionStats");
    res.json(explanation);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/proof/trigger-demo", async (req, res) => {
  try {
    const steps = [];
    const order = await db.collection("orders").findOne({ orderStatus: "InTransit" });
    if (!order) return res.status(404).json({ error: "No InTransit orders found. Re-seed data." });
    const itemBefore = await db.collection("items").findOne({ _id: order.itemId });
    steps.push({ step: 1, description: "Found InTransit order", orderId: order._id, itemName: itemBefore?.itemName, currentStock: itemBefore?.quantityInHand, reorderLevel: itemBefore?.reorderLevel });
    const qtyReceived = order.quantityOrdered;
    await db.collection("orders").updateOne({ _id: order._id }, { $set: { orderStatus: "Received", receivingDate: new Date(), quantityReceived: qtyReceived } });
    steps.push({ step: 2, description: "Updated order status to Received", quantityReceived: qtyReceived });
    const updatedOrder = await db.collection("orders").findOne({ _id: order._id });
    const triggerResult = await onOrderReceived(db, updatedOrder);
    const itemAfter = await db.collection("items").findOne({ _id: order.itemId });
    steps.push({ step: 3, description: "Trigger executed: stock updated", stockBefore: itemBefore?.quantityInHand, stockAfter: itemAfter?.quantityInHand, stockUpdated: triggerResult.stockUpdated });
    steps.push({ step: 4, description: triggerResult.alertCreated ? "Reorder alert created (stock ≤ reorder level)" : "No reorder alert needed (stock > reorder level)", alertCreated: triggerResult.alertCreated, alert: triggerResult.alert || null });
    res.json({ success: true, steps });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/proof/test-permission", (req, res) => {
  const { testRole, testPermission } = req.body;
  const role = ROLE_PERMISSIONS[testRole];
  if (!role) return res.status(400).json({ error: `Unknown role: ${testRole}` });
  const allowed = role.permissions.includes(testPermission);
  res.json({ role: testRole, label: role.label, permission: testPermission, allowed, status: allowed ? "200 OK — Allowed" : "403 Forbidden — Denied" });
});

app.get("/api/proof/validation-rules", async (_req, res) => {
  try {
    const collections = ["categories","suppliers","employees","items","orders","reorderAlerts","users"];
    const rules = {};
    for (const name of collections) { const info = await db.listCollections({ name }).toArray(); rules[name] = info[0]?.options?.validator || null; }
    res.json(rules);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════════════════════
   FALLBACK
   ══════════════════════════════════════════════════════════════ */
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/ADMIN_CREDENTIALS.md", (_req, res) => res.sendFile(path.join(__dirname, "ADMIN_CREDENTIALS.md")));
app.get("/README.md", (_req, res) => res.sendFile(path.join(__dirname, "README.md")));

/* ══════════════════════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════════════════════ */
async function boot() {
  try {
    const client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);
    console.log("✅  Connected to MongoDB Atlas — database:", dbName);

    app.listen(PORT, () => {
      console.log(`\n🚀  ShopHere server running at http://localhost:${PORT}`);
      console.log(`   🏠  Master Portal:    http://localhost:${PORT}/`);
      console.log(`   📦  Storefront:       http://localhost:${PORT}/store.html`);
      console.log(`   🛠  Admin Dashboard:   http://localhost:${PORT}/admin.html`);
      console.log(`   🔐  Security Panel:    http://localhost:${PORT}/admin-security.html`);
      console.log(`   🧪  Proof of Work:     http://localhost:${PORT}/proof-of-work.html\n`);
    });
  } catch (err) {
    console.error("❌  Failed to start server:", err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  boot();
}
module.exports = app;
