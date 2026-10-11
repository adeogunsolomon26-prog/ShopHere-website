const { MongoClient } = require('mongodb');
const uri = "mongodb://Solomon:foursquare@ac-bfezhty-shard-00-00.kjlowmu.mongodb.net:27017,ac-bfezhty-shard-00-01.kjlowmu.mongodb.net:27017,ac-bfezhty-shard-00-02.kjlowmu.mongodb.net:27017/?ssl=true&replicaSet=atlas-62nhdw-shard-0&authSource=admin&appName=Solomon";

async function runShopHere() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log("Connected to ShopHere Atlas!");
  } catch (err) {
    console.error("Connection error:", err.message);
  } finally {
    await client.close();
  }
}
runShopHere();