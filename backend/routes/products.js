const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

const Product = require('../models/Product');

const DATABASE_FILE = path.join(__dirname, '..', 'database.json');

function jwtMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

// Cloudinary storage for multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => ({
    folder: process.env.CLOUDINARY_FOLDER || 'evans/products',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    public_id: `product_${Date.now()}_${Math.round(Math.random()*1e6)}`
  })
});

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Helper: read file DB
function readFileDatabase() {
  try {
    const raw = fs.readFileSync(DATABASE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

// Map product doc to legacy frontend shape
function toFrontendProduct(p) {
  return {
    _id: p._id?.toString ? p._id.toString() : p._id,
    name: p.name,
    category: p.category,
    price: p.price,
    stock: p.stock,
    description: p.description || '',
    image: p.imageUrl || p.image || '',
    imageUrl: p.imageUrl || p.image || '',
    createdAt: p.createdAt || p.created_at || new Date()
  };
}

// GET /api/products - list all products (Mongo preferred, fallback to file DB)
router.get('/products', async (req, res) => {
  try {
    if (Product && Product.find) {
      const docs = await Product.find().sort({ createdAt: -1 }).lean();
      return res.json(docs.map(toFrontendProduct));
    }
  } catch (err) {
    console.warn('Mongo products fetch error, falling back to file DB:', err.message);
  }

  // fallback
  const db = readFileDatabase();
  const products = (db && db.products) ? db.products : [];
  // Convert local upload paths to absolute URLs if possible
  const host = req.protocol + '://' + req.get('host');
  const mapped = products.map(p => {
    const copy = Object.assign({}, p);
    if (copy.image && copy.image.startsWith('/uploads')) copy.image = host + copy.image;
    return toFrontendProduct(copy);
  });
  res.json(mapped);
});

// GET /api/admin/products - admin product listing (protected)
router.get('/admin/products', jwtMiddleware, adminOnly, async (req, res) => {
  try {
    if (Product && Product.find) {
      const docs = await Product.find().sort({ createdAt: -1 }).lean();
      return res.json(docs.map(toFrontendProduct));
    }
  } catch (err) {
    console.warn('Mongo admin products fetch error, falling back to file DB:', err.message);
  }

  const db = readFileDatabase();
  const products = (db && db.products) ? db.products : [];
  const host = req.protocol + '://' + req.get('host');
  const mapped = products.map(p => {
    const copy = Object.assign({}, p);
    if (copy.image && copy.image.startsWith('/uploads')) copy.image = host + copy.image;
    return toFrontendProduct(copy);
  });
  res.json(mapped);
});

// GET /api/products/:id - fetch single product by id
router.get('/products/:id', async (req, res) => {
  const id = req.params.id;
  try {
    if (Product && Product.findById) {
      const doc = await Product.findById(id).lean();
      if (doc) return res.json(toFrontendProduct(doc));
    }
  } catch (err) {
    // Continue to fallback
  }

  const db = readFileDatabase();
  const prod = db?.products?.find(p => p._id === id || p._id === String(id));
  if (!prod) return res.status(404).json({ error: 'Product not found' });
  const host = req.protocol + '://' + req.get('host');
  if (prod.image && prod.image.startsWith('/uploads')) prod.image = host + prod.image;
  res.json(toFrontendProduct(prod));
});

// POST /api/admin/products - create product with image upload (admin only)
router.post('/admin/products', jwtMiddleware, adminOnly, upload.single('image'), async (req, res) => {
  try {
    const { name, category, price = 0, stock = 0, description = '' } = req.body;

    const imageUrl = req.file?.path || req.file?.url || '';
    // multer-storage-cloudinary stores public_id in req.file?.filename or req.file?.public_id
    const imagePublicId = req.file?.filename || req.file?.public_id || '';

    // Create in Mongo if available
    if (Product) {
      const p = new Product({ name, category, price: Number(price), stock: Number(stock), description, imageUrl, imagePublicId });
      await p.save();
      return res.json({ success: true, product: toFrontendProduct(p) });
    }

    // fallback: write to file DB
    const db = readFileDatabase() || { products: [] };
    const newProd = { _id: Math.random().toString(36).substr(2,9), name, category, price: Number(price), stock: Number(stock), description, image: imageUrl, createdAt: new Date() };
    db.products = db.products || [];
    db.products.unshift(newProd);
    fs.writeFileSync(DATABASE_FILE, JSON.stringify(db, null, 2));
    return res.json({ success: true, product: toFrontendProduct(newProd) });
  } catch (err) {
    console.error('Create product error:', err);
    return res.status(500).json({ error: 'Failed to create product' });
  }
});

// PATCH /api/admin/products/:id - update product (admin only)
router.patch('/admin/products/:id', jwtMiddleware, adminOnly, upload.single('image'), async (req, res) => {
  const id = req.params.id;
  try {
    const updates = {};
    const { name, category, price, stock, description } = req.body;
    if (name) updates.name = name;
    if (category) updates.category = category;
    if (price !== undefined) updates.price = Number(price);
    if (stock !== undefined) updates.stock = Number(stock);
    if (description !== undefined) updates.description = description;

    if (req.file) {
      const newUrl = req.file.path || req.file.url || '';
      const newPublicId = req.file.filename || req.file.public_id || '';
      updates.imageUrl = newUrl;
      updates.imagePublicId = newPublicId;
    }

    if (Product && Product.findById) {
      const existing = await Product.findById(id);
      if (!existing) return res.status(404).json({ error: 'Product not found' });

      // If replacing image, remove old image from Cloudinary if we have public id
      if (req.file && existing.imagePublicId) {
        try { await cloudinary.uploader.destroy(existing.imagePublicId); } catch (e) { /* ignore */ }
      }

      Object.assign(existing, updates);
      await existing.save();
      return res.json({ success: true, product: toFrontendProduct(existing) });
    }

    // fallback file DB
    const db = readFileDatabase();
    if (!db) return res.status(500).json({ error: 'File DB unavailable' });
    const idx = db.products.findIndex(p => p._id === id);
    if (idx === -1) return res.status(404).json({ error: 'Product not found' });
    const prod = db.products[idx];
    const merged = Object.assign(prod, updates);
    if (req.file) merged.image = req.file.path || req.file.url || merged.image;
    db.products[idx] = merged;
    fs.writeFileSync(DATABASE_FILE, JSON.stringify(db, null, 2));
    return res.json({ success: true, product: toFrontendProduct(merged) });
  } catch (err) {
    console.error('Update product error:', err);
    return res.status(500).json({ error: 'Failed to update product' });
  }
});

// DELETE /api/admin/products/:id - delete product + cloudinary image (admin only)
router.delete('/admin/products/:id', jwtMiddleware, adminOnly, async (req, res) => {
  const id = req.params.id;
  try {
    if (Product && Product.findByIdAndDelete) {
      const existing = await Product.findById(id);
      if (!existing) return res.status(404).json({ error: 'Product not found' });
      // delete from cloudinary
      if (existing.imagePublicId) {
        try { await cloudinary.uploader.destroy(existing.imagePublicId); } catch (e) { /* ignore */ }
      }
      await Product.findByIdAndDelete(id);
      return res.json({ success: true });
    }

    const db = readFileDatabase();
    if (!db) return res.status(500).json({ error: 'File DB unavailable' });
    const idx = db.products.findIndex(p => p._id === id);
    if (idx === -1) return res.status(404).json({ error: 'Product not found' });
    db.products.splice(idx, 1);
    fs.writeFileSync(DATABASE_FILE, JSON.stringify(db, null, 2));
    return res.json({ success: true });
  } catch (err) {
    console.error('Delete product error:', err);
    return res.status(500).json({ error: 'Failed to delete product' });
  }
});

module.exports = router;
