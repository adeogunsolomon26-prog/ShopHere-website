const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || 'shopHere';
let db;

async function boot() {
  try {
    if (!uri) {
      console.log("⚠️ No MONGODB_URI - demo mode");
      return;
    }
    const client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);
    console.log("✅ Connected to MongoDB Atlas - database:", dbName);
  } catch (err) {
    console.error("❌ Failed to start server:", err.message);
  }
}
boot();

function col(name) {
  if (!db) throw new Error("DB not connected - check MONGODB_URI in Vercel");
  return db.collection(name);
}

// PRODUCTS
app.get('/api/products', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const products = await col('products').find({}).sort({_id:-1}).limit(100).toArray();
    res.json(products);
  } catch (e) { res.status(500).json({error:e.message}); }
});

app.post('/api/products', async (req, res) => {
  try {
    const {title, price, image, category, location} = req.body;
    const doc = {title, price: Number(price), image: image||'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400', category: category||'All', location: location||'USA • now', createdAt: new Date()};
    const r = await col('products').insertOne(doc);
    res.json({_id:r.insertedId, ...doc});
  } catch(e){ res.status(500).json({error:e.message}); }
});

// MESSAGES - OfferUp style chat
app.get('/api/messages', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const { productId } = req.query;
    const filter = productId ? {productId} : {};
    const msgs = await col('messages').find(filter).sort({createdAt:1}).limit(200).toArray();
    res.json(msgs);
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.post('/api/messages', async (req, res) => {
  try {
    const { productId, productTitle, text, from } = req.body;
    const doc = { productId: productId||'general', productTitle: productTitle||'', text, from: from||'Buyer', createdAt: new Date() };
    const r = await col('messages').insertOne(doc);
    res.json({_id:r.insertedId, ...doc});
  } catch(e){ res.status(500).json({error:e.message}); }
});

// OFFERS - eBay style
app.post('/api/offers', async (req, res) => {
  try {
    const { productId, productTitle, amount, message } = req.body;
    const doc = { productId, productTitle, amount: Number(amount), message, status:'pending', createdAt: new Date() };
    const r = await col('offers').insertOne(doc);
    await col('messages').insertOne({ productId, productTitle, text: `💰 Offer $${amount} - ${message||''}`, from:'Buyer', createdAt: new Date() });
    res.json({_id:r.insertedId, ...doc});
  } catch(e){ res.status(500).json({error:e.message}); }
});

// ORDERS - Buy Now
app.post('/api/orders', async (req, res) => {
  try {
    const { productId, productTitle, price, shippingAddress, phone } = req.body;
    const doc = { productId, productTitle, price: Number(price), shippingAddress, phone, status:'new', createdAt: new Date() };
    const r = await col('orders').insertOne(doc);
    await col('messages').insertOne({ productId, productTitle, text: `✅ ORDER $${price} - Ship to: ${shippingAddress} - Phone: ${phone}`, from:'System', createdAt: new Date() });
    res.json({_id:r.insertedId, ...doc});
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.get('/api/orders', async (req,res)=>{
  try{
    if(!db) return res.json([]);
    const orders = await col('orders').find({}).sort({createdAt:-1}).toArray();
    res.json(orders);
  }catch(e){res.status(500).json({error:e.message})}
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 ShopHere server running at http://localhost:${PORT}/`);
  });
}

module.exports = app;
