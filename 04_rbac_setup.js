/**
 * 04_rbac_setup.js
 * ──────────────────────────────────────────────────────────────
 * RBAC configuration for the ShopHere system.
 *
 * NOTE: Creating actual MongoDB database users requires the
 * Atlas Admin API or `db.createUser()` run by an admin user.
 * This script outputs the Atlas CLI / shell commands AND
 * exports the RBAC matrix used by the Express middleware.
 * ──────────────────────────────────────────────────────────────
 */

/*  ═══════════════════════════════════════════════════════════
    A. RBAC MATRIX (used by server.js middleware)
    ═══════════════════════════════════════════════════════════ */
const ROLES = {
  consumer: {
    label: "Consumer (Public)",
    dbRole: "readOnly",
    permissions: [
      "view_items",
      "filter_categories",
      "place_order_request"
    ]
  },
  staff: {
    label: "Staff / Inventory Manager",
    dbRole: "readWrite",
    users: ["Tomiwa", "Solomon", "Samuel"],
    permissions: [
      "view_items",
      "filter_categories",
      "place_order_request",
      "create_order",
      "update_order_status",
      "update_stock",
      "view_suppliers",
      "view_employees",
      "view_orders",
      "view_reorder_alerts",
      "view_analytics"
    ]
  },
  superadmin: {
    label: "Super Admin (Iyiola)",
    dbRole: "dbOwner",
    users: ["Iyiola"],
    permissions: [
      "view_items",
      "filter_categories",
      "place_order_request",
      "create_order",
      "update_order_status",
      "update_stock",
      "view_suppliers",
      "view_employees",
      "view_orders",
      "view_reorder_alerts",
      "view_analytics",
      "manage_schema",
      "manage_users",
      "run_backup",
      "run_export",
      "view_audit_log",
      "clear_alerts",
      "configure_storage_alerts"
    ]
  }
};

/*  ═══════════════════════════════════════════════════════════
    B. Atlas Shell Commands (for reference / manual execution)
    ═══════════════════════════════════════════════════════════ */
function printAtlasCommands() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║   MongoDB Atlas / Shell — RBAC User Creation Commands       ║
╚══════════════════════════════════════════════════════════════╝

Run these in mongosh connected as an admin to the ShopHere DB:

// 1. Super Admin — Iyiola (dbOwner)
db.createUser({
  user: "Iyiola",
  pwd: "SuperAdmin@ShopHere2026",
  roles: [{ role: "dbOwner", db: "ShopHere" }]
});

// 2. Staff — Tomiwa (readWrite)
db.createUser({
  user: "Tomiwa",
  pwd: "Staff_Tomiwa@2026",
  roles: [{ role: "readWrite", db: "ShopHere" }]
});

// 3. Staff — Solomon (readWrite)
db.createUser({
  user: "Solomon",
  pwd: "Staff_Solomon@2026",
  roles: [{ role: "readWrite", db: "ShopHere" }]
});

// 4. Staff — Samuel (readWrite)
db.createUser({
  user: "Samuel",
  pwd: "Staff_Samuel@2026",
  roles: [{ role: "readWrite", db: "ShopHere" }]
});

// 5. Consumer (read-only, used by public storefront)
db.createUser({
  user: "Consumer",
  pwd: "PublicRead@2026",
  roles: [{ role: "read", db: "ShopHere" }]
});
`);
}

/* If run directly, print the commands */
if (require.main === module) {
  printAtlasCommands();
  console.log("\n📋  RBAC Matrix exported for middleware use.");
  console.log(JSON.stringify(ROLES, null, 2));
}

module.exports = { ROLES, printAtlasCommands };
