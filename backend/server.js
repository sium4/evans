const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config();

const mongoose = require('mongoose');
let AdminModel = null;
let OrderModel = null;
let ProductModel = null;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGODB_URL;
if (MONGO_URI) {
    mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
        .then(() => {
            console.log('✅ Connected to MongoDB');
                try { AdminModel = require('./models/Admin'); } catch (err) { console.warn('Admin model load warning:', err.message); }
                try { OrderModel = require('./models/Order'); } catch (err) { console.warn('Order model load warning:', err.message); }
                try { ProductModel = require('./models/Product'); } catch (err) { /* optional */ }
        })
        .catch(err => {
            console.error('❌ MongoDB connection error:', err);
        });
} else {
    console.log('⚠️ MONGO_URI / MONGODB_URI not set — running in file-DB auth fallback mode');
}

const app = express();

// ==================== MIDDLEWARE ====================
// Configure CORS with optional allowed origins from env var `ALLOWED_ORIGINS`.
// If `ALLOWED_ORIGINS` is empty, all origins are allowed (backward compatible).
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
    origin: (origin, cb) => {
        // allow non-browser requests like curl/postman
        if (!origin) return cb(null, true);
        if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error('CORS origin not allowed'));
    }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// Serve uploaded product images
app.use('/uploads/products', express.static(path.join(__dirname, 'uploads/products')));

// ==================== DATABASE FILE STORAGE ====================
const DATABASE_FILE = path.join(__dirname, 'database.json');

function loadDatabase() {
    try {
        if (fs.existsSync(DATABASE_FILE)) {
            const data = fs.readFileSync(DATABASE_FILE, 'utf8');
            const parsed = JSON.parse(data);
            console.log('✅ Database loaded from file');
            
            // Ensure all required properties exist
            if (!parsed.orders) parsed.orders = [];
            if (!parsed.admins) parsed.admins = [];
            if (!parsed.users) parsed.users = [];
            if (!parsed.products) parsed.products = [];
            if (!parsed.categories) parsed.categories = [];
            if (!parsed.settings) parsed.settings = getDefaultDatabase().settings;
            
            console.log(`📊 Loaded: ${parsed.orders.length} orders, ${parsed.products.length} products, ${parsed.users.length} users, ${parsed.categories.length} categories`);
            return parsed;
        }
    } catch (error) {
        console.error('Error loading database from file:', error);
    }
    return getDefaultDatabase();
}

function saveDatabase() {
    try {
        fs.writeFileSync(DATABASE_FILE, JSON.stringify(database, null, 2));
        console.log('💾 Database saved');
    } catch (error) {
        console.error('Error saving database:', error);
    }
}

function getDefaultDatabase() {
    return {
        admins: [
            {
                _id: 'admin1',
                email: 'admin@demo.com',
                password: '$2a$10$rWjJ8fZ7QK3p4M5Q6R7S8Q2p4M5Q6R7S8Q2p4M5Q6R7S8Q', // bcrypt hash of "demo123456"
                name: 'Admin User',
                role: 'admin'
            }
        ],
        users: [],
        products: [],
        categories: [],
        orders: [],
        settings: {
            storeName: 'Evan\'s Bakery & Chocolate',
            storeEmail: 'hello@evansbakery.com',
            storePhone: '+1 (555) 123-4567',
            whatsappNumber: ''
        }
    };
}

// Load database from file or use defaults
let database = loadDatabase();

// Optional: bootstrap an admin account from an environment variable for initial setup.
// Set `ADMIN_INIT` to a JSON string with `email`, `password`, and optional `name`.
// Example (macOS/Linux):
// export ADMIN_INIT='{"email":"admin@you.com","password":"StrongPass123","name":"Site Admin"}' && node server.js
if (process.env.ADMIN_INIT) {
    try {
        const init = JSON.parse(process.env.ADMIN_INIT);
        if (init.email && init.password) {
            const exists = database.admins.find(a => a.email === init.email);
            if (!exists) {
                const hashed = bcrypt.hashSync(init.password, 10);
                const newAdmin = {
                    _id: generateId(),
                    email: init.email,
                    password: hashed,
                    name: init.name || 'Admin User',
                    role: 'admin',
                    createdAt: new Date()
                };
                database.admins.push(newAdmin);
                saveDatabase();
                console.log('🔐 Admin account created from ADMIN_INIT for:', init.email);
                console.log('⚠️ Remove ADMIN_INIT from environment after initial setup.');
            } else {
                console.log('⚠️ ADMIN_INIT detected but admin already exists for:', init.email);
            }
        } else {
            console.warn('ADMIN_INIT env var is missing required `email` or `password` fields');
        }
    } catch (err) {
        console.error('Error parsing ADMIN_INIT env var:', err);
    }
}

// ==================== UTILITIES ====================
function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

// Normalize order object for legacy admin UI compatibility
function normalizeOrderForLegacy(o) {
    if (!o) return o;
    // clone shallow
    const order = Object.assign({}, o);
    // shippingAddress compatibility: some orders store as string (shippingAddress),
    // while Mongo documents use `shipping: { address, city, ... }`.
    if (order.shipping && typeof order.shipping === 'object') {
        // Provide both the old flattened string fields and an `address` object
        if (!order.shippingAddress) order.shippingAddress = order.shipping.address || '';
        if (!order.shippingCity) order.shippingCity = order.shipping.city || '';
        if (!order.address) order.address = order.shipping; // legacy code expects `order.address` as object
    } else if (order.address && typeof order.address === 'string') {
        // If address is a simple string, keep shippingAddress populated
        if (!order.shippingAddress) order.shippingAddress = order.address;
        if (!order.shippingCity) order.shippingCity = order.city || '';
    }

    // Ensure `order.shipping` exists as an object with common fields so frontend can read consistently
    order.shipping = order.shipping || {};
    // Fill from possible legacy fields
    if (!order.shipping.address) {
        if (order.shippingAddress && typeof order.shippingAddress === 'string') {
            order.shipping.address = order.shippingAddress;
        } else if (order.address && typeof order.address === 'string') {
            order.shipping.address = order.address;
        } else if (order.address && typeof order.address === 'object') {
            // try common keys
            order.shipping.address = order.address.address || order.address.line1 || order.address.addressLine1 || '';
        }
    }
    if (!order.shipping.city) {
        order.shipping.city = order.shippingCity || order.city || (order.address && order.address.city) || '';
    }
    if (!order.shipping.state) {
        order.shipping.state = order.shippingState || order.state || (order.address && order.address.state) || '';
    }
    if (!order.shipping.zipcode) {
        order.shipping.zipcode = order.shippingZipcode || order.zipcode || order.postalCode || '';
    }
    if (!order.shipping.country) {
        order.shipping.country = order.shippingCountry || (order.address && order.address.country) || '';
    }

    // Ensure createdAt/updatedAt exist for legacy UI
    if (!order.createdAt && order.created_at) order.createdAt = order.created_at;
    if (!order.updatedAt && order.updated_at) order.updatedAt = order.updated_at;
    return order;
}

function generateJWT(user) {
    return jwt.sign(
        { id: user._id, email: user.email, role: user.role },
        process.env.JWT_SECRET || 'your-secret-key-change-in-production',
        { expiresIn: '24h' }
    );
}

// ==================== MIDDLEWARE: AUTHENTICATION ====================
const authMiddleware = (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || 'your-secret-key-change-in-production'
        );
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// ==================== MIDDLEWARE: ADMIN CHECK ====================
const adminMiddleware = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// ==================== FILE UPLOAD ====================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads/products');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
            console.log('📁 Created uploads/products directory');
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `product-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
        }
    }
});

// ==================== ROUTES: AUTHENTICATION ====================
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Try MongoDB first (if connected)
        if (AdminModel) {
            const admin = await AdminModel.findOne({ email: email.toLowerCase() });
            if (admin) {
                const valid = await admin.comparePassword(password);
                if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
                const token = generateJWT({ _id: admin._id.toString(), email: admin.email, role: admin.role });
                return res.json({
                    success: true,
                    token,
                    user: { id: admin._id.toString(), name: admin.name, email: admin.email, role: admin.role }
                });
            }
            // Fallthrough to file-based fallback if not found in Mongo
        }

        // Fallback: file-based admin
        const admin = database.admins.find(a => a.email === email);
        if (!admin) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isValid = await bcrypt.compare(password, admin.password);

        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = generateJWT(admin);

        res.json({
            success: true,
            token: token,
            user: {
                id: admin._id,
                name: admin.name,
                email: admin.email,
                role: admin.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, role = 'customer' } = req.body;

        // Admin registration -> use Mongo if available
        if (role === 'admin' && AdminModel) {
            const existing = await AdminModel.findOne({ email: email.toLowerCase() });
            if (existing) return res.status(400).json({ error: 'Email already exists' });
            const newAdmin = new AdminModel({ name, email: email.toLowerCase(), password, role: 'admin' });
            await newAdmin.save();
            const token = generateJWT({ _id: newAdmin._id.toString(), email: newAdmin.email, role: newAdmin.role });
            return res.json({
                success: true,
                token,
                user: { id: newAdmin._id.toString(), name: newAdmin.name, email: newAdmin.email, role: newAdmin.role }
            });
        }

        // Existing file-based user/admin registration (unchanged)
        const existingUser = database.users.find(u => u.email === email) || 
                            database.admins.find(a => a.email === email);
        if (existingUser) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            _id: generateId(),
            name,
            email,
            password: hashedPassword,
            role,
            createdAt: new Date(),
            orderCount: 0
        };

        if (role === 'admin') {
            database.admins.push(newUser);
        } else {
            database.users.push(newUser);
        }
        saveDatabase();
        const token = generateJWT(newUser);
        res.json({
            success: true,
            token: token,
            user: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// ==================== ROUTES: ADMIN DASHBOARD ====================
app.get('/api/admin/dashboard', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        console.log('\n🔵 API: /api/admin/dashboard called');

        // If Mongo is available, prefer orders from MongoDB
        if (OrderModel && mongoose.connection.readyState === 1) {
            console.log('📌 /api/admin/dashboard -> fetching orders from MongoDB');
            const orders = await OrderModel.find().sort({ createdAt: -1 }).lean();
            const totalOrders = orders.length;
            const totalSales = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

            // Prefer product/user counts from MongoDB when available
            let totalProducts = 0;
            if (ProductModel && mongoose.connection.readyState === 1) {
                try {
                    totalProducts = await ProductModel.countDocuments();
                } catch (e) {
                    console.warn('Could not count products from MongoDB, falling back to file DB:', e.message);
                    totalProducts = database.products ? database.products.length : 0;
                }
            } else {
                totalProducts = database.products ? database.products.length : 0;
            }

            let totalUsers = 0;
            try {
                if (mongoose.connection.readyState === 1) {
                    // Try to count a `users` collection in Mongo if it exists
                    const usersColl = mongoose.connection.db.collection('users');
                    if (usersColl) {
                        totalUsers = await usersColl.countDocuments();
                    } else {
                        totalUsers = database.users ? database.users.length : 0;
                    }
                } else {
                    totalUsers = database.users ? database.users.length : 0;
                }
            } catch (e) {
                console.warn('Could not count users from MongoDB, falling back to file DB:', e.message);
                totalUsers = database.users ? database.users.length : 0;
            }

            const recentOrders = orders.slice(0, 5);

            const response = {
                totalOrders,
                totalSales: parseFloat(totalSales.toFixed(2)),
                totalProducts,
                totalUsers,
                recentOrders
            };

            console.log('✅ Sending response (Mongo):', JSON.stringify({ totalOrders, totalSales }));
            return res.json(response);
        }

        // Fallback: file-based dashboard
        console.log('📌 /api/admin/dashboard -> MongoDB not available, using file DB');
        // Reload database from file to ensure fresh data
        database = loadDatabase();
        console.log('📂 Database reloaded');

        const totalOrders = database.orders ? database.orders.length : 0;
        const totalSales = database.orders ? database.orders.reduce((sum, order) => sum + (order.total || 0), 0) : 0;
        const totalProducts = database.products ? database.products.length : 0;
        const totalUsers = database.users ? database.users.length : 0;

        console.log(`📊 DASHBOARD METRICS:`);
        console.log(`   - Total Orders: ${totalOrders}`);
        console.log(`   - Total Sales: ${totalSales}`);

        // Get recent orders (sorted by date, last 5)
        const recentOrders = (database.orders || [])
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 5);

        const response = {
            totalOrders,
            totalSales: parseFloat(totalSales.toFixed(2)),
            totalProducts,
            totalUsers,
            recentOrders
        };

        console.log('✅ Sending response (file):', JSON.stringify(response));
        res.json(response);
    } catch (error) {
        console.error('❌ Dashboard error:', error);
        res.status(500).json({ error: 'Failed to load dashboard data', details: error.message });
    }
});

// ==================== ROUTES: PRODUCTS (MongoDB + Cloudinary, with file-DB fallback) ====================
try {
    const productRouter = require('./routes/products');
    app.use('/api', productRouter);
    console.log('✅ Product routes mounted at /api (products + admin/products)');
} catch (err) {
    console.warn('Product routes registration warning:', err.message);
}

// ==================== ROUTES: CATEGORIES (migrated to MongoDB) ====
try {
    const CategoryModel = require('./models/Category');
    const registerCategoryRoutes = require('./routes/categories');
    registerCategoryRoutes(app, {
        CategoryModel,
        databaseRef: database,
        saveDatabaseFn: saveDatabase,
        authMiddleware,
        adminMiddleware,
        mongoose
    });
} catch (err) {
    console.warn('Category routes registration warning:', err.message);
}

// ==================== ROUTES: ORDERS ====================
// NOTE: Admin order list and status update endpoints are implemented
// later in the file with MongoDB support. Remove older file-only
// handlers so the Mongo-aware routes take precedence.

// Provide admin helpers for order view/delete/export that prefer MongoDB
app.get('/api/admin/orders/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        if (OrderModel && mongoose.connection.readyState === 1) {
            let order = null;
            try { order = await OrderModel.findById(id).lean(); } catch (e) { /* ignore */ }
            if (!order) order = await OrderModel.findOne({ 'metadata.orderId': id }).lean();
            if (order) return res.json(normalizeOrderForLegacy(order));
        }

        database = loadDatabase();
        const order = database.orders.find(o => String(o._id) === String(req.params.id));
        if (!order) return res.status(404).json({ error: 'Order not found' });
        res.json(order);
    } catch (err) {
        console.error('Admin get order error:', err);
        res.status(500).json({ error: 'Failed to fetch order' });
    }
});

app.delete('/api/admin/orders/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        if (OrderModel && mongoose.connection.readyState === 1) {
            await OrderModel.findByIdAndDelete(id);
            return res.json({ success: true });
        }

        database = loadDatabase();
        const index = database.orders.findIndex(o => String(o._id) === String(id));
        if (index === -1) return res.status(404).json({ error: 'Order not found' });
        database.orders.splice(index, 1);
        saveDatabase();
        res.json({ success: true });
    } catch (err) {
        console.error('Admin delete order error:', err);
        res.status(500).json({ error: 'Failed to delete order' });
    }
});

app.get('/api/admin/orders/export/excel', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        let orders = [];
        if (OrderModel && mongoose.connection.readyState === 1) {
            orders = await OrderModel.find().sort({ createdAt: -1 }).lean();
        } else {
            database = loadDatabase();
            orders = database.orders || [];
        }

        const csv = 'Order ID,Customer,Total,Status,Date\n' +
            orders.map(o => `${o._id},${(o.customerName||'').replace(/\n/g,' ')},${o.total || 0},${o.status || ''},${new Date(o.createdAt||o.created_at||Date.now()).toLocaleDateString()}`).join('\n');

        res.header('Content-Type', 'text/csv');
        res.header('Content-Disposition', 'attachment; filename=orders.csv');
        res.send(csv);
    } catch (err) {
        console.error('Export error:', err);
        res.status(500).json({ error: 'Failed to export orders' });
    }
});

// ==================== ROUTES: USERS ====================
app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
    res.json(database.users);
});

app.get('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
    const user = database.users.find(u => u._id === req.params.id);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
});

app.get('/api/admin/users/:id/orders', authMiddleware, adminMiddleware, (req, res) => {
    const userOrders = database.orders.filter(o => o.customerId === req.params.id);
    res.json(userOrders);
});

// ==================== ROUTES: SETTINGS ====================
app.get('/api/admin/settings', authMiddleware, adminMiddleware, (req, res) => {
    res.json(database.settings);
});

app.post('/api/admin/settings', authMiddleware, adminMiddleware, (req, res) => {
    try {
        Object.assign(database.settings, req.body);
        res.json(database.settings);
    } catch (error) {
        console.error('Settings error:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// ==================== ROUTES: PUBLIC PRODUCTS ====================
app.get('/api/products', (req, res) => {
    // Reload database to get fresh product stock data
    database = loadDatabase();
    console.log(`🔵 API: /api/products (public) - Returning ${database.products.length} products`);
    res.json(database.products);
});

// Public categories now served by routes/categories.js

// Public users endpoint (returns non-sensitive fields only)
app.get('/api/users', (req, res) => {
    try {
        const users = database.users.map(u => ({
            _id: u._id,
            name: u.name,
            email: u.email,
            createdAt: u.createdAt,
            orderCount: u.orderCount || 0
        }));
        res.json(users);
    } catch (error) {
        console.error('Public users error:', error);
        res.status(500).json({ error: 'Failed to load users' });
    }
});

// ==================== ROUTES: CUSTOMER ORDERS ====================
// POST /api/orders - try Mongo first, fallback to file DB
app.post('/api/orders', async (req, res) => {
    try {
        const {
            customerId,
            customerName,
            customerEmail,
            customerPhone,
            items = [],
            total,
            subtotal,
            shippingCost,
            tax,
            shippingAddress,
            shippingCity,
            shippingState,
            shippingZipcode,
            shippingCountry,
            shippingArea,
            paymentMethod = 'cod',
            metadata,
            whatsappNotification
        } = req.body;

        // Normalize items
        const normalizedItems = (items || []).map(it => ({
            productId: it.id || it.productId || it._id || '',
            name: it.name || it.title || '',
            price: Number(it.price || it.unitPrice || 0),
            quantity: Number(it.quantity || it.qty || 1)
        }));

        const orderPayload = {
            customerId,
            customerName,
            customerEmail,
            customerPhone,
            items: normalizedItems,
            subtotal: Number(subtotal || normalizedItems.reduce((s,i)=>s + (i.price * i.quantity), 0)),
            shippingCost: Number(shippingCost || 0),
            tax: Number(tax || 0),
            total: Number(total || (Number(subtotal || 0) + Number(shippingCost || 0) + Number(tax || 0))),
            paymentMethod,
            status: 'pending',
            shipping: {
                address: shippingAddress,
                city: shippingCity,
                state: shippingState,
                zipcode: shippingZipcode,
                country: shippingCountry,
                area: shippingArea
            },
            metadata: metadata || {}
        };

        // If Mongo is connected and OrderModel exists, save to Mongo
        if (OrderModel && mongoose.connection.readyState === 1) {
            console.log('📌 POST /api/orders -> saving to MongoDB');
            const saved = await OrderModel.create(orderPayload);

            // Fallback stock updates: if you haven't migrated Product to Mongo,
            // still decrement stock in file DB to keep current product flow intact.
            if (normalizedItems.length && Array.isArray(database.products)) {
                normalizedItems.forEach(orderItem => {
                    const product = database.products.find(p => String(p._id) === String(orderItem.productId));
                    if (product) {
                        product.stock = Math.max(0, (product.stock || 0) - (orderItem.quantity || 1));
                    }
                });
                saveDatabase();
            }

            // Optionally send WhatsApp or other notifications here (left unchanged)

            return res.status(201).json({ success: true, order: saved });
        }

        // --- Fallback to file-based DB (preserve existing behavior) ---
        console.log('📌 POST /api/orders -> MongoDB not available, saving to file DB fallback');
        const newOrder = {
            _id: 'ORD' + Date.now(),
            customerId: orderPayload.customerId,
            customerName: orderPayload.customerName,
            customerEmail: orderPayload.customerEmail,
            customerPhone: orderPayload.customerPhone,
            items: orderPayload.items,
            subtotal: orderPayload.subtotal,
            shippingCost: orderPayload.shippingCost,
            tax: orderPayload.tax,
            total: orderPayload.total,
            paymentMethod: orderPayload.paymentMethod,
            status: orderPayload.status,
            shippingAddress: orderPayload.shipping.address,
            shippingCity: orderPayload.shipping.city,
            createdAt: new Date(),
            updatedAt: new Date(),
            metadata: orderPayload.metadata
        };

        // Reduce stock in file DB (existing behavior)
        if (newOrder.items && newOrder.items.length) {
            newOrder.items.forEach(orderItem => {
                const product = database.products.find(p => String(p._id) === String(orderItem.productId) || String(p._id) === String(orderItem.id));
                if (product) product.stock = Math.max(0, (product.stock || 0) - (orderItem.quantity || 1));
            });
        }

        database.orders.push(newOrder);
        saveDatabase();

        return res.status(201).json({ success: true, order: newOrder });
    } catch (error) {
        console.error('Order creation error:', error);
        return res.status(500).json({ error: 'Failed to create order', details: error.message });
    }
});

app.get('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // Try Mongo first
        if (OrderModel && mongoose.connection.readyState === 1) {
            let order = null;
            // attempt by ObjectId
            try { order = await OrderModel.findById(id).lean(); } catch (e) { /* ignore invalid ObjectId */ }
            if (!order) {
                order = await OrderModel.findOne({ 'metadata.orderId': id }).lean();
            }
            if (order) return res.json(order);
        }

        // Fallback to file DB
        const order = database.orders.find(o => String(o._id) === String(id));
        if (!order) return res.status(404).json({ error: 'Order not found' });
        return res.json(order);
    } catch (err) {
        console.error('Get order error:', err);
        return res.status(500).json({ error: 'Failed to fetch order' });
    }
});

// ==================== ADMIN ORDER ROUTES ====================
// List all orders (admin only)
app.get('/api/admin/orders', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        if (OrderModel && mongoose.connection.readyState === 1) {
            const orders = await OrderModel.find().sort({ createdAt: -1 }).lean();
            console.log('📦 /api/admin/orders -> Mongo returned', Array.isArray(orders) ? orders.length : '??', 'orders');
            // normalize to legacy shape expected by admin UI
            const mapped = orders.map(o => normalizeOrderForLegacy(o));
            return res.json(mapped);
        }
        database = loadDatabase();
        const orders = (database.orders || []).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
        return res.json(orders);
    } catch (err) {
        console.error('Admin list orders error:', err);
        res.status(500).json({ error: 'Failed to list orders' });
    }
});

// Update order status (admin only)
app.patch('/api/admin/orders/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'Status required' });

        if (OrderModel && mongoose.connection.readyState === 1) {
            const updated = await OrderModel.findByIdAndUpdate(id, { status, updatedAt: new Date() }, { new: true }).lean();
            if (updated) return res.json({ success: true, order: updated });
        }

        // fallback file DB
        database = loadDatabase();
        const idx = database.orders.findIndex(o => String(o._id) === String(id));
        if (idx === -1) return res.status(404).json({ error: 'Order not found' });
        database.orders[idx].status = status;
        database.orders[idx].updatedAt = new Date();
        saveDatabase();
        res.json({ success: true, order: database.orders[idx] });
    } catch (err) {
        console.error('Update order status error:', err);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// PATCH /api/admin/orders/:id - update order (compat for admin UI)
app.patch('/api/admin/orders/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'Status required' });

        if (OrderModel && mongoose.connection.readyState === 1) {
            const updated = await OrderModel.findByIdAndUpdate(id, { status, updatedAt: new Date() }, { new: true }).lean();
            if (updated) return res.json(updated);
        }

        // fallback file DB
        database = loadDatabase();
        const idx = database.orders.findIndex(o => String(o._id) === String(id));
        if (idx === -1) return res.status(404).json({ error: 'Order not found' });
        database.orders[idx].status = status;
        database.orders[idx].updatedAt = new Date();
        saveDatabase();
        res.json(database.orders[idx]);
    } catch (err) {
        console.error('Update order error (compat):', err);
        res.status(500).json({ error: 'Failed to update order' });
    }
});

// ==================== ERROR HANDLING ====================
// Handle multer errors
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File size exceeds 5MB limit' });
        }
        console.error('Multer error:', err);
        return res.status(400).json({ error: 'File upload error: ' + err.message });
    } else if (err && err.message) {
        console.error('File validation error:', err.message);
        return res.status(400).json({ error: err.message });
    }
    next(err);
});

app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ==================== SERVER START ====================
// Root health endpoint - helpful for platforms and browser checks
app.get('/', (req, res) => {
    res.json({ ok: true, message: "Evan backend running", statusEndpoint: '/api/status' });
});

// Readiness probe for load balancers / orchestrators
app.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

app.get('/api/status', async (req, res) => {
    try {
        // Prefer MongoDB counts when connected and models are available
        if (mongoose.connection.readyState === 1) {
            let productsCount = 0;
            let categoriesCount = 0;

            try {
                if (ProductModel && typeof ProductModel.countDocuments === 'function') {
                    productsCount = await ProductModel.countDocuments();
                } else {
                    // try collection fallback
                    const prodColl = mongoose.connection.db.collection('products');
                    productsCount = prodColl ? await prodColl.countDocuments() : (database.products ? database.products.length : 0);
                }
            } catch (e) {
                productsCount = database.products ? database.products.length : 0;
            }

            try {
                const catColl = mongoose.connection.db.collection('categories');
                categoriesCount = catColl ? await catColl.countDocuments() : (database.categories ? database.categories.length : 0);
            } catch (e) {
                categoriesCount = database.categories ? database.categories.length : 0;
            }

            const uploadedFiles = fs.existsSync(path.join(__dirname, 'uploads/products'))
                ? fs.readdirSync(path.join(__dirname, 'uploads/products'))
                : [];

            return res.json({
                status: 'online',
                productsCount,
                categoriesCount,
                uploadsDir: path.join(__dirname, 'uploads/products'),
                uploadedFiles
            });
        }

        // Fallback to file DB
        return res.json({
            status: 'online',
            productsCount: database.products.length,
            categoriesCount: database.categories.length,
            uploadsDir: path.join(__dirname, 'uploads/products'),
            uploadedFiles: fs.existsSync(path.join(__dirname, 'uploads/products'))
                ? fs.readdirSync(path.join(__dirname, 'uploads/products'))
                : []
        });
    } catch (err) {
        console.error('/api/status error:', err);
        res.status(500).json({ error: 'Failed to fetch status' });
    }
});

// 404 fallback - must come after all route definitions
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════════════╗
    ║  🍫 Evan's Bakery Admin Server Started     ║
    ║  Server: http://localhost:${PORT}          ║
    ║  Environment: ${process.env.NODE_ENV || 'development'} ║
    ║  Admin Login:                              ║
    ║  - Contact Email: rhs0@yahoo.com           ║
    ╚═══════════════════════════════════════════╝
    `);
});

module.exports = app;
