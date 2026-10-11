/**
 * 05_users_setup.js
 * ──────────────────────────────────────────────────────────────
 * Creates the `users` collection with password-based auth
 * and seeds default user accounts for RBAC demonstration.
 *
 * Users:
 *   - Iyiola   (superadmin / dbOwner)
 *   - Tomiwa   (staff / readWrite)
 *   - Solomon  (staff / readWrite)
 *   - Samuel   (staff / readWrite)
 *   - consumer (consumer / readOnly)
 * ──────────────────────────────────────────────────────────────
 */
require("dotenv").config();
const { MongoClient } = require("mongodb");
const crypto = require("crypto");

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || "ShopHere";

/* Simple SHA-256 password hashing (demo-grade) */
function hashPassword(plain) {
  return crypto.createHash("sha256").update(plain).digest("hex");
}

async function main() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log("✅  Connected to MongoDB Atlas");
    const db = client.db(dbName);

    /* Drop and recreate users collection */
    const cols = await db.listCollections({ name: "users" }).toArray();
    if (cols.length) await db.dropCollection("users");

    await db.createCollection("users", {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["username", "password", "displayName", "role"],
          properties: {
            username: {
              bsonType: "string",
              description: "Unique login username"
            },
            password: {
              bsonType: "string",
              description: "SHA-256 hashed password"
            },
            displayName: {
              bsonType: "string",
              description: "Display name shown in UI"
            },
            role: {
              bsonType: "string",
              enum: ["superadmin", "staff", "consumer"],
              description: "RBAC role: superadmin | staff | consumer"
            },
            dbRole: {
              bsonType: "string",
              description: "Corresponding MongoDB database role"
            },
            email: {
              bsonType: "string",
              description: "User email address"
            },
            isActive: {
              bsonType: "bool",
              description: "Whether the account is active"
            },
            createdAt: {
              bsonType: "date",
              description: "Account creation timestamp"
            },
            lastLogin: {
              bsonType: ["date", "null"],
              description: "Last login timestamp"
            }
          }
        }
      },
      validationLevel: "strict",
      validationAction: "error"
    });
    console.log("   ✔ Created collection: users");

    /* Unique index on username */
    await db.collection("users").createIndex({ username: 1 }, { unique: true });
    console.log("   ✔ Created unique index on username");

    /* Seed default users */
    const users = [
      {
        username: "iyiola",
        password: hashPassword("Admin@2026"),
        displayName: "Iyiola",
        role: "superadmin",
        dbRole: "dbOwner",
        email: "iyiola@shophere.com",
        isActive: true,
        createdAt: new Date(),
        lastLogin: null
      },
      {
        username: "tomiwa",
        password: hashPassword("Staff@2026"),
        displayName: "Tomiwa",
        role: "staff",
        dbRole: "readWrite",
        email: "tomiwa@shophere.com",
        isActive: true,
        createdAt: new Date(),
        lastLogin: null
      },
      {
        username: "solomon",
        password: hashPassword("Staff@2026"),
        displayName: "Solomon",
        role: "staff",
        dbRole: "readWrite",
        email: "solomon@shophere.com",
        isActive: true,
        createdAt: new Date(),
        lastLogin: null
      },
      {
        username: "samuel",
        password: hashPassword("Staff@2026"),
        displayName: "Samuel",
        role: "staff",
        dbRole: "readWrite",
        email: "samuel@shophere.com",
        isActive: true,
        createdAt: new Date(),
        lastLogin: null
      },
      {
        username: "consumer",
        password: hashPassword("Shop@2026"),
        displayName: "Guest Shopper",
        role: "consumer",
        dbRole: "read",
        email: "guest@shophere.com",
        isActive: true,
        createdAt: new Date(),
        lastLogin: null
      }
    ];

    await db.collection("users").insertMany(users);
    console.log(`   ✔ Inserted ${users.length} user accounts`);

    console.log("\n📋  Default Credentials:");
    console.log("   ┌──────────────┬─────────────┬──────────────┐");
    console.log("   │ Username     │ Password    │ Role         │");
    console.log("   ├──────────────┼─────────────┼──────────────┤");
    console.log("   │ iyiola       │ Admin@2026  │ superadmin   │");
    console.log("   │ tomiwa       │ Staff@2026  │ staff        │");
    console.log("   │ solomon      │ Staff@2026  │ staff        │");
    console.log("   │ samuel       │ Staff@2026  │ staff        │");
    console.log("   │ consumer     │ Shop@2026   │ consumer     │");
    console.log("   └──────────────┴─────────────┴──────────────┘");

    console.log("\n🎉  Users setup complete!\n");
  } catch (err) {
    console.error("❌  Users setup failed:", err.message);
    throw err;
  } finally {
    await client.close();
  }
}

main();
