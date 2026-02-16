/* ====================================================================
   EVAN'S BAKERY & CHOCOLATE - MAIN JAVASCRIPT
   ================================================================== */

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

// ==================== PRODUCT DATABASE ====================
// Products will be loaded from the backend API
let PRODUCTS = [];
let CATEGORIES = [];

// Load categories from backend API
async function loadCategoriesFromAPI() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/categories`);
        if (!response.ok) throw new Error('Failed to load categories');
        
        const categories = await response.json();
        CATEGORIES = categories;
        
        console.log('✅ Loaded', CATEGORIES.length, 'categories from backend');
        // Notify other modules that categories are available
        try {
            window.dispatchEvent(new CustomEvent('categories:loaded', { detail: CATEGORIES }));
        } catch (e) {
            // ignore if dispatch fails in older browsers
        }
        
        // Update navbar dropdown with dynamic categories
        updateNavbarCategoryDropdown();
        
        // Update filter UI with dynamic categories
        updateCategoryFilters();
    } catch (error) {
        console.error('Error loading categories from API:', error);
    }
}

// Move `.navbar__categories-dropdown` into `.navbar__right` on small screens
function moveCategoriesForMobile() {
    const categories = document.querySelector('.navbar__categories-dropdown');
    const navbarCenter = document.querySelector('.navbar__center');
    const navbarRight = document.querySelector('.navbar__right');
    if (!categories || !navbarCenter || !navbarRight) return;

    // Mobile: move categories into the right group near the cart/search
    if (window.innerWidth <= 700) {
        if (categories.parentElement !== navbarRight) {
            // prefer placing categories after the cart button so visual order is stable
            const cartBtn = navbarRight.querySelector('.navbar__cart-btn');
            if (cartBtn && cartBtn.parentElement === navbarRight) {
                // insert after cartBtn
                navbarRight.insertBefore(categories, cartBtn.nextSibling);
            } else {
                navbarRight.appendChild(categories);
            }
        }
    } else {
        if (categories.parentElement !== navbarCenter) {
            // restore into center immediately after the Home button to preserve desktop order
            const homeBtn = navbarCenter.querySelector('.navbar__home-btn');
            if (homeBtn && homeBtn.parentElement === navbarCenter) {
                navbarCenter.insertBefore(categories, homeBtn.nextSibling);
            } else {
                // fallback: append to start of center
                navbarCenter.insertBefore(categories, navbarCenter.firstChild);
            }
        }
    }
}

// Ensure we re-run this on resize so desktop order restores immediately
if (!window.__moveCategoriesResizeAttached) {
    window.__moveCategoriesResizeAttached = true;
    window.addEventListener('resize', () => {
        // small debounce
        clearTimeout(window.__moveCategoriesResizeTimeout);
        window.__moveCategoriesResizeTimeout = setTimeout(() => moveCategoriesForMobile(), 120);
    });
    // run once to ensure correct placement on load
    document.addEventListener('DOMContentLoaded', moveCategoriesForMobile);
}

// Update navbar dropdown menu with categories from backend
function updateNavbarCategoryDropdown() {
    const dropdownMenu = document.getElementById('dropdownMenu');
    if (!dropdownMenu) return;
    
    const isOnCategoriesPage = window.location.pathname.includes('categories.html');
    
    let html = '';
    CATEGORIES.forEach(cat => {
        const categoryValue = cat.name.toLowerCase().replace(/\s+/g, '');
        // On categories page, use hash navigation. Otherwise, link to categories page with hash
        const href = isOnCategoriesPage ? `#${categoryValue}` : `categories.html#${categoryValue}`;
        html += `<a href="${href}" class="navbar__dropdown-item">${cat.name}</a>`;
    });
    
    dropdownMenu.innerHTML = html;
    
    // Re-attach event listeners to the new links
    const categoriesBtn = document.getElementById('categoriesBtn');
    if (categoriesBtn) {
        dropdownMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', (e) => {
                dropdownMenu.classList.remove('active');
                categoriesBtn.classList.remove('active');
            });
        });
    }
}

// Update category filter checkboxes dynamically
function updateCategoryFilters() {
    const filterOptions = document.querySelector('.filter-options');
    if (!filterOptions) return;
    
    // Keep the "All Products" option
    const allProductsLabel = filterOptions.querySelector('label:first-child');
    const newOptions = allProductsLabel ? allProductsLabel.outerHTML : '<label class="filter-option"><input type="radio" name="category" value="all" class="filter-option__input" checked><span class="filter-option__label">All Products</span></label>';
    
    let html = newOptions;
    CATEGORIES.forEach(cat => {
        const categoryValue = cat.name.toLowerCase().replace(/\s+/g, '');
        html += `
            <label class="filter-option">
                <input type="radio" name="category" value="${categoryValue}" class="filter-option__input">
                <span class="filter-option__label">${cat.name}</span>
            </label>
        `;
    });
    
    filterOptions.innerHTML = html;
    
    // Re-attach event listeners
    const filterRadios = filterOptions.querySelectorAll('input[name="category"]');
    const productFilter = window.currentProductFilter;
    if (productFilter) {
        filterRadios.forEach(radio => {
            radio.addEventListener('change', () => productFilter.filterProducts());
        });
    }
}

// Load products from backend API
async function loadProductsFromAPI() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/products`);
        if (!response.ok) throw new Error('Failed to load products');
        
        const products = await response.json();
        // Map backend products to frontend format
        PRODUCTS = products.map(product => {
            // Handle image paths - make absolute if they're relative
            let imageUrl = product.image;
            if (imageUrl) {
                // If it's already a full URL starting with http
                if (imageUrl.startsWith('http')) {
                    // Use as-is
                } 
                // If it starts with /, it's from the uploads folder
                else if (imageUrl.startsWith('/')) {
                    imageUrl = BACKEND_URL + imageUrl;
                } 
                // Otherwise it's just a filename, assume it's in uploads/products
                else {
                    imageUrl = BACKEND_URL + '/uploads/products/' + imageUrl;
                }
            }
            return {
                id: product._id,
                name: product.name,
                category: product.category.toLowerCase().replace(/\s+/g, ''),
                price: product.price,
                description: product.description,
                badge: '',
                image: imageUrl || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22250%22 height=%22250%22%3E%3Crect fill=%22%23F5E6D3%22 width=%22250%22 height=%22250%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2224%22 fill=%22%238B6F47%22 text-anchor=%22middle%22 dy=%22.3em%22%3E' + product.name + '%3C/text%3E%3C/svg%3E'
            };
        });
        
        console.log('✅ Loaded', PRODUCTS.length, 'products from backend');
        
        // Render featured products on index page
        if (typeof renderFeaturedProducts === 'function') {
            renderFeaturedProducts();
        }

        // Re-initialize the product filter after products are loaded
        if (document.getElementById('productsGrid')) {
            new ProductFilter();
        }
    } catch (error) {
        console.error('Error loading products from API:', error);
        console.log('⚠️ Using fallback demo products');
        loadDemoProducts();
    }
}

// Fallback demo products if API fails
function loadDemoProducts() {
    PRODUCTS = [
    {
        id: 1,
        name: 'Dark Chocolate Truffle',
        category: 'dark',
        price: 1689,
        description: 'Rich 70% dark chocolate with ganache center',
        badge: 'Premium',
        image: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22250%22 height=%22250%22%3E%3Crect fill=%22%23F5E6D3%22 width=%22250%22 height=%22250%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2224%22 fill=%22%238B6F47%22 text-anchor=%22middle%22 dy=%22.3em%22%3EDark Truffle%3C/text%3E%3C/svg%3E'
    },
    {
        id: 2,
        name: 'Butter Croissant',
        category: 'pastries',
        price: 649,
        description: 'Flaky, buttery layers made fresh every morning',
        badge: 'Fresh Daily',
        image: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22250%22 height=%22250%22%3E%3Crect fill=%22%23F5E6D3%22 width=%22250%22 height=%22250%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2224%22 fill=%22%23C9A876%22 text-anchor=%22middle%22 dy=%22.3em%22%3ECroissant%3C/text%3E%3C/svg%3E'
    },
    {
        id: 3,
        name: 'French Macarons',
        category: 'pastries',
        price: 2469,
        description: 'Delicate almond meringue cookies in assorted flavors',
        badge: '',
        image: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22250%22 height=%22250%22%3E%3Crect fill=%22%23F5E6D3%22 width=%22250%22 height=%22250%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2220%22 fill=%22%23E8A9B0%22 text-anchor=%22middle%22 dy=%22.3em%22%3EMacaron%3C/text%3E%3C/svg%3E'
    },
    {
        id: 4,
        name: 'Velvet Chocolate Cake',
        category: 'cakes',
        price: 4549,
        description: 'Dense, moist chocolate cake with cream frosting',
        badge: 'New',
        image: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22250%22 height=%22250%22%3E%3Crect fill=%22%23F5E6D3%22 width=%22250%22 height=%22250%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2224%22 fill=%22%238B6F47%22 text-anchor=%22middle%22 dy=%22.3em%22%3EChocolate Cake%3C/text%3E%3C/svg%3E'
    },
    {
        id: 5,
        name: 'Evan\'s Gift Box',
        category: 'gifts',
        price: 5979,
        description: 'Curated selection of our finest chocolates & treats',
        badge: 'Popular',
        image: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22250%22 height=%22250%22%3E%3Crect fill=%22%23F5E6D3%22 width=%22250%22 height=%22250%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2220%22 fill=%22%23E8A9B0%22 text-anchor=%22middle%22 dy=%22.3em%22%3EGift Box%3C/text%3E%3C/svg%3E'
    },
    {
        id: 6,
        name: 'Mini Dessert Cakes',
        category: 'cakes',
        price: 909,
        description: 'Individual-sized gourmet cakes in various flavors',
        badge: '',
        image: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22250%22 height=%22250%22%3E%3Crect fill=%22%23F5E6D3%22 width=%22250%22 height=%22250%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2224%22 fill=%22%238B6F47%22 text-anchor=%22middle%22 dy=%22.3em%22%3EMini Cakes%3C/text%3E%3C/svg%3E'
    },
    {
        id: 7,
        name: 'Milk Chocolate Bar',
        category: 'milk',
        price: 1169,
        description: 'Smooth, creamy milk chocolate with hazelnuts',
        badge: '',
        image: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22250%22 height=%22250%22%3E%3Crect fill=%22%23F5E6D3%22 width=%22250%22 height=%22250%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2224%22 fill=%22%23C9A876%22 text-anchor=%22middle%22 dy=%22.3em%22%3EMilk Choc%3C/text%3E%3C/svg%3E'
    },
    {
        id: 8,
        name: 'Eclairs Collection',
        category: 'pastries',
        price: 2079,
        description: 'Assorted flavored eclairs with premium chocolate glaze',
        badge: '',
        image: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22250%22 height=%22250%22%3E%3Crect fill=%22%23F5E6D3%22 width=%22250%22 height=%22250%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2220%22 fill=%22%238B6F47%22 text-anchor=%22middle%22 dy=%22.3em%22%3EEclairs%3C/text%3E%3C/svg%3E'
    },
    {
        id: 9,
        name: 'Berry Cheesecake',
        category: 'cakes',
        price: 3769,
        description: 'Creamy New York cheesecake with fresh berries',
        badge: '',
        image: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22250%22 height=%22250%22%3E%3Crect fill=%22%23F5E6D3%22 width=%22250%22 height=%22250%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2220%22 fill=%22%23E8A9B0%22 text-anchor=%22middle%22 dy=%22.3em%22%3ECheesecake%3C/text%3E%3C/svg%3E'
    },
    {
        id: 10,
        name: 'Dark Chocolate Bark',
        category: 'dark',
        price: 1559,
        description: 'Handcrafted dark chocolate with sea salt and almonds',
        badge: '',
        image: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22250%22 height=%22250%22%3E%3Crect fill=%22%23F5E6D3%22 width=%22250%22 height=%22250%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2220%22 fill=%22%238B6F47%22 text-anchor=%22middle%22 dy=%22.3em%22%3EChoc Bark%3C/text%3E%3C/svg%3E'
    },
    {
        id: 11,
        name: 'Premium Gift Hamper',
        category: 'gifts',
        price: 11699,
        description: 'Ultimate collection with chocolates, cakes & pastries',
        badge: 'Luxury',
        image: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22250%22 height=%22250%22%3E%3Crect fill=%22%23F5E6D3%22 width=%22250%22 height=%22250%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2220%22 fill=%22%23E8A9B0%22 text-anchor=%22middle%22 dy=%22.3em%22%3EHamper%3C/text%3E%3C/svg%3E'
    },
    {
        id: 12,
        name: 'Pistachio Tart',
        category: 'pastries',
        price: 1949,
        description: 'Buttery tart shell filled with pistachio cream',
        badge: '',
        image: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22250%22 height=%22250%22%3E%3Crect fill=%22%23F5E6D3%22 width=%22250%22 height=%22250%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2220%22 fill=%22%23C9A876%22 text-anchor=%22middle%22 dy=%22.3em%22%3ETart%3C/text%3E%3C/svg%3E'
    }
    ];
    // If on index page, render featured products from demo data
    if (typeof renderFeaturedProducts === 'function') {
        renderFeaturedProducts();
    }
}

// Render featured products into the index page featured grid
function renderFeaturedProducts() {
    const container = document.getElementById('featuredProductsGrid');
    if (!container) return;

    // Choose only: Evan's gift items AND products marked as 'Popular' or 'Bestseller'
    const maxItems = 6;
    const giftItems = PRODUCTS.filter(p => (p.name && /evan'?s?\s*gift/i.test(p.name)) || (p.category && p.category === 'gifts'));
    const isPopular = (p) => {
        if (!p) return false;
        if (p.badge && /popular|best|bestseller/i.test(p.badge)) return true;
        if (p.popular === true || p.isPopular === true) return true;
        if (typeof p.salesCount === 'number' && p.salesCount > 0) return true;
        if (Array.isArray(p.tags) && p.tags.some(t => /popular|bestseller/i.test(t))) return true;
        if (p.name && /popular|best|bestseller/i.test(p.name)) return true;
        return false;
    };

    const popularItems = PRODUCTS.filter(isPopular);

    // Merge unique (giftItems first, then popularItems), but DO NOT fill with other products
    const chosen = [];
    giftItems.forEach(p => { if (chosen.length < maxItems && !chosen.find(x => x.id === p.id)) chosen.push(p); });
    popularItems.forEach(p => { if (chosen.length < maxItems && !chosen.find(x => x.id === p.id)) chosen.push(p); });

    // Render chosen items
    container.innerHTML = '';
    chosen.slice(0, maxItems).forEach(product => {
        const priceText = (typeof product.price === 'number' && product.price.toFixed) ? product.price.toFixed(2) : product.price || '';

        const card = document.createElement('div');
        card.className = 'product-card';
        card.setAttribute('data-product-id', product.id);
        card.innerHTML = `
            <div class="product-card__image-wrapper">
                <img src="${product.image}" alt="${product.name}" class="product-card__image" loading="lazy">
                ${product.badge ? `<div class="product-card__badge">${product.badge}</div>` : ''}
            </div>
            <div class="product-card__content">
                <h3 class="product-card__name">${product.name}</h3>
                <p class="product-card__description">${product.description || ''}</p>
                <div class="product-card__footer">
                    <span class="product-card__price">৳${priceText}</span>
                    <button class="btn btn--secondary btn--small" aria-label="Add to cart">Add to Cart</button>
                </div>
            </div>
        `;

        // Add to cart handler
        const btn = card.querySelector('button');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                cart.addToCart(product.id);
            });
        }

        container.appendChild(card);
    });

    // Re-attach intersection observer animations for new cards
    try {
        initializeScrollAnimations();
    } catch (e) {
        // ignore if not available yet
    }
}

// ==================== CART MANAGEMENT ====================
// TODO: Connect to backend cart API when ready
class CartManager {
    constructor() {
        this.cart = this.loadCart();
        this.updateCartCount();
    }

    loadCart() {
        // Retrieve cart from localStorage
        const saved = localStorage.getItem('evansCart');
        const parsed = saved ? JSON.parse(saved) : [];
        // Normalize saved items to ensure `quantity` exists and ids are consistent
        return Array.isArray(parsed) ? parsed.map(item => ({
            ...item,
            quantity: typeof item.quantity === 'number' ? item.quantity : (item.quantity ? Number(item.quantity) || 1 : 1),
            id: item.id
        })) : [];
    }

    saveCart() {
        // Save cart to localStorage
        localStorage.setItem('evansCart', JSON.stringify(this.cart));
        console.debug('cart.saveCart -> saved', this.cart);
        this.updateCartCount();
    }

    addToCart(productId) {
        console.debug('cart.addToCart called with', productId);
        const product = PRODUCTS.find(p => String(p.id) === String(productId));
        if (!product) return;

        // Compare IDs as strings to avoid number/string mismatches
        const pid = String(productId);
        const existing = this.cart.find(item => String(item.id) === pid);
        if (existing) {
            existing.quantity = (typeof existing.quantity === 'number' ? existing.quantity : Number(existing.quantity) || 0) + 1;
        } else {
            this.cart.push({ ...product, id: product.id, quantity: 1 });
        }
        console.debug('cart.addToCart -> cart before save', this.cart);
        // Update badge immediately so UI reflects change without requiring a reload
        try { this.updateCartCount(); } catch (e) { console.warn('Immediate cart.updateCartCount failed', e); }
        // Dispatch an event in case other parts of the UI need to react
        try { window.dispatchEvent(new CustomEvent('cart:updated', { detail: { items: this.cart } })); } catch (e) { /* ignore */ }
        this.saveCart();
        console.debug('cart.addToCart -> cart after save', this.cart);
        this.showNotification(`${product.name} added to cart!`);
    }

    removeFromCart(productId) {
        console.log('🗑️ removeFromCart called with ID:', productId, 'Type:', typeof productId);
        const beforeCount = this.cart.length;
        
        // Remove item - handle both string and number IDs
        this.cart = this.cart.filter(item => {
            const match = String(item.id) === String(productId);
            console.log(`  Checking item ${item.id} (${typeof item.id}) vs ${productId} (${typeof productId}): ${match ? 'MATCH' : 'no match'}`);
            return !match;
        });
        
        const afterCount = this.cart.length;
        console.log(`✅ Item removed: ${beforeCount} → ${afterCount} items in cart`);
        this.saveCart();
    }

    updateQuantity(productId, quantity) {
        const item = this.cart.find(i => String(i.id) === String(productId));
        if (item) {
            item.quantity = Math.max(1, quantity);
            this.saveCart();
        }
    }

    getTotal() {
        return this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2);
    }

    getItemCount() {
        return this.cart.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    }

    updateCartCount() {
        const badges = document.querySelectorAll('.navbar__cart-count');
        const count = Number(this.getItemCount());
        console.debug('cart.updateCartCount -> computed count:', count, 'badges found:', badges.length);
        const safe = Number.isFinite(count) ? count : 0;
        if (badges && badges.length > 0) {
            badges.forEach(badge => {
                try {
                    badge.textContent = String(safe);
                    if (safe === 0) badge.classList.add('hidden');
                    else badge.classList.remove('hidden');
                } catch (e) {
                    console.warn('cart.updateCartCount -> failed to update a badge element', e);
                }
            });
        } else {
            console.debug('cart.updateCartCount -> no badge elements in DOM');
        }
    }

    showNotification(message) {
        // Simple notification (can be enhanced with toast library)
        console.log('✓', message);
    }

    clearCart() {
        this.cart = [];
        this.saveCart();
    }
}

// Initialize cart
const cart = new CartManager();
// Expose for other scripts that expect a global `cart`/`window.cart`
try { window.cart = cart; } catch (e) { /* ignore in locked globals */ }

// ==================== NAVIGATION & DROPDOWN ====================
function initializeNavigation() {
    const categoriesBtn = document.getElementById('categoriesBtn');
    const dropdownMenu = document.getElementById('dropdownMenu');

    if (categoriesBtn && dropdownMenu) {
        // Toggle dropdown on button click
        categoriesBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropdownMenu.classList.toggle('active');
            categoriesBtn.classList.toggle('active', isOpen);
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!categoriesBtn.contains(e.target) && !dropdownMenu.contains(e.target)) {
                dropdownMenu.classList.remove('active');
                categoriesBtn.classList.remove('active');
            }
        });

        // Close dropdown when selecting item
        dropdownMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', (e) => {
                dropdownMenu.classList.remove('active');
                categoriesBtn.classList.remove('active');
            });
        });
    }

    // Cart button navigation
    const cartBtn = document.querySelector('.navbar__cart-btn');
    if (cartBtn) {
        cartBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = 'cart.html';
        });
    }

    // Home button navigation
    const homeBtn = document.querySelector('.navbar__home-btn');
    if (homeBtn) {
        homeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = 'index.html';
        });
    }

    // Hide dropdowns while the user scrolls down to avoid floating menus
    // over a sticky bar or content. We add a class to <body> and let CSS hide
    // the dropdown visually. Guard to avoid double-listening.
    if (!window.__dropdownScrollAttached) {
        window.__dropdownScrollAttached = true;
        const threshold = 60;
        const onScroll = () => {
            if ((window.scrollY || window.pageYOffset) > threshold) {
                document.body.classList.add('scrolled-down');
            } else {
                document.body.classList.remove('scrolled-down');
            }
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        // run once to set initial state
        onScroll();
    }
}

// ==================== ADD TO CART BUTTONS ====================
function initializeAddToCartButtons() {
    document.querySelectorAll('.product-card__footer .btn').forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const productCard = button.closest('.product-card');
            const productId = productCard.getAttribute('data-product-id');
            cart.addToCart(productId);
        });
    });
}

// Testimonials slider removed — HTML was deleted from index.html

// ==================== SHOP PAGE - PRODUCT FILTERING ====================
class ProductFilter {
    constructor() {
        window.currentProductFilter = this;
        this.filterRadios = document.querySelectorAll('input[name="category"]');
        this.filterCheckboxes = document.querySelectorAll('input[name="price"]');
        this.sortSelect = document.getElementById('sortSelect');
        this.productsGrid = document.getElementById('productsGrid');
        this.emptyState = document.getElementById('emptyState');
        this.productsCount = document.getElementById('productsCount');
        this.resetBtn = document.getElementById('resetFilters');

        if (this.filterRadios.length > 0) {
            this.init();
        }
    }

    init() {
        this.attachEventListeners();
    }

    attachEventListeners() {
        this.filterRadios = document.querySelectorAll('input[name="category"]');
        this.filterCheckboxes = document.querySelectorAll('input[name="price"]');
        
        this.filterRadios.forEach(radio => {
            radio.addEventListener('change', () => this.filterProducts());
        });

        this.filterCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => this.filterProducts());
        });

        if (this.sortSelect) {
            this.sortSelect.addEventListener('change', () => this.filterProducts());
        }

        if (this.resetBtn) {
            this.resetBtn.addEventListener('click', () => this.reset());
        }

        this.filterProducts();
    }

    filterProducts() {
        const selectedCategory = document.querySelector('input[name="category"]:checked').value;
        const selectedPrices = Array.from(this.filterCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);
        const sortBy = this.sortSelect?.value || 'featured';
        const searchQuery = this.searchQuery ? this.searchQuery.toLowerCase() : '';

        let filtered = PRODUCTS;

        // Filter by search term
        if (searchQuery) {
            filtered = filtered.filter(p => 
                p.name.toLowerCase().includes(searchQuery) || 
                p.description.toLowerCase().includes(searchQuery) ||
                p.category.toLowerCase().includes(searchQuery)
            );
        }

        // Filter by category
        if (selectedCategory !== 'all') {
            filtered = filtered.filter(p => p.category === selectedCategory);
        }

        // Filter by price
        if (selectedPrices.length > 0) {
            filtered = filtered.filter(p => {
                return selectedPrices.some(range => {
                    const [min, max] = range.split('-').map(v => v === '+' ? Infinity : parseInt(v));
                    return p.price >= min && (max === undefined ? true : p.price <= max);
                });
            });
        }

        // Sort products
        filtered = this.sortProducts(filtered, sortBy);

        // Render filtered products
        this.renderProducts(filtered);
    }

    sortProducts(products, sortBy) {
        const sorted = [...products];
        switch (sortBy) {
            case 'price-low':
                sorted.sort((a, b) => a.price - b.price);
                break;
            case 'price-high':
                sorted.sort((a, b) => b.price - a.price);
                break;
            case 'name':
                sorted.sort((a, b) => a.name.localeCompare(b.name));
                break;
            case 'newest':
                sorted.reverse();
                break;
            case 'featured':
            default:
                // Keep original order
        }
        return sorted;
    }

    renderProducts(products) {
        if (!this.productsGrid) return;

        this.productsGrid.innerHTML = '';

        if (products.length === 0) {
            this.emptyState.style.display = 'block';
            if (this.productsCount) {
                this.productsCount.textContent = 'Showing 0 products';
            }
            return;
        }

        this.emptyState.style.display = 'none';

        products.forEach(product => {
            const card = document.createElement('div');
            card.className = 'product-card';
            card.setAttribute('data-product-id', product.id);
            card.innerHTML = `
                <div class="product-card__image-wrapper">
                    <img 
                        src="${product.image}" 
                        alt="${product.name}"
                        class="product-card__image"
                        loading="lazy"
                    >
                    ${product.badge ? `<div class="product-card__badge">${product.badge}</div>` : ''}
                </div>
                <div class="product-card__content">
                    <h3 class="product-card__name">${product.name}</h3>
                    <p class="product-card__description">${product.description}</p>
                    <div class="product-card__footer">
                        <span class="product-card__price">৳${product.price.toFixed(2)}</span>
                        <button class="btn btn--secondary btn--small" aria-label="Add to cart">
                            Add to Cart
                        </button>
                    </div>
                </div>
            `;

            // Add event listener to add to cart button
            card.querySelector('.btn').addEventListener('click', (e) => {
                e.preventDefault();
                cart.addToCart(product.id);
            });

            this.productsGrid.appendChild(card);
        });

        if (this.productsCount) {
            this.productsCount.textContent = `Showing ${products.length} product${products.length !== 1 ? 's' : ''}`;
        }
    }

    reset() {
        document.querySelector('input[name="category"][value="all"]').checked = true;
        this.filterCheckboxes.forEach(cb => cb.checked = false);
        if (this.sortSelect) {
            this.sortSelect.value = 'featured';
        }
        this.filterProducts();
    }
}

// ==================== HERO CTA BUTTON ====================
function initializeHeroCTA() {
    const ctaBtn = document.querySelector('.hero__cta');
    if (ctaBtn) {
        ctaBtn.addEventListener('click', () => {
            window.location.href = 'categories.html';
        });
    }
}

// ==================== SCROLL ANIMATIONS ====================
function initializeScrollAnimations() {
    // Intersection Observer for lazy animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animation = 'fadeInUp 0.8s ease forwards';
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Add animation class to observable elements
    document.querySelectorAll('.product-card').forEach(card => {
        observer.observe(card);
    });
}

// ==================== SEARCH INPUT ====================
function initializeSearch() {
    const searchInput = document.querySelector('.navbar__search-input');
    if (!searchInput) return;

    const navbarSearch = searchInput.closest('.navbar__search');
    const svg = navbarSearch ? navbarSearch.querySelector('svg') : null;

    // Start collapsed (icon-only)
    if (navbarSearch) {
        navbarSearch.classList.add('collapsed');
    }

    // Handle Enter key to perform search
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const searchTerm = searchInput.value.trim();
            if (searchTerm) {
                window.location.href = `categories.html?search=${encodeURIComponent(searchTerm)}`;
            }
        }
    });

    // Toggle expand/collapse on icon click
    if (svg && navbarSearch) {
        svg.style.cursor = 'pointer';
        svg.addEventListener('click', (e) => {
            e.stopPropagation();
            const isCollapsed = navbarSearch.classList.contains('collapsed');
            if (isCollapsed) {
                // Expand input and focus
                navbarSearch.classList.remove('collapsed');
                navbarSearch.classList.add('expanded');
                searchInput.placeholder = 'Search product';
                // Small timeout to allow CSS transition
                setTimeout(() => searchInput.focus(), 120);
            } else {
                const searchTerm = searchInput.value.trim();
                if (searchTerm) {
                    window.location.href = `categories.html?search=${encodeURIComponent(searchTerm)}`;
                } else {
                    // Collapse back if empty
                    navbarSearch.classList.remove('expanded');
                    navbarSearch.classList.add('collapsed');
                    searchInput.value = '';
                }
            }
        });
    }

    // Click outside to collapse
    document.addEventListener('click', (ev) => {
        if (!navbarSearch) return;
        if (!navbarSearch.classList.contains('expanded')) return;
        if (!navbarSearch.contains(ev.target)) {
            navbarSearch.classList.remove('expanded');
            navbarSearch.classList.add('collapsed');
            searchInput.value = '';
        }
    });
}

// ==================== SEARCH RESULTS HANDLER ====================
function handleSearchResults() {
    const urlParams = new URLSearchParams(window.location.search);
    const searchQuery = urlParams.get('search');
    
    if (searchQuery && window.currentProductFilter) {
        // Store search query for filtering
        window.currentProductFilter.searchQuery = searchQuery;
        
        // Clear any existing filters and apply search
        const searchInput = document.querySelector('.navbar__search-input');
        if (searchInput) {
            searchInput.value = searchQuery;
        }
        
        // Trigger filter with search
        window.currentProductFilter.filterProducts();
    }
}

// ==================== INITIALIZE ALL ====================
document.addEventListener('DOMContentLoaded', () => {
    // Load categories and products from API first
    loadCategoriesFromAPI();
    loadProductsFromAPI();

    // Navigation
    initializeNavigation();

    // Add to Cart
    initializeAddToCartButtons();

    // Testimonials removed from index.html; slider not initialized

    // Product Filter (categories page only) - will be initialized after API loads products
    new ProductFilter();

    // Hero CTA
    initializeHeroCTA();

    // Scroll Animations
    initializeScrollAnimations();

    // Search
    initializeSearch();

    // Move categories into right side on small screens for desired order
    moveCategoriesForMobile();
    window.addEventListener('resize', () => moveCategoriesForMobile());
    
    // Handle search results if coming from search query
    setTimeout(() => {
        handleSearchResults();
    }, 500);

    // Category filtering from navbar
    initializeCategoryLinks();
    
    // Handle category hash navigation on categories page (with delay for DOM readiness)
    setTimeout(() => {
        handleCategoryHashNavigation();
    }, 500);

    // Mobile categories behavior: (unchanged)

    // Log cart info for debugging
    // Ensure badge reflects current cart after DOM is ready
    try { cart.updateCartCount(); } catch (e) { console.warn('Failed to update cart count on DOMContentLoaded', e); }
    console.log('🍫 Evan\'s Bakery loaded. Cart:', cart.getItemCount(), 'items');
});

// (no mobile categories changes — restored original behavior)


// ==================== CATEGORY FILTERING FROM NAVBAR ====================
function initializeCategoryLinks() {
    const categoryLinks = document.querySelectorAll('.navbar__dropdown-item');
    
    categoryLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            // support both forms: 'categories.html#x' and '#x'
            let category = null;
            if (href.startsWith('#')) {
                category = href.substring(1) || 'all';
            } else if (href.includes('categories.html')) {
                category = href.split('#')[1] || 'all';
            }

            if (category !== null) {
                // Navigate to categories page if not already there
                if (!window.location.pathname.includes('categories')) {
                    window.location.href = `categories.html#${category}`;
                } else {
                    // Already on categories page, just select the filter
                    const categoryRadio = document.querySelector(`input[value="${category}"]`);
                    if (categoryRadio) {
                        categoryRadio.checked = true;
                        categoryRadio.dispatchEvent(new Event('change'));
                    }
                    // Ensure the hash is set so refresh preserves selection
                    if (window.location.hash.substring(1) !== category) {
                        window.location.hash = category;
                    }
                }
            }
        });
    });
}

// Handle URL hash on categories page load
function handleCategoryHashNavigation() {
    if (window.location.pathname.includes('categories')) {
        let hash = window.location.hash.substring(1);
        // If no hash present, default to 'all' so refresh shows All Products
        if (!hash) {
            hash = 'all';
            try { window.location.hash = hash; } catch (e) { /* ignore */ }
        }

        const categoryRadio = document.querySelector(`input[value="${hash}"]`);
        if (categoryRadio) {
            setTimeout(() => {
                categoryRadio.checked = true;
                categoryRadio.dispatchEvent(new Event('change'));
            }, 100);
        }
    }
}

// Listen for hash changes
window.addEventListener('hashchange', () => {
    handleCategoryHashNavigation();
});

// ==================== FUTURE ENHANCEMENTS PLACEHOLDERS ====================
/*
 * PHASE 2 - BACKEND INTEGRATION:
 * 
 * 1. PRODUCT API:
 *    - Replace PRODUCTS array with API call: fetch('/api/products')
 *    - Update filterProducts() to use server-side filtering
 * 
 * 2. CART API:
 *    - Replace localStorage with API: POST /api/cart/add
 *    - Sync cart with user account
 * 
 * 3. USER AUTHENTICATION:
 *    - Add login/signup modal
 *    - Protect cart & checkout endpoints
 * 
 * 4. CHECKOUT:
 *    - Create checkout.html page
 *    - Integrate Stripe/PayPal payment gateway
 * 
 * 5. SEARCH:
 *    - Implement full-text search with API
 *    - Add search suggestions/autocomplete
 * 
 * 6. REVIEWS & RATINGS:
 *    - Add product review system
 *    - Display average rating on product cards
 * 
 * 7. WISHLIST:
 *    - Add wishlist functionality
 *    - Save to user account
 */
