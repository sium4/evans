const mongoose = require('mongoose');

const OrderItemSchema = new mongoose.Schema({
  productId: { type: String },
  name: { type: String },
  price: { type: Number, required: true, default: 0 },
  quantity: { type: Number, required: true, default: 1 }
}, { _id: false });

const ShippingSchema = new mongoose.Schema({
  address: String,
  city: String,
  state: String,
  zipcode: String,
  country: String,
  area: String
}, { _id: false });

const OrderSchema = new mongoose.Schema({
  customerId: { type: String, index: true },
  customerName: { type: String, required: true },
  customerEmail: { type: String, lowercase: true, trim: true },
  customerPhone: { type: String },
  items: { type: [OrderItemSchema], default: [] },
  subtotal: { type: Number, default: 0 },
  shippingCost: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  total: { type: Number, required: true },
  paymentMethod: { type: String, default: 'cod' },
  status: { type: String, enum: ['pending','confirmed','shipped','delivered','cancelled'], default: 'pending' },
  shipping: { type: ShippingSchema },
  metadata: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

OrderSchema.index({ createdAt: -1 });

module.exports = mongoose.models.Order || mongoose.model('Order', OrderSchema);
