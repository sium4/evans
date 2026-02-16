const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const Category = require('../models/Category');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGODB_URL;
if (!MONGO_URI) {
  console.error('Set MONGO_URI in env before running migration.');
  process.exit(1);
}

async function main() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  const dbFile = path.join(__dirname, '..', 'database.json');
  if (!fs.existsSync(dbFile)) {
    console.error('database.json not found at', dbFile);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  const categories = data.categories || [];

  for (const c of categories) {
    const name = (c.name || '').trim();
    if (!name) continue;
    const exists = await Category.findOne({ name: name });
    if (exists) {
      console.log('Skipping existing:', name);
      continue;
    }
    const doc = new Category({
      name,
      description: c.description || '',
      image: c.image || ''
    });
    await doc.save();
    console.log('Inserted:', name, doc._id.toString());
  }

  // Resync file cache with Mongo IDs
  const all = await Category.find().lean();
  data.categories = all.map(c => ({
    _id: String(c._id),
    name: c.name,
    description: c.description || '',
    image: c.image || '',
    createdAt: c.createdAt,
    updatedAt: c.updatedAt
  }));
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2), 'utf8');
  console.log('database.json updated with Mongo category IDs.');

  await mongoose.disconnect();
  console.log('Migration complete.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
