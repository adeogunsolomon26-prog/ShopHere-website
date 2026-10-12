import mongoose from 'mongoose'

const OrderSchema = new mongoose.Schema({
  email: String,
  phone: String,
  shippingAddress: String,
  products: Array,
  subtotal: Number,
  status: { type: String, default: 'pending_seller_contact' },
  sellerId: String,
  createdAt: { type: Date, default: Date.now }
}, { strict: false })

export default mongoose.models.Order || mongoose.model('Order', OrderSchema)
