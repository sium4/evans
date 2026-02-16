const express = require('express');

module.exports = function registerCategoryRoutes(app, deps = {}) {
  const router = express.Router();
  const {
    CategoryModel,
    databaseRef,
    saveDatabaseFn,
    authMiddleware,
    adminMiddleware,
    mongoose
  } = deps;

  // No file-sync: when MongoDB is available, writes go directly to MongoDB.

  // Public endpoint used by frontend (keeps same path)
  router.get('/api/categories', async (req, res) => {
    try {
      if (CategoryModel && mongoose.connection.readyState === 1) {
        const categories = await CategoryModel.find().sort({ name: 1 }).lean();
        return res.json(categories);
      }
      return res.json((databaseRef && databaseRef.categories) || []);
    } catch (err) {
      console.error('GET /api/categories error:', err);
      res.status(500).json({ error: 'Failed to fetch categories' });
    }
  });

  // Admin list
  router.get('/api/admin/categories', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      console.log('🔐 [categories] GET /api/admin/categories by', req.user?.email || req.user?.id);
      if (CategoryModel && mongoose.connection.readyState === 1) {
        const categories = await CategoryModel.find().sort({ createdAt: -1 }).lean();
        return res.json(categories);
      }
      return res.json((databaseRef && databaseRef.categories) || []);
    } catch (err) {
      console.error('GET /api/admin/categories error:', err);
      res.status(500).json({ error: 'Failed to fetch categories' });
    }
  });

  // Admin create
  router.post('/api/admin/categories', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      console.log('🔐 [categories] POST /api/admin/categories by', req.user?.email || req.user?.id, 'body:', req.body);
      const { name, description, image } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

      if (CategoryModel && mongoose.connection.readyState === 1) {
        const exists = await CategoryModel.findOne({ name: name.trim() });
        if (exists) return res.status(400).json({ error: 'Category already exists' });

        const cat = new CategoryModel({ name: name.trim(), description: description || '', image: image || '' });
        const saved = await cat.save();
        return res.status(201).json(saved);
      }

      // Fallback to file DB
      const newCategory = {
        _id: (Math.random().toString(36).substr(2, 9)),
        name: name.trim(),
        description: description || '',
        image: image || '',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      if (databaseRef) {
        databaseRef.categories = databaseRef.categories || [];
        databaseRef.categories.push(newCategory);
      }
      if (typeof saveDatabaseFn === 'function') saveDatabaseFn();
      return res.status(201).json(newCategory);
    } catch (err) {
      console.error('POST /api/admin/categories error:', err);
      res.status(500).json({ error: 'Failed to create category' });
    }
  });

  // Admin update
  router.patch('/api/admin/categories/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      console.log('🔐 [categories] PATCH /api/admin/categories/' + req.params.id + ' by', req.user?.email || req.user?.id, 'body:', req.body);
      const updates = {};
      if (req.body.name) updates.name = req.body.name.trim();
      if (req.body.description !== undefined) updates.description = req.body.description;
      if (req.body.image !== undefined) updates.image = req.body.image;

      if (CategoryModel && mongoose.connection.readyState === 1) {
        const updated = await CategoryModel.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).lean();
        if (!updated) return res.status(404).json({ error: 'Category not found' });
        return res.json(updated);
      }

      const cat = (databaseRef && databaseRef.categories) ? databaseRef.categories.find(c => String(c._id) === String(req.params.id)) : null;
      if (!cat) return res.status(404).json({ error: 'Category not found' });
      Object.assign(cat, updates, { updatedAt: new Date() });
      if (typeof saveDatabaseFn === 'function') saveDatabaseFn();
      return res.json(cat);
    } catch (err) {
      console.error('PATCH /api/admin/categories/:id error:', err);
      res.status(500).json({ error: 'Failed to update category' });
    }
  });

  // Admin delete
  router.delete('/api/admin/categories/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      console.log('🔐 [categories] DELETE /api/admin/categories/' + req.params.id + ' by', req.user?.email || req.user?.id);
      if (CategoryModel && mongoose.connection.readyState === 1) {
        const deleted = await CategoryModel.findByIdAndDelete(req.params.id).lean();
        if (!deleted) return res.status(404).json({ error: 'Category not found' });
        return res.json({ success: true });
      }

      const idx = (databaseRef && databaseRef.categories) ? databaseRef.categories.findIndex(c => String(c._id) === String(req.params.id)) : -1;
      if (idx === -1) return res.status(404).json({ error: 'Category not found' });
      databaseRef.categories.splice(idx, 1);
      if (typeof saveDatabaseFn === 'function') saveDatabaseFn();
      return res.json({ success: true });
    } catch (err) {
      console.error('DELETE /api/admin/categories/:id error:', err);
      res.status(500).json({ error: 'Failed to delete category' });
    }
  });

  app.use(router);
};
