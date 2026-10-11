/**
 * 01_schema_setup.js
 * ──────────────────────────────────────────────────────────────
 * Database initialisation script for the ShopHere E-Commerce &
 * Inventory Management System.
 *
 * Creates 6 collections with strict $jsonSchema validators:
 *   1. categories
 *   2. suppliers
 *   3. employees
 *   4. items
 *   5. orders
 *   6. reorderAlerts
 *
 * Also builds performance indexes on frequently queried fields.
 * ──────────────────────────────────────────────────────────────
 */
require("dotenv").config();
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || "ShopHere";

async function main() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log("✅  Connected to MongoDB Atlas");

    const db = client.db(dbName);

    /* ── Helper: drop if exists then create ────────────────── */
    async function recreate(name, opts) {
      const cols = await db.listCollections({ name }).toArray();
      if (cols.length) await db.dropCollection(name);
      await db.createCollection(name, opts);
      console.log(`   ✔ Created collection: ${name}`);
    }

    /* ═════════════════════════════════════════════════════════
       1. categories
       ═════════════════════════════════════════════════════════ */
    await recreate("categories", {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["categoryName"],
          properties: {
            categoryName: {
              bsonType: "string",
              enum: ["Household", "Sports", "Accessories", "Clothing"],
              description: "Must be one of Household, Sports, Accessories, Clothing"
            }
          }
        }
      },
      validationLevel: "strict",
      validationAction: "error"
    });

    /* ═════════════════════════════════════════════════════════
       2. suppliers
       ═════════════════════════════════════════════════════════ */
    await recreate("suppliers", {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["supplierName", "phone", "email"],
          properties: {
            supplierName: {
              bsonType: "string",
              description: "Supplier company name"
            },
            phone: {
              bsonType: "string",
              pattern: "^[0-9]{2}-[0-9]{3}-[0-9]{4}-[0-9]{3}-[0-9]{3}$",
              description: "Phone must match XX-XXX-XXXX-XXX-XXX"
            },
            email: {
              bsonType: "string",
              description: "Supplier email address"
            },
            address: {
              bsonType: "string",
              description: "Supplier physical address"
            }
          }
        }
      },
      validationLevel: "strict",
      validationAction: "error"
    });

    /* ═════════════════════════════════════════════════════════
       3. employees
       ═════════════════════════════════════════════════════════ */
    await recreate("employees", {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["firstName", "lastName", "phone", "role"],
          properties: {
            firstName: { bsonType: "string" },
            lastName: { bsonType: "string" },
            phone: {
              bsonType: "string",
              pattern: "^[0-9]{2}-[0-9]{3}-[0-9]{4}-[0-9]{3}-[0-9]{3}$",
              description: "Phone must match XX-XXX-XXXX-XXX-XXX"
            },
            email: { bsonType: "string" },
            role: {
              bsonType: "string",
              description: "Employee role / title"
            },
            hireDate: { bsonType: "date" }
          }
        }
      },
      validationLevel: "strict",
      validationAction: "error"
    });

    /* ═════════════════════════════════════════════════════════
       4. items
       ═════════════════════════════════════════════════════════ */
    await recreate("items", {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: [
            "itemName",
            "unitPrice",
            "quantityInHand",
            "reorderLevel",
            "reorderQuantity",
            "categoryId",
            "supplierId"
          ],
          properties: {
            itemName: { bsonType: "string" },
            unitPrice: {
              bsonType: "double",
              minimum: 0.01,
              description: "Unit price must be >= 0.01"
            },
            quantityInHand: {
              bsonType: "int",
              minimum: 1,
              description: "Stock quantity must be >= 1"
            },
            reorderLevel: {
              bsonType: "int",
              minimum: 1,
              description: "Reorder level must be >= 1"
            },
            reorderQuantity: {
              bsonType: "int",
              minimum: 1,
              description: "Reorder quantity must be >= 1"
            },
            categoryId: {
              bsonType: "objectId",
              description: "FK → categories._id"
            },
            supplierId: {
              bsonType: "objectId",
              description: "FK → suppliers._id"
            }
          }
        }
      },
      validationLevel: "strict",
      validationAction: "error"
    });

    /* ═════════════════════════════════════════════════════════
       5. orders
       ═════════════════════════════════════════════════════════ */
    await recreate("orders", {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: [
            "itemId",
            "quantityOrdered",
            "orderDate",
            "orderStatus",
            "employeeId"
          ],
          properties: {
            itemId: { bsonType: "objectId", description: "FK → items._id" },
            quantityOrdered: { bsonType: "int", minimum: 1 },
            orderDate: { bsonType: "date" },
            orderStatus: {
              bsonType: "string",
              enum: ["InTransit", "Received", "Cancelled"],
              description: "Must be InTransit | Received | Cancelled"
            },
            receivingDate: {
              bsonType: ["date", "null"],
              description: "Nullable — set when received"
            },
            quantityReceived: {
              bsonType: ["int", "null"],
              description: "Nullable — set when received"
            },
            employeeId: {
              bsonType: "objectId",
              description: "FK → employees._id"
            }
          }
        }
      },
      validationLevel: "strict",
      validationAction: "error"
    });

    /* ═════════════════════════════════════════════════════════
       6. reorderAlerts
       ═════════════════════════════════════════════════════════ */
    await recreate("reorderAlerts", {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["itemId", "itemName", "currentStock", "reorderLevel", "reorderQuantity", "alertDate"],
          properties: {
            itemId: { bsonType: "objectId" },
            itemName: { bsonType: "string" },
            currentStock: { bsonType: "int" },
            reorderLevel: { bsonType: "int" },
            reorderQuantity: { bsonType: "int" },
            alertDate: { bsonType: "date" },
            resolved: { bsonType: "bool" }
          }
        }
      },
      validationLevel: "strict",
      validationAction: "error"
    });

    /* ═══════════════════════════════════════════════════════════
       INDEXES
       ═══════════════════════════════════════════════════════════ */
    console.log("\n📇  Building indexes…");
    await db.collection("items").createIndex({ categoryId: 1 });
    await db.collection("items").createIndex({ supplierId: 1 });
    await db.collection("items").createIndex({ itemName: "text" });
    await db.collection("orders").createIndex({ orderStatus: 1 });
    await db.collection("orders").createIndex({ itemId: 1 });
    await db.collection("orders").createIndex({ employeeId: 1 });
    await db.collection("reorderAlerts").createIndex({ alertDate: -1 });
    await db.collection("reorderAlerts").createIndex({ resolved: 1 });
    console.log("   ✔ Indexes created");

    console.log("\n🎉  Schema setup complete!\n");
  } catch (err) {
    console.error("❌  Schema setup failed:", err.message);
    throw err;
  } finally {
    await client.close();
  }
}

main();
