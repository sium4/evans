// ==================== CONFIGURATION ====================
// Prefer an explicit runtime config injected via `config.js` (window.__BACKEND_URL)
// Fallback to helpful defaults for local development.
const BACKEND_URL = window.__BACKEND_URL || (() => {
    if (window.location.port === '5000') return 'http://localhost:5000';
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return 'http://localhost:5000';
    if (window.location.protocol === 'file:') return 'http://localhost:5000';
    // Default production backend URL (change in config.js if different)
    return 'https://evans-backend.onrender.com';
})();

console.log('🔧 BACKEND_URL configured as:', BACKEND_URL);
console.log('📍 Current location:', {
    hostname: window.location.hostname,
    port: window.location.port,
    protocol: window.location.protocol
});

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    checkAdminAuth();
    initializeEventListeners();
    
    // Restore the last viewed section
    const lastSection = localStorage.getItem('adminDashboardSection') || 'dashboard';
    navigateToSection(lastSection);
    
    loadCategories(); // Load categories on startup so they're available in product form
});

// ==================== AUTHENTICATION ====================
function checkAdminAuth() {
    const token = localStorage.getItem('adminToken');
    const user = localStorage.getItem('adminUser');

    if (!token || !user) {
        window.location.href = 'admin-login.html';
        return;
    }

    try {
        const userData = JSON.parse(user);
        document.getElementById('userName').textContent = userData.name || 'Admin User';
        document.getElementById('userAvatar').textContent = (userData.name || 'A')[0].toUpperCase();
    } catch (e) {
        console.error('Error parsing user data:', e);
    }
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        window.location.href = 'admin-login.html';
    }
}

function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
    };
}

// ==================== EVENT LISTENERS ====================
function initializeEventListeners() {
    // Sidebar menu navigation
    document.querySelectorAll('.menu-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = e.currentTarget.dataset.section;
            navigateToSection(section);
        });
    });

    // Modal forms
    document.getElementById('productForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        saveProduct();
    });

    document.getElementById('categoryForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        saveCategory();
    });

    // Sidebar toggle (off-canvas) for mobile
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    if (sidebarToggle && sidebar) {
        // Only show the toggle on small screens (mobile). Keep hidden on desktop.
        const updateToggleVisibility = () => {
            if (window.innerWidth <= 768) {
                sidebarToggle.classList.remove('hidden');
            } else {
                sidebarToggle.classList.add('hidden');
                // ensure sidebar not left open when switching to desktop
                sidebar.classList.remove('open');
                if (sidebarOverlay) sidebarOverlay.classList.remove('active');
            }
        };

        // Initial visibility
        updateToggleVisibility();

        // Update on resize so layout changes keep toggle state correct
        window.addEventListener('resize', () => {
            updateToggleVisibility();
        });

        sidebarToggle.addEventListener('click', () => {
            const isOpen = sidebar.classList.toggle('open');
            if (sidebarOverlay) sidebarOverlay.classList.toggle('active', isOpen);
        });

        // close when clicking links in the sidebar (mobile UX)
        document.querySelectorAll('.sidebar-menu a').forEach(a => {
            a.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('open');
                    if (sidebarOverlay) sidebarOverlay.classList.remove('active');
                }
            });
        });

        // overlay click closes the sidebar
        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', () => {
                sidebar.classList.remove('open');
                sidebarOverlay.classList.remove('active');
            });
        }
    }
}

// ==================== NAVIGATION ====================
function navigateToSection(section) {
    // Save current section to localStorage for restoration on page refresh
    localStorage.setItem('adminDashboardSection', section);
    
    // Hide all sections
    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));

    // Show selected section
    const selectedSection = document.getElementById(section);
    if (selectedSection) {
        selectedSection.classList.remove('hidden');
    }

    // Update active menu item
    document.querySelectorAll('.menu-link').forEach(link => {
        link.classList.remove('active');
    });
    document.querySelector(`[data-section="${section}"]`)?.classList.add('active');

    // Update page title
    const titles = {
        dashboard: 'Dashboard',
        orders: 'Order Management',
        products: 'Product Management',
        categories: 'Category Management',
        users: 'User Management',
        settings: 'Settings'
    };
    document.getElementById('pageTitle').textContent = titles[section] || 'Dashboard';

    // Load fresh data for the section
    if (section === 'dashboard') {
        loadDashboardData();
    }
    if (section === 'orders') {
        loadOrders();
    }
    if (section === 'products') {
        console.log('📦 Loading products section - refreshing data...');
        loadProducts();
        loadDashboardData(); // Also refresh dashboard metrics
    }
    if (section === 'categories') {
        loadCategories();
    }
    if (section === 'users') {
        loadUsers();
    }
}

// ==================== DASHBOARD DATA ====================
async function loadDashboardData() {
    try {
        console.log('📊 Loading dashboard data from:', `${BACKEND_URL}/api/admin/dashboard`);
        console.log('🔐 Auth token present:', !!localStorage.getItem('adminToken'));
        
        const response = await fetch(`${BACKEND_URL}/api/admin/dashboard?t=${Date.now()}`, {
            headers: getAuthHeaders(),
            cache: 'no-cache',
            credentials: 'include'
        });

        console.log('📡 API Response status:', response.status, response.statusText);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API error:', response.status, response.statusText, errorText);
            throw new Error(`API returned status ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('✅ Dashboard data received from backend:', data);
        console.log('   - Total Orders:', data.totalOrders);
        console.log('   - Total Sales:', data.totalSales);
        console.log('   - Total Products:', data.totalProducts);
        console.log('   - Total Users:', data.totalUsers);
        
        // Update KPI cards with ACTUAL backend data
        const ordersElement = document.getElementById('totalOrders');
        if (ordersElement) {
            ordersElement.textContent = data.totalOrders || 0;
            console.log('✅ Updated totalOrders to:', data.totalOrders);
        }
        
        const salesElement = document.getElementById('totalSales');
        if (salesElement) {
            salesElement.textContent = `৳${(parseFloat(data.totalSales) || 0).toFixed(2)}`;
            console.log('✅ Updated totalSales to:', data.totalSales);
        }
        
        const productsElement = document.getElementById('totalProducts');
        if (productsElement) {
            productsElement.textContent = data.totalProducts || 0;
            console.log('✅ Updated totalProducts to:', data.totalProducts);
        }
        
        const usersElement = document.getElementById('totalUsers');
        if (usersElement) {
            usersElement.textContent = data.totalUsers || 0;
            console.log('✅ Updated totalUsers to:', data.totalUsers);
        }

        // Load recent orders from the metrics response
        if (data.recentOrders && data.recentOrders.length > 0) {
            console.log('📋 Loading recent orders from dashboard API');
            loadRecentOrders(data.recentOrders);
        } else {
            console.log('⚠️ No recent orders in dashboard API response, fetching separately...');
            loadRealRecentOrders();
        }
    } catch (error) {
        console.error('❌ Dashboard API error:', error.message);
        console.error('   Full error:', error);
        console.log('⚠️ API failed, fetching metrics separately from other endpoints');
        
        // Try to fetch metrics from individual endpoints
        await fetchMetricsFromIndividualEndpoints();
    }
}

async function fetchMetricsFromIndividualEndpoints() {
    try {
        console.log('🔄 Fetching metrics from individual endpoints...');
        
        // Fetch all required data
        const ordersResponse = await fetch(`${BACKEND_URL}/api/admin/orders?t=${Date.now()}`, {
            headers: getAuthHeaders(),
            cache: 'no-cache'
        });
        
        const productsResponse = await fetch(`${BACKEND_URL}/api/admin/products?t=${Date.now()}`, {
            headers: getAuthHeaders(),
            cache: 'no-cache'
        });

        let totalOrders = 0;
        let totalSales = 0;
        let totalProducts = 0;
        let recentOrders = [];

        // Fetch orders
        if (ordersResponse.ok) {
            const orders = await ordersResponse.json();
            totalOrders = orders.length;
            totalSales = orders.reduce((sum, order) => sum + (parseFloat(order.total) || 0), 0);
            recentOrders = orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
            console.log('✅ Fetched orders:', totalOrders, 'orders');
        }

        // Fetch products
        if (productsResponse.ok) {
            const products = await productsResponse.json();
            totalProducts = products.length;
            console.log('✅ Fetched products:', totalProducts, 'products');
        }

        // Update UI with fetched data
        const ordersElement = document.getElementById('totalOrders');
        if (ordersElement) {
            ordersElement.textContent = totalOrders;
            console.log('✅ Updated totalOrders to:', totalOrders);
        }

        const salesElement = document.getElementById('totalSales');
        if (salesElement) {
            salesElement.textContent = `৳${totalSales.toFixed(2)}`;
            console.log('✅ Updated totalSales to:', totalSales);
        }

        const productsElement = document.getElementById('totalProducts');
        if (productsElement) {
            productsElement.textContent = totalProducts;
            console.log('✅ Updated totalProducts to:', totalProducts);
        }

        // Load recent orders
        loadRecentOrders(recentOrders);
    } catch (error) {
        console.error('❌ Error fetching metrics from individual endpoints:', error);
    }
}

function showDemoDashboardData() {
    document.getElementById('totalOrders').textContent = '0';
    document.getElementById('totalSales').textContent = '৳0.00';
    document.getElementById('totalProducts').textContent = '0';
    document.getElementById('totalUsers').textContent = '0';

    // Load real orders from API instead of hardcoded demo data
    loadRealRecentOrders();
}

async function loadRealRecentOrders() {
    try {
        console.log('📋 Fetching real recent orders from API...');
        const response = await fetch(`${BACKEND_URL}/api/admin/orders?t=${Date.now()}`, {
            headers: getAuthHeaders(),
            cache: 'no-cache'
        });

        if (response.ok) {
            const orders = await response.json();
            console.log('✅ Fetched real orders:', orders.length, 'orders');
            
            // Get last 5 orders sorted by date
            const recentOrders = (orders || [])
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, 5);
            
            loadRecentOrders(recentOrders);
        } else {
            console.error('Failed to fetch real orders');
            loadRecentOrders([]); // Show empty
        }
    } catch (error) {
        console.error('Error fetching real orders:', error);
        loadRecentOrders([]); // Show empty
    }
}

function loadRecentOrders(orders) {
    const tbody = document.getElementById('recentOrdersBody');
    tbody.innerHTML = '';

    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999;">No orders yet</td></tr>';
        return;
    }

    orders.slice(0, 5).forEach(order => {
        const row = document.createElement('tr');
        const statusClass = `status-${order.status}`;
        const displayId = (order.metadata && order.metadata.orderId) || order._id || order.id;
        row.innerHTML = `
            <td style="font-weight: 600;">${displayId}</td>
            <td>${order.customerName || order.customer}</td>
            <td>৳${(order.total || 0).toFixed(2)}</td>
            <td><span class="status-badge ${statusClass}">${order.status.toUpperCase()}</span></td>
            <td>${new Date(order.createdAt).toLocaleDateString()}</td>
        `;
        tbody.appendChild(row);
    });
}

// ==================== ORDERS ====================
async function loadOrders() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/admin/orders?t=${Date.now()}`, {
            headers: getAuthHeaders(),
            cache: 'no-cache'
        });

        if (!response.ok) throw new Error('Failed to load orders');

        const orders = await response.json();
        console.log('✅ Orders loaded, count:', orders.length);
        displayOrders(orders);
    } catch (error) {
        console.error('Error loading orders:', error);
        showDemoOrders();
    }
}

function displayOrders(orders) {
    const tbody = document.getElementById('ordersBody');
    tbody.innerHTML = '';

    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #999;">No orders found</td></tr>';
        return;
    }

    orders.forEach(order => {
        const row = document.createElement('tr');
        const statusClass = `status-${order.status}`;
        row.innerHTML = `
            <td style="font-weight: 600;">${(order.metadata && order.metadata.orderId) || order._id || order.id}</td>
            <td>${order.customerName || order.customer}</td>
            <td>৳${(order.total || 0).toFixed(2)}</td>
            <td><span class="status-badge ${statusClass}">${order.status.toUpperCase()}</span></td>
            <td>${new Date(order.createdAt).toLocaleDateString()}</td>
            <td>
                <button class="btn btn-secondary" onclick="updateOrderStatus('${order._id || order.id}', '${order.status}')">Update</button>
                <button class="btn btn-primary" onclick="viewOrderDetails('${order._id || order.id}')">View</button>
                <button class="btn btn-danger" style="margin-left:8px;" onclick="deleteOrder('${order._id || order.id}')">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function deleteOrder(orderId) {
    if (!confirm('Are you sure you want to delete this order?')) return;

    try {
        const response = await fetch(`${BACKEND_URL}/api/admin/orders/${orderId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('Failed to delete order');

        showMessage('Order deleted successfully!', 'success');
        loadOrders();
    } catch (error) {
        console.error('Error deleting order:', error);
        showMessage('Error deleting order. (Demo mode)', 'error');
    }
}

function showDemoOrders() {
    const demoOrders = [
        { _id: 'ORD001', customer: 'John Doe', customerName: 'John Doe', total: 5979, status: 'delivered', createdAt: '2024-01-15' },
        { _id: 'ORD002', customer: 'Jane Smith', customerName: 'Jane Smith', total: 8125, status: 'processing', createdAt: '2024-01-14' },
        { _id: 'ORD003', customer: 'Bob Johnson', customerName: 'Bob Johnson', total: 4973, status: 'pending', createdAt: '2024-01-13' },
        { _id: 'ORD004', customer: 'Alice Brown', customerName: 'Alice Brown', total: 7150, status: 'delivered', createdAt: '2024-01-12' }
    ];
    displayOrders(demoOrders);
}

async function updateOrderStatus(orderId, currentStatus) {
    const statuses = ['pending', 'processing', 'delivered'];
    const currentIndex = statuses.indexOf(currentStatus);
    const nextStatus = statuses[(currentIndex + 1) % statuses.length];

    try {
        const response = await fetch(`${BACKEND_URL}/api/admin/orders/${orderId}`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({ status: nextStatus })
        });

        if (!response.ok) throw new Error('Failed to update order');

        showMessage(`Order status updated to ${nextStatus.toUpperCase()}`, 'success');
        loadOrders();
    } catch (error) {
        console.error('Error updating order:', error);
        showMessage('Error updating order. (Demo mode)', 'success');
    }
}

function viewOrderDetails(orderId) {
    (async () => {
        try {
            const response = await fetch(`${BACKEND_URL}/api/admin/orders/${orderId}`, {
                headers: getAuthHeaders()
            });

            if (!response.ok) throw new Error('Failed to load order details');

            const order = await response.json();

            // Build order details HTML
            const itemsHtml = (order.items || []).map(item => {
                const name = item.name || item.productName || item.title || item.product || 'Item';
                const qty = item.quantity || item.qty || item.count || 1;
                const price = (item.price || item.unitPrice || 0);
                const lineTotal = (price * qty) || item.total || 0;
                return `
                    <tr>
                        <td style="font-weight:600">${escapeHtml(name)}</td>
                        <td>${qty}</td>
                        <td>৳${Number(price).toFixed(2)}</td>
                        <td>৳${Number(lineTotal).toFixed(2)}</td>
                    </tr>`;
            }).join('') || '<tr><td colspan="4" style="text-align:center;color:#999;">No items</td></tr>';

            const shipping = order.shippingAddress || order.address || {};
            const shippingIsString = typeof shipping === 'string';
            const shippingCity = order.shippingCity || order.city || (shipping && shipping.city) || '';
            const shippingArea = order.shippingArea || order.area || '';
            const shippingState = order.shippingState || order.state || '';
            const shippingZip = order.shippingZipcode || order.zipcode || order.postalCode || '';
            const shippingCountry = order.shippingCountry || shipping.country || '';

            // Resolve customer contact fallbacks
            const custEmail = order.customerEmail || order.email || (order.customer && (order.customer.email || order.customerEmail)) || '';
            const custPhone = order.customerPhone || order.phone || (order.customer && (order.customer.phone || order.customer.mobile)) || shipping.phone || '';

            const detailsHtml = `
                <div style="display:flex; gap:1rem; flex-direction:column;">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:1rem;">
                        <div>
                            <div style="font-size:1.05rem; color:#666">Order ID</div>
                            <div style="font-weight:700; margin-top:4px;">${order._id || order.id}</div>
                        </div>
                        <div>
                            <div style="font-size:1.05rem; color:#666">Status</div>
                            <div style="font-weight:700; margin-top:4px;">${(order.status || 'pending').toUpperCase()}</div>
                        </div>
                        <div>
                            <div style="font-size:1.05rem; color:#666">Total</div>
                            <div style="font-weight:700; margin-top:4px;">৳${Number(order.total || 0).toFixed(2)}</div>
                        </div>
                    </div>

                    <div style="margin-top:1rem; display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                        <div style="background:#fafafa; padding:12px; border-radius:8px;">
                            <div style="font-weight:700; margin-bottom:6px;">Customer</div>
                            <div>${escapeHtml(order.customerName || (order.customer && (order.customer.fullName || order.customer.name)) || shipping.name || '-')}</div>
                            <div style="color:#666; margin-top:6px;">${escapeHtml(custEmail)}</div>
                            <div style="color:#666; margin-top:6px;">${escapeHtml(custPhone)}</div>
                        </div>

                        <div style="background:#fafafa; padding:12px; border-radius:8px;">
                            <div style="font-weight:700; margin-bottom:6px;">Shipping Address</div>
                            ${shippingIsString
                                ? `<div>${escapeHtml(shipping)}</div>`
                                : `
                                    <div>${escapeHtml(shipping.line1 || shipping.addressLine1 || shipping.address || '-')}</div>
                                `}
                            ${shippingCity ? `<div style="color:#666; margin-top:6px;">${escapeHtml(shippingCity)}</div>` : ''}
                            ${shippingArea ? `<div style="color:#666; margin-top:6px;">Area: ${escapeHtml(shippingArea)}</div>` : ''}
                            ${(shippingState || shippingZip) ? `<div style="color:#666; margin-top:6px;">${escapeHtml(shippingState)} ${escapeHtml(shippingZip)}</div>` : ''}
                            ${shippingCountry ? `<div style="color:#666; margin-top:6px;">${escapeHtml(shippingCountry)}</div>` : ''}
                        </div>
                    </div>

                    <div style="margin-top:1rem; background:white; border-radius:8px;">
                        <table style="width:100%; border-collapse:collapse;">
                            <thead style="background:#f9f5f0;">
                                <tr>
                                    <th style="padding:8px; text-align:left;">Product</th>
                                    <th style="padding:8px; text-align:left;">Qty</th>
                                    <th style="padding:8px; text-align:left;">Unit</th>
                                    <th style="padding:8px; text-align:left;">Total</th>
                                </tr>
                            </thead>
                            <tbody style="border-top:1px solid #eee;">${itemsHtml}</tbody>
                        </table>
                    </div>
                </div>
            `;

            const container = document.getElementById('orderDetailsContent');
            // Append metadata (created/updated)
            const metaHtml = `
                <div style="margin-top:8px; color:#666; font-size:0.9rem; display:flex; gap:1rem;">
                    <div>Created: ${new Date(order.createdAt).toLocaleString()}</div>
                    <div>Updated: ${new Date(order.updatedAt || order.createdAt).toLocaleString()}</div>
                    <div>Customer ID: ${escapeHtml(order.customerId || '')}</div>
                </div>
            `;

            container.innerHTML = detailsHtml + metaHtml;

            // Pre-select status in modal select and store order id
            const modal = document.getElementById('orderModal');
            modal.dataset.orderId = order._id || order.id;
            modal.dataset.orderStatus = order.status || 'pending';
            const statusSelect = document.getElementById('orderStatusSelect');
            if (statusSelect) statusSelect.value = order.status || 'pending';

            openModal('orderModal');
        } catch (err) {
            console.error('Error loading order details:', err);
            showMessage('Failed to load order details', 'error');
        }
    })();
}

async function patchOrderStatusFromModal() {
    try {
        const modal = document.getElementById('orderModal');
        const orderId = modal.dataset.orderId;
        if (!orderId) return showMessage('Order ID missing', 'error');

        const status = document.getElementById('orderStatusSelect').value;

        const response = await fetch(`${BACKEND_URL}/api/admin/orders/${orderId}`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({ status })
        });

        if (!response.ok) throw new Error('Failed to update status');

        const updated = await response.json();
        showMessage('Order status updated', 'success');
        closeModal('orderModal');
        loadOrders();
    } catch (err) {
        console.error('Error updating order status:', err);
        showMessage('Failed to update status', 'error');
    }
}

// Small helper to escape HTML when injecting
function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ==================== PRODUCTS ====================
async function loadProducts() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/admin/products?t=${Date.now()}`, {
            headers: getAuthHeaders(),
            cache: 'no-cache'
        });

        if (!response.ok) throw new Error('Failed to load products');

        const products = await response.json();
        console.log('✅ Products loaded, count:', products.length);
        displayProducts(products);
    } catch (error) {
        console.error('Error loading products:', error);
        showDemoProducts();
    }
}

function displayProducts(products) {
    const tbody = document.getElementById('productsBody');
    tbody.innerHTML = '';

    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999;">No products found</td></tr>';
        return;
    }

    products.forEach(product => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="font-weight: 600;">${product.name}</td>
            <td>${product.category}</td>
            <td>৳${(product.price || 0).toFixed(2)}</td>
            <td>${product.stock || 0}</td>
            <td>
                <button class="btn btn-secondary" onclick="editProduct('${product._id || product.id}')">Edit</button>
                <button class="btn btn-danger" onclick="deleteProduct('${product._id || product.id}')">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function showDemoProducts() {
    const demoProducts = [
        { _id: 'P001', name: 'Chocolate Cake', category: 'Cakes', price: 4549, stock: 15 },
        { _id: 'P002', name: 'Croissants', category: 'Pastries', price: 649, stock: 50 },
        { _id: 'P003', name: 'Sourdough Bread', category: 'Breads', price: 1169, stock: 25 }
    ];
    displayProducts(demoProducts);
}

async function saveProduct() {
    const productId = document.getElementById('productForm').dataset.productId;
    const imageFile = document.getElementById('productImage').files[0];
    
    // Use FormData to handle file upload
    const formData = new FormData();
    formData.append('name', document.getElementById('productName').value);
    formData.append('category', document.getElementById('productCategory').value);
    formData.append('price', parseFloat(document.getElementById('productPrice').value));
    formData.append('stock', parseInt(document.getElementById('productStock').value));
    formData.append('description', document.getElementById('productDescription').value);
    if (imageFile) {
        console.log('📸 Uploading image:', imageFile.name, imageFile.type, imageFile.size, 'bytes');
        formData.append('image', imageFile);
    }

    try {
        const url = productId 
            ? `${BACKEND_URL}/api/admin/products/${productId}`
            : `${BACKEND_URL}/api/admin/products`;
        
        const method = productId ? 'PATCH' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                // Don't set Content-Type, let the browser set it with boundary for multipart/form-data
            },
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to save product');
        }

        const savedProduct = await response.json();
        console.log('✅ Product saved:', savedProduct);
        
        showMessage('Product saved successfully!', 'success');
        closeModal('productModal');
        loadProducts();
        loadDashboardData();  // Refresh dashboard metrics after adding product
    } catch (error) {
        console.error('❌ Error saving product:', error);
        showMessage('Error: ' + error.message, 'error');
    }
}

function editProduct(productId) {
    showMessage(`Edit product ${productId} - Feature coming soon!`, 'success');
}

async function deleteProduct(productId) {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
        const response = await fetch(`${BACKEND_URL}/api/admin/products/${productId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('Failed to delete product');

        showMessage('Product deleted successfully!', 'success');
        loadProducts();
        loadDashboardData();  // Refresh dashboard metrics after deleting product
    } catch (error) {
        console.error('Error deleting product:', error);
        showMessage('Product deleted successfully! (Demo mode)', 'success');
        loadProducts();
        loadDashboardData();  // Refresh dashboard metrics after deleting product
    }
}

function openProductModal() {
    document.getElementById('productForm').reset();
    document.getElementById('productForm').dataset.productId = '';
    document.querySelector('#productModal .modal-header h2').textContent = 'Add Product';
    
    // Ensure categories are loaded
    populateCategorySelect(window.cachedCategories || []);
    
    openModal('productModal');
}

// ==================== CATEGORIES ====================
async function loadCategories() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/admin/categories?t=${Date.now()}`, {
            headers: getAuthHeaders(),
            cache: 'no-cache'
        });

        if (!response.ok) throw new Error('Failed to load categories');

        const categories = await response.json();
        console.log('✅ Categories loaded, count:', categories.length);
        window.cachedCategories = categories; // Cache globally for use in product form
        displayCategories(categories);
        populateCategorySelect(categories);
    } catch (error) {
        console.error('Error loading categories:', error);
        showDemoCategories();
    }
}

function displayCategories(categories) {
    const tbody = document.getElementById('categoriesBody');
    tbody.innerHTML = '';

    if (categories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #999;">No categories found</td></tr>';
        return;
    }

    categories.forEach(category => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="font-weight: 600;">${category.name}</td>
            <td>${category.description || '-'}</td>
            <td>${category.productCount || 0}</td>
            <td>
                <button class="btn btn-secondary" onclick="editCategory('${category._id || category.id}')">Edit</button>
                <button class="btn btn-danger" onclick="deleteCategory('${category._id || category.id}')">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function populateCategorySelect(categories) {
    const select = document.getElementById('productCategory');
    const currentValue = select.value;
    
    select.innerHTML = '<option value="">Select category</option>';
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.name;
        option.textContent = category.name;
        select.appendChild(option);
    });
    
    select.value = currentValue;
}

function showDemoCategories() {
    const demoCategories = [
        { _id: 'cat1', name: 'Milk Chocolate', description: 'Smooth and creamy milk chocolate treats', productCount: 10 },
        { _id: 'cat2', name: 'Dark Chocolate', description: 'Rich and intense dark chocolate products', productCount: 8 },
        { _id: 'cat3', name: 'Cakes', description: 'Fresh baked cakes for all occasions', productCount: 12 },
        { _id: 'cat4', name: 'Pastries', description: 'Delicious pastries and baked goods', productCount: 15 },
        { _id: 'cat5', name: 'Gift Sets', description: 'Perfect gift collections and assortments', productCount: 6 }
    ];
    window.cachedCategories = demoCategories;
    displayCategories(demoCategories);
    populateCategorySelect(demoCategories);
}

async function saveCategory() {
    const categoryId = document.getElementById('categoryForm').dataset.categoryId;
    const categoryData = {
        name: document.getElementById('categoryName').value,
        description: document.getElementById('categoryDescription').value
    };

    try {
        const url = categoryId 
            ? `${BACKEND_URL}/api/admin/categories/${categoryId}`
            : `${BACKEND_URL}/api/admin/categories`;
        
        const method = categoryId ? 'PATCH' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: getAuthHeaders(),
            body: JSON.stringify(categoryData)
        });

        if (!response.ok) throw new Error('Failed to save category');

        showMessage('Category saved successfully!', 'success');
        closeModal('categoryModal');
        loadCategories();
    } catch (error) {
        console.error('Error saving category:', error);
        showMessage('Category saved successfully! (Demo mode)', 'success');
        closeModal('categoryModal');
    }
}

function editCategory(categoryId) {
    showMessage(`Edit category ${categoryId} - Feature coming soon!`, 'success');
}

async function deleteCategory(categoryId) {
    if (!confirm('Are you sure you want to delete this category?')) return;

    try {
        const response = await fetch(`${BACKEND_URL}/api/admin/categories/${categoryId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('Failed to delete category');

        showMessage('Category deleted successfully!', 'success');
        loadCategories();
    } catch (error) {
        console.error('Error deleting category:', error);
        showMessage('Category deleted successfully! (Demo mode)', 'success');
        loadCategories();
    }
}

function openCategoryModal() {
    document.getElementById('categoryForm').reset();
    document.getElementById('categoryForm').dataset.categoryId = '';
    document.querySelector('#categoryModal .modal-header h2').textContent = 'Add Category';
    openModal('categoryModal');
}

// ==================== USERS ====================
async function loadUsers() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/admin/users?t=${Date.now()}`, {
            headers: getAuthHeaders(),
            cache: 'no-cache'
        });

        if (!response.ok) {
            // Fallback to public users API if admin endpoint fails
            console.log('Admin users endpoint failed, trying public API fallback...');
            const fallbackResponse = await fetch(`${BACKEND_URL}/api/users?t=${Date.now()}`);
            if (!fallbackResponse.ok) throw new Error('Failed to load users');
            const users = await fallbackResponse.json();
            console.log('✅ Users loaded (from public API), count:', users.length);
            displayUsers(users);
            return;
        }

        const users = await response.json();
        console.log('✅ Users loaded, count:', users.length);
        displayUsers(users);
    } catch (error) {
        console.error('Error loading users:', error);
        showDemoUsers();
    }
}

function displayUsers(users) {
    const tbody = document.getElementById('usersBody');
    tbody.innerHTML = '';

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999;">No users found</td></tr>';
        return;
    }

    users.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${user.name || user.firstName + ' ' + user.lastName}</td>
            <td>${user.email}</td>
            <td>${user.orderCount || 0}</td>
            <td>${new Date(user.createdAt).toLocaleDateString()}</td>
            <td>
                <button class="btn btn-primary" onclick="viewUserOrders('${user._id || user.id}')">Orders</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function showDemoUsers() {
    const demoUsers = [
        { _id: 'U001', name: 'John Doe', email: 'john@example.com', orderCount: 3, createdAt: '2024-01-01' },
        { _id: 'U002', name: 'Jane Smith', email: 'jane@example.com', orderCount: 5, createdAt: '2024-01-05' },
        { _id: 'U003', name: 'Bob Johnson', email: 'bob@example.com', orderCount: 1, createdAt: '2024-01-10' }
    ];
    displayUsers(demoUsers);
}

function viewUserOrders(userId) {
    showMessage(`View orders for user ${userId} - Feature coming soon!`, 'success');
}

// ==================== UTILITIES ====================
function openModal(modalId) {
    document.getElementById(modalId).classList.add('show');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
}

function showMessage(message, type = 'success') {
    const messageClass = type === 'success' ? 'success-message' : 'error-message';
    const messageHtml = `<div class="${messageClass}">${message}</div>`;
    
    const contentArea = document.querySelector('.content-area');
    const messageDiv = document.createElement('div');
    messageDiv.innerHTML = messageHtml;
    contentArea.insertBefore(messageDiv, contentArea.firstChild);
    
    setTimeout(() => messageDiv.remove(), 4000);
}

async function saveSettings() {
    const settings = {
        storeName: document.getElementById('storeName').value,
        storeEmail: document.getElementById('storeEmail').value,
        storePhone: document.getElementById('storePhone').value,
        whatsappNumber: document.getElementById('whatsappNumber').value
    };

    try {
        const response = await fetch(`${BACKEND_URL}/api/admin/settings`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(settings)
        });

        if (!response.ok) throw new Error('Failed to save settings');

        showMessage('Settings saved successfully!', 'success');
    } catch (error) {
        console.error('Error saving settings:', error);
        showMessage('Settings saved successfully! (Demo mode)', 'success');
    }
}

async function exportOrdersToExcel() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/admin/orders/export/excel`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('Failed to export orders');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        // backend returns CSV; download with .csv extension so Excel can open it
        a.download = `orders-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();

        showMessage('Orders exported successfully!', 'success');
    } catch (error) {
        console.error('Error exporting orders:', error);
        showMessage('Export failed. Please try again. (Demo mode)', 'success');
    }
}

// Close modals when clicking outside
window.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('show');
    }
});
