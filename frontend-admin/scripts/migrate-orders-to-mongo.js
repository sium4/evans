require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

async function main(){
  const MONGO_URI = process.env.MONGO_URI;
  if(!MONGO_URI){
    console.error('MONGO_URI not set in .env');
    process.exit(2);
  }

  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('✅ Connected to MongoDB for migration');

  let OrderModel;
  try{
    OrderModel = require(path.join(__dirname, '..', 'models', 'Order'));
  }catch(e){
    console.error('Failed to load Order model:', e.message);
    process.exit(1);
  }

  const dbFile = path.join(__dirname, '..', 'database.json');
  if(!fs.existsSync(dbFile)){
    console.error('database.json not found at', dbFile);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  const orders = data.orders || [];
  console.log(`Found ${orders.length} orders in database.json`);

  let created = 0, updated = 0, skipped = 0;

  for(const o of orders){
    try{
      // Build payload compatible with OrderModel
      const payload = {
        // store original file DB id in metadata.orderId so we don't conflict with ObjectId _id
        metadata: Object.assign({}, o.metadata || {}, { orderId: o._id }),
        customerId: o.customerId || undefined,
        customerName: o.customerName || o.customer || undefined,
        customerEmail: o.customerEmail || undefined,
        customerPhone: o.customerPhone || undefined,
        items: (o.items || []).map(it => ({
          productId: it.id || it.productId || undefined,
          name: it.name || it.title || it.product || '',
          price: Number(it.price || it.unitPrice || 0),
          quantity: Number(it.quantity || it.qty || 1)
        })),
        subtotal: Number(o.subtotal || o.total || 0),
        shippingCost: Number(o.shippingCost || 0),
        tax: Number(o.tax || 0),
        total: Number(o.total || 0),
        paymentMethod: o.paymentMethod || o.payment || 'cod',
        status: o.status || 'pending',
        shipping: {
          address: o.shippingAddress || o.address || undefined,
          city: o.shippingCity || o.city || undefined,
          state: o.shippingState || undefined,
          zipcode: o.shippingZipcode || o.zipcode || undefined,
          country: o.shippingCountry || undefined,
          area: o.shippingArea || undefined
        },
        metadata: o.metadata || {}
      };

      // Convert createdAt/updatedAt
      if (o.createdAt) payload.createdAt = new Date(o.createdAt);
      if (o.updatedAt) payload.updatedAt = new Date(o.updatedAt);

      // Insert new document; do not force _id so Mongo will create ObjectId.
      await OrderModel.create(payload);
      created += 1;
    } catch (err){
      console.error('Failed to import order', o._id, err.message);
      skipped += 1;
    }
  }

  console.log(`Migration complete. Processed: ${orders.length}, Imported: ${created}, Skipped: ${skipped}`);
  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
