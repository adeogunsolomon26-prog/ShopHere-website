// SHOPHERE - Chapter 8 Implementation
// Install: npm install mongodb

const { MongoClient, ObjectId } = require("mongodb");

// 1. CONNECTION - From "Connecting to the Driver" slide
const uri = "mongodb+srv://Solomon:foursquare@solomon.kj1owmu.mongodb.net/ShopHere?appName=Solomon";

const client = new MongoClient(uri);

async function runShopHere() {
  try {
    // Connect
    await client.connect();
    console.log("Connected to ShopHere Atlas!");

    const db = client.db("ShopHere");
    const itemsCollection = db.collection("items");
    const ordersCollection = db.collection("orders");

    console.log("Database ready for Chapter 8 operations!");

  } catch (err) {
    console.error("Connection error:", err);
  } finally {
    await client.close();
  }
}

runShopHere();