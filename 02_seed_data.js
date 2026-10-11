/**
 * 02_seed_data.js
 * ──────────────────────────────────────────────────────────────
 * Population script inserting sample datasets in strict
 * dependency order:
 *   1. categories  (4 documents)
 *   2. suppliers   (3 documents)
 *   3. employees   (3 documents)
 *   4. items       (5 documents – refs categories & suppliers)
 *   5. orders      (5 documents – refs items & employees)
 * ──────────────────────────────────────────────────────────────
 */
require("dotenv").config();
const { MongoClient, ObjectId, Int32, Double } = require("mongodb");

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || "ShopHere";

async function main() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log("✅  Connected to MongoDB Atlas");
    const db = client.db(dbName);

    /* ═══════════════════════════════════════════════════════════
       1. CATEGORIES
       ═══════════════════════════════════════════════════════════ */
    console.log("\n📦  Seeding categories…");
    await db.collection("categories").deleteMany({});
    const catResult = await db.collection("categories").insertMany([
      { categoryName: "Household" },
      { categoryName: "Sports" },
      { categoryName: "Accessories" },
      { categoryName: "Clothing" }
    ]);
    const catIds = Object.values(catResult.insertedIds);
    console.log(`   ✔ Inserted ${catIds.length} categories`);

    /* ═══════════════════════════════════════════════════════════
       2. SUPPLIERS
       ═══════════════════════════════════════════════════════════ */
    console.log("\n🏭  Seeding suppliers…");
    await db.collection("suppliers").deleteMany({});
    const supResult = await db.collection("suppliers").insertMany([
      {
        supplierName: "Alpha Goods Ltd",
        phone: "23-456-7890-123-456",
        email: "contact@alphagoods.com",
        address: "12 Marina Road, Lagos"
      },
      {
        supplierName: "BetaSport Intl",
        phone: "44-789-1234-567-890",
        email: "sales@betasport.com",
        address: "88 Olympic Avenue, London"
      },
      {
        supplierName: "Gamma Wear Co",
        phone: "91-321-6540-987-654",
        email: "info@gammawear.in",
        address: "5 Textile Lane, Mumbai"
      }
    ]);
    const supIds = Object.values(supResult.insertedIds);
    console.log(`   ✔ Inserted ${supIds.length} suppliers`);

    /* ═══════════════════════════════════════════════════════════
       3. EMPLOYEES
       ═══════════════════════════════════════════════════════════ */
    console.log("\n👥  Seeding employees…");
    await db.collection("employees").deleteMany({});
    const empResult = await db.collection("employees").insertMany([
      {
        firstName: "Tomiwa",
        lastName: "Adeyemi",
        phone: "23-801-2345-678-901",
        email: "tomiwa@shophere.com",
        role: "Inventory Manager",
        hireDate: new Date("2024-01-15")
      },
      {
        firstName: "Solomon",
        lastName: "Okafor",
        phone: "23-802-3456-789-012",
        email: "solomon@shophere.com",
        role: "Inventory Manager",
        hireDate: new Date("2024-03-10")
      },
      {
        firstName: "Samuel",
        lastName: "Balogun",
        phone: "23-803-4567-890-123",
        email: "samuel@shophere.com",
        role: "Inventory Manager",
        hireDate: new Date("2024-06-20")
      }
    ]);
    const empIds = Object.values(empResult.insertedIds);
    console.log(`   ✔ Inserted ${empIds.length} employees`);

    /* ═══════════════════════════════════════════════════════════
       4. ITEMS
       ═══════════════════════════════════════════════════════════ */
    console.log("\n📋  Seeding items…");
    await db.collection("items").deleteMany({});
    const itemResult = await db.collection("items").insertMany([
      {
        itemName: "Kitchen Blender Pro",
        unitPrice: new Double(49.99),
        quantityInHand: new Int32(25),
        reorderLevel: new Int32(10),
        reorderQuantity: new Int32(30),
        categoryId: catIds[0],   // Household
        supplierId: supIds[0]    // Alpha Goods
      },
      {
        itemName: "Carbon Fiber Tennis Racket",
        unitPrice: new Double(129.95),
        quantityInHand: new Int32(8),
        reorderLevel: new Int32(5),
        reorderQuantity: new Int32(15),
        categoryId: catIds[1],   // Sports
        supplierId: supIds[1]    // BetaSport
      },
      {
        itemName: "Leather Wrist Watch",
        unitPrice: new Double(85.00),
        quantityInHand: new Int32(40),
        reorderLevel: new Int32(15),
        reorderQuantity: new Int32(20),
        categoryId: catIds[2],   // Accessories
        supplierId: supIds[2]    // Gamma Wear
      },
      {
        itemName: "Premium Denim Jacket",
        unitPrice: new Double(120.50),
        quantityInHand: new Int32(3),
        reorderLevel: new Int32(10),
        reorderQuantity: new Int32(25),
        categoryId: catIds[3],   // Clothing
        supplierId: supIds[2]    // Gamma Wear
      },
      {
        itemName: "Stainless Steel Cookware Set",
        unitPrice: new Double(199.99),
        quantityInHand: new Int32(12),
        reorderLevel: new Int32(5),
        reorderQuantity: new Int32(10),
        categoryId: catIds[0],   // Household
        supplierId: supIds[0]    // Alpha Goods
      }
    ]);
    const itemIds = Object.values(itemResult.insertedIds);
    console.log(`   ✔ Inserted ${itemIds.length} items`);

    /* ═══════════════════════════════════════════════════════════
       5. ORDERS
       ═══════════════════════════════════════════════════════════ */
    console.log("\n📑  Seeding orders…");
    await db.collection("orders").deleteMany({});
    await db.collection("orders").insertMany([
      {
        itemId: itemIds[0],
        quantityOrdered: new Int32(20),
        orderDate: new Date("2026-09-01"),
        orderStatus: "InTransit",
        receivingDate: null,
        quantityReceived: null,
        employeeId: empIds[0]  // Tomiwa
      },
      {
        itemId: itemIds[1],
        quantityOrdered: new Int32(10),
        orderDate: new Date("2026-08-20"),
        orderStatus: "Received",
        receivingDate: new Date("2026-08-25"),
        quantityReceived: new Int32(10),
        employeeId: empIds[1]  // Solomon
      },
      {
        itemId: itemIds[2],
        quantityOrdered: new Int32(15),
        orderDate: new Date("2026-09-10"),
        orderStatus: "InTransit",
        receivingDate: null,
        quantityReceived: null,
        employeeId: empIds[2]  // Samuel
      },
      {
        itemId: itemIds[3],
        quantityOrdered: new Int32(25),
        orderDate: new Date("2026-09-15"),
        orderStatus: "InTransit",
        receivingDate: null,
        quantityReceived: null,
        employeeId: empIds[0]  // Tomiwa
      },
      {
        itemId: itemIds[4],
        quantityOrdered: new Int32(8),
        orderDate: new Date("2026-07-30"),
        orderStatus: "Cancelled",
        receivingDate: null,
        quantityReceived: null,
        employeeId: empIds[1]  // Solomon
      }
    ]);
    console.log(`   ✔ Inserted 5 orders`);

    /* Clear any stale reorder alerts */
    await db.collection("reorderAlerts").deleteMany({});
    console.log("   ✔ Cleared reorderAlerts");

    console.log("\n🎉  Seed data complete!\n");
  } catch (err) {
    console.error("❌  Seeding failed:", err.message);
    throw err;
  } finally {
    await client.close();
  }
}

main();
