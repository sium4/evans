require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

async function main(){
  const MONGO_URI = process.env.MONGO_URI;
  if(!MONGO_URI){
    console.error('MONGO_URI not set in .env');
    process.exit(2);
  }
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  // import the existing Order model if available
  let Order;
  try{
    Order = require(path.join(__dirname, '..', 'models', 'Order'));
  }catch(e){
    // fallback: use a generic model
    const orderSchema = new mongoose.Schema({}, { strict: false, collection: 'orders', timestamps: true });
    Order = mongoose.model('Order', orderSchema);
  }

  const results = await Order.find().sort({ createdAt: -1 }).limit(20).lean().exec();
  console.log(`Found ${results.length} orders (most recent first):`);
  results.forEach(o => {
    console.log('---');
    console.log(`_id: ${o._id}`);
    console.log(`customerName: ${o.customerName}`);
    console.log(`customerEmail: ${o.customerEmail}`);
    console.log(`total: ${o.total}`);
    console.log(`createdAt: ${o.createdAt || o.created_at}`);
  });
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
