/* ====================================================================
   SHOPPING CART PAGE - cart.js
   Handles cart display, quantity management, and removal
   ================================================================== */

// ==================== CART PAGE INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    initializeCartPage();
});

function initializeCartPage() {
    const cartItemsContainer = document.getElementById('cartItems');
    const emptyCartContainer = document.getElementById('emptyCart');
    const checkoutBtn = document.getElementById('checkoutBtn');

    // Render cart items
    if (cart.getItemCount() === 0) {
        cartItemsContainer.style.display = 'none';
        emptyCartContainer.style.display = 'block';
        checkoutBtn.disabled = true;
    } else {
        renderCartItems();
        updateCartTotals();
        attachCartEventListeners();
    }

    // Checkout button navigation
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', () => {
            if (cart.getItemCount() > 0) {
                console.log('🛒 Checkout button clicked, cart items:', cart.getItemCount());
                console.log('📍 Navigating to checkout page...');
                window.location.href = 'checkout-v2.html';
            } else {
                console.warn('⚠️ Cannot checkout with empty cart');
                alert('Please add items to your cart before checkout');
            }
        });
    } else {
        console.error('❌ Checkout button not found in DOM');
    }
}

// ==================== RENDER CART ITEMS ====================
function renderCartItems() {
    const cartItemsContainer = document.getElementById('cartItems');
    cartItemsContainer.innerHTML = '';

    cart.cart.forEach(item => {
        const cartItem = createCartItemElement(item);
        cartItemsContainer.appendChild(cartItem);
    });
}

// ==================== CREATE CART ITEM ELEMENT ====================
function createCartItemElement(item) {
    const itemElement = document.createElement('div');
    itemElement.className = 'cart-item';
    itemElement.setAttribute('data-product-id', item.id);
    itemElement.innerHTML = `
        <div class="cart-item__image">
            <img src="${item.image}" alt="${item.name}" loading="lazy">
        </div>
        
        <div class="cart-item__content">
            <h3 class="cart-item__name">${item.name}</h3>
            <p class="cart-item__description">${item.description}</p>
            <p class="cart-item__price">৳${item.price.toFixed(2)}</p>
        </div>
        
        <div class="cart-item__quantity">
            <button class="quantity-btn quantity-btn--minus" aria-label="Decrease quantity">−</button>
            <input 
                type="number" 
                class="quantity-input" 
                value="${item.quantity}" 
                min="1" 
                aria-label="Quantity"
            >
            <button class="quantity-btn quantity-btn--plus" aria-label="Increase quantity">+</button>
        </div>
        
        <div class="cart-item__total">
            <p class="cart-item__total-price">৳${(item.price * item.quantity).toFixed(2)}</p>
        </div>
        
        <button class="cart-item__remove" aria-label="Remove item from cart" title="Remove">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
        </button>
    `;

    return itemElement;
}

// ==================== ATTACH CART EVENT LISTENERS ====================
function attachCartEventListeners() {
    const cartItemsContainer = document.getElementById('cartItems');
    if (!cartItemsContainer) return;

    // Delegated click handler for plus, minus, and remove
    cartItemsContainer.addEventListener('click', (e) => {
        const plus = e.target.closest('.quantity-btn--plus');
        const minus = e.target.closest('.quantity-btn--minus');
        const remove = e.target.closest('.cart-item__remove');

        if (plus || minus) {
            const cartItem = (plus || minus).closest('.cart-item');
            const productId = cartItem.getAttribute('data-product-id');
            const quantityInput = cartItem.querySelector('.quantity-input');
            let newQuantity = parseInt(quantityInput.value) || 1;

            if (plus) newQuantity++;
            else newQuantity = Math.max(1, newQuantity - 1);

            handleQuantityChange(productId, newQuantity, cartItem);
            return;
        }

        if (remove) {
            handleRemoveItem(e.target.closest('.cart-item'));
        }
    });

    // Change listener for manual quantity input
    cartItemsContainer.addEventListener('change', (e) => {
        if (e.target.classList.contains('quantity-input')) {
            const cartItem = e.target.closest('.cart-item');
            const productId = cartItem.getAttribute('data-product-id');
            const newQuantity = parseInt(e.target.value) || 1;
            handleQuantityChange(productId, newQuantity, cartItem);
        }
    });
}

// ==================== HANDLE QUANTITY CHANGE ====================
function handleQuantityChange(productId, newQuantity, cartItem) {
    if (newQuantity > 0) {
        cart.updateQuantity(productId, newQuantity);
        
        const quantityInput = cartItem.querySelector('.quantity-input');
        quantityInput.value = newQuantity;

        const cartProduct = cart.cart.find(i => String(i.id) === String(productId));
        if (cartProduct) {
            const itemTotal = cartItem.querySelector('.cart-item__total-price');
            itemTotal.textContent = `৳${(cartProduct.price * newQuantity).toFixed(2)}`;
        }

        updateCartTotals();
    }
}

// ==================== HANDLE REMOVE ITEM ====================
function handleRemoveItem(cartItem) {
    const productId = cartItem.getAttribute('data-product-id');
    
    cart.removeFromCart(productId);
    
    cartItem.style.animation = 'fadeOut 0.3s ease forwards';
    
    setTimeout(() => {
        renderCartItems();
        
        if (cart.getItemCount() === 0) {
            document.getElementById('cartItems').style.display = 'none';
            document.getElementById('emptyCart').style.display = 'block';
            document.getElementById('checkoutBtn').disabled = true;
        } else {
            updateCartTotals();
            attachCartEventListeners();
        }
    }, 300);
}

// ==================== UPDATE CART TOTALS ====================
function updateCartTotals() {
    const subtotal = parseFloat(cart.getTotal());
    const shipping = 50; // Default: Inside Damudya (BDT)
    const tax = (subtotal + shipping) * 0.10; // 10% tax
    const total = subtotal + shipping + tax;

    // Update summary
    document.getElementById('subtotal').textContent = `৳${subtotal.toFixed(2)}`;
    document.getElementById('shipping').textContent = `৳${shipping.toFixed(2)}`;
    document.getElementById('tax').textContent = `৳${tax.toFixed(2)}`;
    document.getElementById('total').textContent = `৳${total.toFixed(2)}`;
}

// ==================== ADD FADE OUT ANIMATION ====================
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        from {
            opacity: 1;
            transform: translateX(0);
        }
        to {
            opacity: 0;
            transform: translateX(100px);
        }
    }
`;
document.head.appendChild(style);

// ==================== EXPORT CART DATA ====================
// TODO: Phase 3 - Connect to backend API
function exportCartAsJSON() {
    const cartData = {
        items: cart.cart,
        subtotal: cart.getTotal(),
        timestamp: new Date().toISOString(),
        itemCount: cart.getItemCount()
    };
    return JSON.stringify(cartData, null, 2);
}

// Export for use in checkout
window.cartManager = {
    getCart: () => cart.cart,
    getTotal: () => cart.getTotal(),
    exportJSON: exportCartAsJSON
};
