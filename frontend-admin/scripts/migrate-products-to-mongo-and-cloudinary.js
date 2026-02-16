/**
 * Migration script: reads database.json products, uploads images to Cloudinary,
 * and creates Product documents in MongoDB.
 *
 * Usage: set MONGO_URI, CLOUDINARY_* env vars then run:
 *   node scripts/migrate-products-to-mongo-and-cloudinary.js
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const cloudinary = require('../config/cloudinary');
const Product = require('../models/Product');

const DATABASE_FILE = path.join(__dirname, '..', 'database.json');

async function main() {
  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!MONGO_URI) throw new Error('MONGO_URI is required');
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB');

  const raw = fs.readFileSync(DATABASE_FILE, 'utf8');
  const db = JSON.parse(raw);
  const products = db.products || [];

  for (const p of products) {
    try {
      let imageUrl = '';
      let publicId = '';
      if (p.image) {
        // If image path is local uploads, upload the file
        const uploadsPrefix = '/uploads/products/';
        if (p.image.startsWith(uploadsPrefix) || p.image.startsWith('uploads/products')) {
          const filename = p.image.replace(/^\/?uploads\/products\//, '');
          const localPath = path.join(__dirname, '..', 'uploads', 'products', filename);
          if (fs.existsSync(localPath)) {
            const res = await cloudinary.uploader.upload(localPath, { folder: process.env.CLOUDINARY_FOLDER || 'evans/products' });
            imageUrl = res.secure_url;
            publicId = res.public_id;
            console.log('Uploaded', filename, '->', res.secure_url);
          } else {
            console.warn('Local image not found, skipping upload for', localPath);
          }
        } else if (p.image.startsWith('http')) {
          // Remote URL: instruct Cloudinary to fetch
          const res = await cloudinary.uploader.upload(p.image, { folder: process.env.CLOUDINARY_FOLDER || 'evans/products' });
          imageUrl = res.secure_url;
          publicId = res.public_id;
        }
      }

      const doc = new Product({
        name: p.name,
        category: p.category,
        price: Number(p.price) || 0,
        stock: Number(p.stock) || 0,
        description: p.description || '',
        imageUrl: imageUrl || (p.image && p.image.startsWith('http') ? p.image : ''),
        imagePublicId: publicId || '',
        createdAt: p.createdAt ? new Date(p.createdAt) : undefined
      });
      await doc.save();
      console.log('Created product in Mongo:', doc._id.toString(), p.name);
    } catch (err) {
      console.error('Error migrating product', p._id, err.message);
    }
  }

  console.log('Migration complete');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
