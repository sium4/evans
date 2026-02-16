require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../models/Admin');

const [emailArg, passwordArg, nameArg] = process.argv.slice(2);
const email = emailArg || process.env.ADMIN_EMAIL;
const password = passwordArg || process.env.ADMIN_PASSWORD;
const name = nameArg || process.env.ADMIN_NAME || 'Admin';

if (!email || !password) {
  console.error('Usage: node scripts/createAdmin.js admin@example.com StrongPass123');
  process.exit(1);
}

async function main() {
  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGODB_URL;
  if (!MONGO_URI) {
    console.error('MONGO_URI or MONGODB_URI is required in env');
    process.exit(1);
  }
  try {
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');
    const existing = await Admin.findOne({ email: email.toLowerCase() });
    if (existing) {
      console.log('Admin already exists:', email);
      process.exit(0);
    }
    const admin = new Admin({ email: email.toLowerCase(), password, name, role: 'admin' });
    await admin.save();
    console.log('Admin created:', email);
    process.exit(0);
  } catch (err) {
    console.error('Error creating admin:', err.message || err);
    process.exit(1);
  } finally {
    try { await mongoose.disconnect(); } catch (_) {}
  }
}

main();
