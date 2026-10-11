/**
 * api/index.js — Vercel Serverless Entry Point
 * ──────────────────────────────────────────────
 * Wraps the Express app as a Vercel serverless function.
 * All /api/* requests are routed here by vercel.json.
 */
try { require("dotenv").config(); } catch (_) {}
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { MongoClient, ObjectId, Int32, Double } = require("mongodb");
const { translateNaturalLanguageQuery } = require("../ai-query-translator");

const app = express();

/* ── RBAC Config ──────────────────────────────────────── */
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

/* ── Helpers ──────────────────────────────────────────── */
function hashPassword(plain) {
  return crypto.createHash("sha256").update(plain).digest("hex");
}

/* ── Trigger Logic (inline) ───────────────────────────── */
async function onOrderReceived(db, order) {
  const result = { stockUpdated: false, alertCreated: false, alert: null };
  if (order.orderStatus !== "Received") return result;
  const qtyReceived = order.quantityReceived || order.quantityOrdered;
  const updateResult = await db.collection("items").findOneAndUpdate(
    { _id: order.itemId },
    { $inc: { quantityInHand: qtyReceived } },
    { returnDocument: "after" }
  );
  const updatedItem = updateResult.value || updateResult;
  if (!updatedItem) return result;
  result.stockUpdated = true;
  if (updatedItem.quantityInHand <= updatedItem.reorderLevel) {
    const alert = {
      itemId: updatedItem._id,
      itemName: updatedItem.itemName,
      currentStock: updatedItem.quantityInHand,
      reorderLevel: updatedItem.reorderLevel,
      reorderQuantity: updatedItem.reorderQuantity,
      alertDate: new Date(),
      resolved: false
    };
    await db.collection("reorderAlerts").insertOne(alert);
    result.alertCreated = true;
    result.alert = alert;
  }
  return result;
}

/* ── DB Connection (cached for serverless) ────────────── */
let cachedClient = null;
let cachedDb = null;

async function getDb() {
  if (cachedDb) return cachedDb;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "Missing MONGODB_URI environment variable. Please configure MONGODB_URI in your Vercel Project Settings (Settings -> Environment Variables)."
    );
  }

  const dbName = process.env.DB_NAME || "ShopHere";

  if (!cachedClient) {
    cachedClient = new MongoClient(uri);
    await cachedClient.connect();
  }
  cachedDb = cachedClient.db(dbName);
  return cachedDb;
}

/* ── Middleware ────────────────────────────────────────── */
app.use(cors());
app.use(express.json());

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

  // Fallback: header-based (for quick role switcher)
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

/* ══════════════════════════════════════════════════════════
   AUTHENTICATION & SESSION
   ══════════════════════════════════════════════════════════ */
app.post("/api/auth/login", async (req, res) => {
  try {
    const db = await getDb();
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
    const token = crypto.randomBytes(32).toString("hex");
    const expiry = Date.now() + (24 * 60 * 60 * 1000);
    activeSessions.set(token, { user, expiry });
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/auth/logout", (req, res) => {
  const token = req.headers["x-auth-token"];
  if (token) activeSessions.delete(token);
  res.json({ success: true });
});

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

app.get("/api/auth/accounts", async (_req, res) => {
  try {
    const db = await getDb();
    const users = await db.collection("users").find(
      { isActive: true },
      { projection: { password: 0 } }
    ).toArray();
    res.json(users);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════════════════
   USER MANAGEMENT (Iyiola only)
   ══════════════════════════════════════════════════════════ */
app.get("/api/users", requirePermission("manage_users"), async (_req, res) => {
  try {
    const db = await getDb();
    const users = await db.collection("users").find(
      {},
      { projection: { password: 0 } }
    ).toArray();
    res.json(users);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/users/:id/role", requirePermission("manage_users"), async (req, res) => {
  try {
    const db = await getDb();
    const { role } = req.body;
    if (!["superadmin", "staff", "consumer"].includes(role)) {
      return res.status(400).json({ error: "Invalid role. Must be: superadmin, staff, consumer" });
    }
    const dbRoleMap = { superadmin: "dbOwner", staff: "readWrite", consumer: "read" };
    await db.collection("users").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { role, dbRole: dbRoleMap[role] } }
    );
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

app.patch("/api/users/:id/password", requirePermission("manage_users"), async (req, res) => {
  try {
    const db = await getDb();
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    await db.collection("users").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { password: hashPassword(newPassword) } }
    );
    for (const [token, session] of activeSessions) {
      if (session.user._id.toString() === req.params.id) {
        activeSessions.delete(token);
      }
    }
    res.json({ success: true, message: "Password updated successfully" });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.patch("/api/users/:id/status", requirePermission("manage_users"), async (req, res) => {
  try {
    const db = await getDb();
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

app.post("/api/users", requirePermission("manage_users"), async (req, res) => {
  try {
    const db = await getDb();
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

/* ══════════════════════════════════════════════════════════
   DEMO / ONBOARDING TOURS
   ══════════════════════════════════════════════════════════ */
app.get("/api/demo/tour/:role", (req, res) => {
  const role = req.params.role;
  const tours = {
    superadmin: {
      title: "Super Admin Tour — Iyiola",
      subtitle: "Full authority over ShopHere Database & Users",
      steps: [
        {
          id: "welcome",
          title: "Welcome, Iyiola! 👑",
          description: "As Super Admin (dbOwner), you have complete control over the ShopHere system. This tour will walk you through every capability available to you.",
          icon: "🏠"
        },
        {
          id: "user-management",
          title: "User & Role Management",
          description: "Exclusive to Iyiola: View all users, change roles between Super Admin, Staff, and Consumer, reset passwords, deactivate accounts, or add new staff.",
          icon: "👥",
          action: { type: "navigate", target: "/admin-security.html", section: "users" }
        },
        {
          id: "rbac-matrix",
          title: "RBAC Permission Matrix",
          description: "Review system-wide RBAC enforcement across 17 permissions. Verifies exact tier boundaries between dbOwner, readWrite, and read.",
          icon: "🛡",
          action: { type: "navigate", target: "/admin-security.html", section: "rbac" }
        },
        {
          id: "order-management",
          title: "Order Control & Triggers",
          description: "Update order statuses. Marking an order as Received executes the atomic stock increment trigger and evaluates reorder thresholds.",
          icon: "📦",
          action: { type: "navigate", target: "/admin.html", section: "orders" }
        },
        {
          id: "inventory",
          title: "Inventory Oversight",
          description: "Monitor stock quantities across categories. Edit stock directly, identify items under reorder thresholds, and resolve supply alerts.",
          icon: "📋",
          action: { type: "navigate", target: "/admin.html", section: "inventory" }
        },
        {
          id: "backup-export",
          title: "Disaster Recovery & Reporting",
          description: "Trigger full mongodump database archives and generate daily mongoexport JSON exports directly from the security control room.",
          icon: "💾",
          action: { type: "navigate", target: "/admin-security.html", section: "backup" }
        },
        {
          id: "storage-alerts",
          title: "Storage Capacity Thresholds",
          description: "Monitor and configure automated storage alerts at 80% (Warning) and 95% (Critical) capacity to prevent cluster throttling.",
          icon: "📊",
          action: { type: "navigate", target: "/admin-security.html", section: "storage" }
        },
        {
          id: "audit-log",
          title: "Security Audit Trail",
          description: "Inspect chronological audit records detailing admin actions, role mutations, data seeding, and security operations.",
          icon: "📋",
          action: { type: "navigate", target: "/admin-security.html", section: "audit" }
        }
      ]
    },
    staff: {
      title: "Staff Tour — Inventory Manager",
      subtitle: "Operational access for Tomiwa, Solomon & Samuel",
      steps: [
        {
          id: "welcome",
          title: "Welcome to the Team! 👋",
          description: "As an Inventory Manager (readWrite), you oversee day-to-day warehouse operations, purchase orders, and stock levels.",
          icon: "🏠"
        },
        {
          id: "inventory",
          title: "Live Stock Tracking",
          description: "Monitor inventory levels for all items. Edit stock quantities when physical counts are verified. Low-stock badges show items needing attention.",
          icon: "📋",
          action: { type: "navigate", target: "/admin.html", section: "inventory" }
        },
        {
          id: "orders",
          title: "Receiving Shipments",
          description: "Track purchase orders. When supplier deliveries arrive, set status to 'Received' to automatically trigger stock replenishment.",
          icon: "📦",
          action: { type: "navigate", target: "/admin.html", section: "orders" }
        },
        {
          id: "alerts",
          title: "Reorder Alert Feed",
          description: "System notifications alert you immediately when stock falls below reorder level. Review suggested reorder quantities.",
          icon: "🔔",
          action: { type: "navigate", target: "/admin.html", section: "alerts" }
        },
        {
          id: "directory",
          title: "Directory & Contacts",
          description: "Look up verified suppliers and fellow staff contact information for coordination and dispatch.",
          icon: "📇",
          action: { type: "navigate", target: "/admin.html", section: "directory" }
        },
        {
          id: "analytics",
          title: "Performance Analytics",
          description: "View MongoDB aggregation dashboards showing sales by employee and top supplier volume.",
          icon: "📈",
          action: { type: "navigate", target: "/admin.html", section: "analytics" }
        },
        {
          id: "restrictions",
          title: "Security Boundaries ⚠️",
          description: "As Staff, you cannot change user roles, reset passwords, drop collections, modify schemas, or trigger database backups. Those are reserved for Iyiola.",
          icon: "🚫"
        }
      ]
    },
    consumer: {
      title: "Consumer Tour — Public Shopper",
      subtitle: "Product discovery and seamless order placement",
      steps: [
        {
          id: "welcome",
          title: "Welcome to Shop Here! 🛍️",
          description: "Explore our curated catalog across Household, Sports, Accessories, and Clothing categories.",
          icon: "🏠"
        },
        {
          id: "browse",
          title: "Catalog & Stock Indicators",
          description: "Browse products with live pricing and real-time inventory counts directly from MongoDB Atlas.",
          icon: "📦",
          action: { type: "navigate", target: "/store.html" }
        },
        {
          id: "filtering",
          title: "Category Filters & Search",
          description: "Filter instantly by category pills or search terms to find exactly what you need.",
          icon: "🏷️",
          action: { type: "navigate", target: "/store.html" }
        },
        {
          id: "ordering",
          title: "Instant Cart & Checkout",
          description: "Add items to your cart, specify quantities, and place order requests with a single click.",
          icon: "🛒",
          action: { type: "navigate", target: "/store.html" }
        },
        {
          id: "restrictions",
          title: "Role Boundaries ℹ️",
          description: "Consumers have read-only catalog access. Admin dashboards, employee directory, supplier records, and security panels are strictly protected.",
          icon: "🔒"
        }
      ]
    }
  };

  const tour = tours[role];
  if (!tour) return res.status(404).json({ error: `No tour available for role: ${role}` });
  res.json(tour);
});

/* ══════════════════════════════════════════════════════════
   CORE REST API ROUTES
   ══════════════════════════════════════════════════════════ */
app.get("/api/roles", (_req, res) => res.json(ROLE_PERMISSIONS));
app.get("/api/current-role", (req, res) => {
  res.json({ role: req.userRole, userName: req.userName, permissions: req.permissions, label: ROLE_PERMISSIONS[req.userRole]?.label });
});

app.get("/api/categories", async (_req, res) => {
  try { const db = await getDb(); res.json(await db.collection("categories").find().toArray()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/items", async (req, res) => {
  try {
    const db = await getDb();
    const pipeline = [
      { $lookup: { from: "categories", localField: "categoryId", foreignField: "_id", as: "category" } },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "suppliers", localField: "supplierId", foreignField: "_id", as: "supplier" } },
      { $unwind: { path: "$supplier", preserveNullAndEmptyArrays: true } }
    ];
    if (req.query.category) pipeline.push({ $match: { "category.categoryName": req.query.category } });
    res.json(await db.collection("items").aggregate(pipeline).toArray());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/items/:id", async (req, res) => {
  try { const db = await getDb(); const item = await db.collection("items").findOne({ _id: new ObjectId(req.params.id) }); item ? res.json(item) : res.status(404).json({ error: "Not found" }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/items/:id/stock", requirePermission("update_stock"), async (req, res) => {
  try {
    const db = await getDb();
    const { quantityInHand } = req.body;
    await db.collection("items").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { quantityInHand: new Int32(parseInt(quantityInHand)) } }
    );
    const item = await db.collection("items").findOne({ _id: new ObjectId(req.params.id) });
    res.json(item);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get("/api/orders", requirePermission("view_orders"), async (_req, res) => {
  try {
    const db = await getDb();
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

app.post("/api/orders", requirePermission("place_order_request"), async (req, res) => {
  try {
    const db = await getDb();
    const { itemId, quantityOrdered, customerName } = req.body;
    const defaultEmp = await db.collection("employees").findOne();
    const orderDoc = {
      itemId: new ObjectId(itemId),
      employeeId: defaultEmp._id,
      orderDate: new Date(),
      quantityOrdered: new Int32(parseInt(quantityOrdered) || 1),
      orderStatus: "InTransit",
      receivingDate: null,
      quantityReceived: null,
      customerName: customerName || "Online Customer"
    };
    const result = await db.collection("orders").insertOne(orderDoc);
    res.status(201).json({ success: true, orderId: result.insertedId, message: "Order placed successfully (InTransit)" });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.patch("/api/orders/:id/status", requirePermission("update_order_status"), async (req, res) => {
  try {
    const db = await getDb();
    const { orderStatus, quantityReceived } = req.body;
    const updateFields = { orderStatus };
    if (orderStatus === "Received") {
      updateFields.receivingDate = new Date();
      updateFields.quantityReceived = new Int32(parseInt(quantityReceived) || 1);
    }
    const result = await db.collection("orders").findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: updateFields },
      { returnDocument: "after" }
    );
    const updatedOrder = result.value || result;
    if (!updatedOrder) return res.status(404).json({ error: "Order not found" });
    const triggerResult = await onOrderReceived(db, updatedOrder);
    res.json({ success: true, order: updatedOrder, triggerResult });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get("/api/reorder-alerts", requirePermission("view_reorder_alerts"), async (_req, res) => {
  try { const db = await getDb(); res.json(await db.collection("reorderAlerts").find().sort({ alertDate: -1 }).toArray()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/reorder-alerts", requirePermission("clear_alerts"), async (_req, res) => {
  try { const db = await getDb(); const result = await db.collection("reorderAlerts").deleteMany({}); res.json({ success: true, deletedCount: result.deletedCount }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/suppliers", requirePermission("view_suppliers"), async (_req, res) => {
  try { const db = await getDb(); res.json(await db.collection("suppliers").find().toArray()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/employees", requirePermission("view_employees"), async (_req, res) => {
  try { const db = await getDb(); res.json(await db.collection("employees").find().toArray()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════════════════
   ANALYTICS & AGGREGATIONS
   ══════════════════════════════════════════════════════════ */
app.get("/api/analytics/sales-by-employee", requirePermission("view_analytics"), async (_req, res) => {
  try {
    const db = await getDb();
    const pipeline = [
      { $match: { orderStatus: "Received" } },
      { $lookup: { from: "employees", localField: "employeeId", foreignField: "_id", as: "emp" } },
      { $unwind: "$emp" },
      { $lookup: { from: "items", localField: "itemId", foreignField: "_id", as: "item" } },
      { $unwind: "$item" },
      {
        $group: {
          _id: {
            employeeId: "$employeeId",
            employeeName: { $concat: ["$emp.firstName", " ", "$emp.lastName"] },
            month: { $month: "$receivingDate" },
            year: { $year: "$receivingDate" }
          },
          totalOrders: { $sum: 1 },
          totalQuantity: { $sum: "$quantityReceived" },
          totalValue: { $sum: { $multiply: ["$quantityReceived", "$item.unitPrice"] } }
        }
      },
      { $sort: { "_id.year": -1, "_id.month": -1, totalValue: -1 } }
    ];
    res.json(await db.collection("orders").aggregate(pipeline).toArray());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/analytics/top-suppliers", requirePermission("view_analytics"), async (_req, res) => {
  try {
    const db = await getDb();
    const pipeline = [
      { $lookup: { from: "items", localField: "_id", foreignField: "supplierId", as: "suppliedItems" } },
      {
        $project: {
          supplierName: 1,
          phone: 1,
          email: 1,
          itemCount: { $size: "$suppliedItems" },
          totalStock: { $sum: "$suppliedItems.quantityInHand" }
        }
      },
      { $sort: { itemCount: -1 } }
    ];
    res.json(await db.collection("suppliers").aggregate(pipeline).toArray());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/analytics/category-valuation", requirePermission("view_analytics"), async (_req, res) => {
  try {
    const db = await getDb();
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
    const db = await getDb();
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

/* ══════════════════════════════════════════════════════════
   SYSTEM ADMIN & SECURITY (Iyiola only)
   ══════════════════════════════════════════════════════════ */
app.post("/api/admin/backup", requirePermission("run_backup"), (_req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  res.json({
    success: true,
    message: "mongodump command prepared for execution",
    command: `mongodump --uri="${uri}" --db=${dbName} --out="./backups/${timestamp}" --gzip`,
    timestamp
  });
});

app.post("/api/admin/export", requirePermission("run_export"), (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  res.json({
    success: true,
    message: "mongoexport command prepared for execution",
    command: `mongoexport --uri="${uri}" --db=${dbName} --collection=orders --query='{"orderDate":{"$gte":{"$date":"${today}T00:00:00Z"}}}' --out="./exports/orders_${today}.json" --jsonArray`,
    date: today
  });
});

app.get("/api/admin/storage-alerts", requirePermission("configure_storage_alerts"), (_req, res) => {
  res.json({
    alerts: [
      { name: "Atlas Storage Near-Capacity (Warning)", threshold: "80%", condition: "Disk usage >= 80%", action: "Email alert to Iyiola (Super Admin)", status: "Active" },
      { name: "Atlas Storage Critical", threshold: "95%", condition: "Disk usage >= 95%", action: "Email + SMS alert, auto-scale request", status: "Active" }
    ]
  });
});

app.get("/api/admin/audit-log", requirePermission("view_audit_log"), (_req, res) => {
  res.json([
    { action: "SCHEMA_SETUP", user: "Iyiola", detail: "Created 6 collections with $jsonSchema validators and indexes", ts: new Date(Date.now() - 3600000) },
    { action: "DATA_SEED", user: "Iyiola", detail: "Seeded categories, suppliers, employees, items, and orders", ts: new Date(Date.now() - 3500000) },
    { action: "USER_AUTH_INIT", user: "Iyiola", detail: "Configured password-based authentication with SHA-256 hashing", ts: new Date(Date.now() - 3400000) },
    { action: "STORAGE_ALERTS_CONFIG", user: "Iyiola", detail: "Configured 80% and 95% storage near-capacity alert triggers", ts: new Date(Date.now() - 1800000) },
    { action: "SESSION_LOGIN", user: "Iyiola", detail: "Super Admin authenticated via password session", ts: new Date(Date.now() - 600000) }
  ]);
});

/* ══════════════════════════════════════════════════════════
   PROOF OF WORK VERIFICATION
   ══════════════════════════════════════════════════════════ */
app.post("/api/proof/validate-insert/:collection", async (req, res) => {
  try {
    const db = await getDb();
    const col = req.params.collection;
    const doc = req.body;
    if (doc.categoryId && typeof doc.categoryId === "string") doc.categoryId = new ObjectId(doc.categoryId);
    if (doc.supplierId && typeof doc.supplierId === "string") doc.supplierId = new ObjectId(doc.supplierId);
    if (doc.itemId && typeof doc.itemId === "string") doc.itemId = new ObjectId(doc.itemId);
    if (doc.employeeId && typeof doc.employeeId === "string") doc.employeeId = new ObjectId(doc.employeeId);
    if (doc.unitPrice) doc.unitPrice = new Double(parseFloat(doc.unitPrice));
    if (doc.quantityInHand) doc.quantityInHand = new Int32(parseInt(doc.quantityInHand));
    if (doc.reorderLevel) doc.reorderLevel = new Int32(parseInt(doc.reorderLevel));
    if (doc.reorderQuantity) doc.reorderQuantity = new Int32(parseInt(doc.reorderQuantity));
    if (doc.quantityOrdered) doc.quantityOrdered = new Int32(parseInt(doc.quantityOrdered));
    const result = await db.collection(col).insertOne(doc);
    await db.collection(col).deleteOne({ _id: result.insertedId });
    res.json({ success: true, message: `Document passed schema validation on "${col}" (cleaned up)`, insertedId: result.insertedId });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message, codeName: e.codeName || "ValidationError", errInfo: e.errInfo || null, collection: req.params.collection });
  }
});

app.post("/api/proof/explain", async (req, res) => {
  try {
    const db = await getDb();
    const { collection, query } = req.body;
    const explanation = await db.collection(collection || "items").find(query || { categoryId: { $exists: true } }).explain("executionStats");
    res.json(explanation);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/proof/trigger-demo", async (req, res) => {
  try {
    const db = await getDb();
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
    steps.push({ step: 4, description: triggerResult.alertCreated ? "Reorder alert created" : "No reorder alert needed", alertCreated: triggerResult.alertCreated, alert: triggerResult.alert || null });
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
    const db = await getDb();
    const collections = ["categories","suppliers","employees","items","orders","reorderAlerts","users"];
    const rules = {};
    for (const name of collections) {
      const info = await db.listCollections({ name }).toArray();
      rules[name] = info[0]?.options?.validator || null;
    }
    res.json(rules);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── Export for Vercel ────────────────────────────────── */
module.exports = app;
