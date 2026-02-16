/* ====================================================================
   PAYMENT & CHECKOUT - payment.js
   Handles form validation, Stripe/PayPal integration, and orders
   Phase 2: Backend integration with real payment gateways
   ================================================================== */

// ==================== CONFIGURATION ====================
const BACKEND_URL = (() => {
    // If page is served from the same backend server, use local endpoint
    if (window.location.port === '5000') {
        return 'http://localhost:5000';
    }
    // If localhost, use localhost:5000
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:5000';
    }
    // If file:// protocol, default to localhost:5000
    if (window.location.protocol === 'file:') {
        return 'http://localhost:5000';
    }
    // Otherwise use production URL (Render)
    return 'https://evans-tnow.onrender.com';
})();

const USE_STRIPE = true;
const USE_PAYPAL = false;

// Stripe Configuration
const STRIPE_PUBLIC_KEY = 'pk_test_51234567890abcdefghijklmnop'; // Replace with real key

// PayPal Configuration
const PAYPAL_CLIENT_ID = 'Your_PayPal_Client_ID_Here'; // Replace with real ID

// ==================== WHATSAPP CONFIGURATION ====================
// NOTE: Replace these with your actual Twilio credentials or WhatsApp API service
const WHATSAPP_CONFIG = {
    // Using Twilio (recommended)
    service: 'twilio', // 'twilio' or 'whatsapp-api'
    enabled: true,
    // Your WhatsApp Business Account number (where orders will be sent)
    businessPhoneNumberId: 'YOUR_PHONE_NUMBER_ID', // From Twilio or WhatsApp Business
    accessToken: 'YOUR_WHATSAPP_ACCESS_TOKEN', // Twilio API token
    // For local/demo mode: use 'demo' to show order summary instead of sending
    mode: 'demo' // 'live' or 'demo'
};

// ==================== CHECKOUT PAGE INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 Page loaded, checking for checkout page...');
    
    // Check if on checkout page by looking for checkoutForm element
    const checkoutForm = document.getElementById('checkoutForm');
    if (checkoutForm) {
        console.log('✅ Checkout page detected, initializing...');
        try {
            initializeCheckoutPage();
            loadPaymentGateway();
            console.log('✅ Checkout page initialization complete');
        } catch (error) {
            console.error('❌ Error initializing checkout page:', error);
            alert('Error loading checkout page: ' + error.message);
        }
    } else {
        console.log('ℹ️ Not on checkout page');
    }
});

function initializeCheckoutPage() {
    console.log('🔄 Initializing checkout page...');
    try {
        renderOrderSummary();
        console.log('✅ Order summary rendered');
    } catch (error) {
        console.error('❌ Error rendering order summary:', error);
    }

    try {
        attachFormListeners();
        console.log('✅ Form listeners attached');
    } catch (error) {
        console.error('❌ Error attaching form listeners:', error);
    }

    try {
        handleShippingMethodChange();
        console.log('✅ Shipping method handler attached');
    } catch (error) {
        console.error('❌ Error with shipping method handler:', error);
    }
}

// ==================== LOAD PAYMENT GATEWAY ====================
function loadPaymentGateway() {
    if (USE_STRIPE) {
        loadStripe();
    } else if (USE_PAYPAL) {
        loadPayPal();
    }
}

function loadStripe() {
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.onload = function() {
        window.stripe = Stripe(STRIPE_PUBLIC_KEY);
        console.log('✓ Stripe.js loaded');
    };
    document.head.appendChild(script);
}

function loadPayPal() {
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}`;
    script.onload = function() {
        console.log('✓ PayPal SDK loaded');
    };
    document.head.appendChild(script);
}

// ==================== RENDER ORDER SUMMARY ====================
function renderOrderSummary() {
    try {
        const orderItemsContainer = document.getElementById('orderItems');
        if (!orderItemsContainer) {
            console.warn('⚠️ Order items container not found');
            return;
        }

        const subtotal = parseFloat(cart.getTotal());
        // Default to standard shipping (325 BDT)
        const shippingCost = 325;
        const tax = (subtotal + shippingCost) * 0.10;
        const total = subtotal + shippingCost + tax;

        console.log('📋 Rendering order summary:', { subtotal, shippingCost, tax, total });

        orderItemsContainer.innerHTML = '';

        // Check if cart has items
        if (!cart.cart || cart.cart.length === 0) {
            console.warn('⚠️ Cart is empty');
            orderItemsContainer.innerHTML = '<p style="color: #999;">Your cart is empty</p>';
            return;
        }

        // Add items to order summary
        cart.cart.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.className = 'order-item';
            itemElement.innerHTML = `
                <div class="order-item__content">
                    <p class="order-item__name">${item.name}</p>
                    <p class="order-item__qty">Qty: ${item.quantity}</p>
                </div>
                <p class="order-item__price">৳${(item.price * item.quantity).toFixed(2)}</p>
            `;
            orderItemsContainer.appendChild(itemElement);
        });

        // Update totals
        const subtotalEl = document.getElementById('checkoutSubtotal');
        const shippingEl = document.getElementById('checkoutShipping');
        const taxEl = document.getElementById('checkoutTax');
        const totalEl = document.getElementById('checkoutTotal');

        if (subtotalEl) subtotalEl.textContent = `৳${subtotal.toFixed(2)}`;
        if (shippingEl) shippingEl.textContent = `৳${shippingCost.toFixed(2)}`;
        if (taxEl) taxEl.textContent = `৳${tax.toFixed(2)}`;
        if (totalEl) totalEl.textContent = `৳${total.toFixed(2)}`;

        console.log('✅ Order summary rendered successfully');
    } catch (error) {
        console.error('❌ Error rendering order summary:', error);
    }
}

// ==================== ATTACH FORM LISTENERS ====================
function attachFormListeners() {
    console.log('🔗 Attaching form listeners...');
    
    const form = document.getElementById('checkoutForm');
    if (!form) {
        console.error('❌ Checkout form not found');
        return;
    }

    console.log('✅ Checkout form found');

    // Attach to form submit event
    console.log('📝 Adding form submit listener...');
    form.addEventListener('submit', handleFormSubmit);
    console.log('✅ Form submit listener attached');

    // BACKUP: Also add click listener to submit button
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        console.log('🔘 Found submit button, adding click listener...');
        submitBtn.addEventListener('click', (e) => {
            console.log('🖱️ Submit button clicked!');
            console.log('🛑 Button click will trigger form submit event');
            // The button has type="submit", so this click should trigger form submit
            // But let's make sure by also checking the form
            const form = document.getElementById('checkoutForm');
            if (form) {
                console.log('✅ Form found, submit() will be called by button');
            }
        });
    } else {
        console.warn('⚠️ Submit button not found by ID');
    }

    // Real-time shipping cost updates
    const shippingRadios = document.querySelectorAll('input[name="shipping"]');
    console.log(`📻 Found ${shippingRadios.length} shipping options`);
    shippingRadios.forEach(radio => {
        radio.addEventListener('change', handleShippingMethodChange);
    });

    // Clear error messages on input
    const inputs = document.querySelectorAll('.form-input, .form-label');
    console.log(`🎯 Found ${inputs.length} form inputs to attach focus listeners`);
    inputs.forEach(input => {
        input.addEventListener('focus', () => {
            const errorId = input.id + 'Error';
            const errorElement = document.getElementById(errorId);
            if (errorElement) {
                errorElement.textContent = '';
            }
        });
    });

    console.log('✅ All form listeners attached successfully');
}

// ==================== HANDLE SHIPPING METHOD CHANGE ====================
function handleShippingMethodChange() {
    const selectedShipping = document.querySelector('input[name="shipping"]:checked');
    if (!selectedShipping) return;

    const shippingCosts = {
        'standard': 325,
        'express': 975,
        'overnight': 1625
    };

    const selectedCost = shippingCosts[selectedShipping.value];
    const subtotal = parseFloat(cart.getTotal());
    const tax = (subtotal + selectedCost) * 0.10;
    const total = subtotal + selectedCost + tax;

    // Update display
    document.getElementById('checkoutShipping').textContent = `৳${selectedCost.toFixed(2)}`;
    document.getElementById('checkoutTax').textContent = `৳${tax.toFixed(2)}`;
    document.getElementById('checkoutTotal').textContent = `৳${total.toFixed(2)}`;
}

// ==================== FORM VALIDATION ====================
function validateCheckoutForm(formData) {
    const errors = {};

    // Full Name
    if (!formData.fullName.trim()) {
        errors.fullName = 'Full name is required';
    }

    // Email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
        errors.email = 'Please enter a valid email address';
    }

    // Phone - Just check for at least 10 digits
    const phoneDigits = formData.phone.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
        errors.phone = 'Please enter a valid phone number (at least 10 digits)';
    }

    // Address
    if (!formData.address.trim()) {
        errors.address = 'Street address is required';
    }

    // City
    if (!formData.city.trim()) {
        errors.city = 'City is required';
    }

    // State
    if (!formData.state.trim()) {
        errors.state = 'State is required';
    }

    // ZIP Code - Allow any alphanumeric code  
    if (!formData.zipcode.trim()) {
        errors.zipcode = 'ZIP/Postal code is required';
    } else if (formData.zipcode.trim().length < 3) {
        errors.zipcode = 'Please enter a valid ZIP/Postal code';
    }

    // Country
    if (!formData.country.trim()) {
        errors.country = 'Country is required';
    }

    // Agreement
    if (!formData.agreeTerms) {
        errors.agreeTerms = 'You must agree to the terms';
    }

    return errors;
}

// ==================== DISPLAY FORM ERRORS ====================
function displayFormErrors(errors) {
    // Clear all errors first
    document.querySelectorAll('.form-error, #agreeTermsError').forEach(el => {
        el.textContent = '';
    });

    // Display new errors
    Object.keys(errors).forEach(fieldName => {
        const errorElement = document.getElementById(fieldName + 'Error');
        if (errorElement) {
            errorElement.textContent = errors[fieldName];
            errorElement.style.display = 'block';
        }
    });
}

// ==================== HANDLE FORM SUBMISSION ====================
async function handleFormSubmit(e) {
    console.log('🚀 Form submit event triggered!', e);
    
    // CRITICAL: Prevent default form submission
    e.preventDefault();
    console.log('✅ preventDefault() called successfully');

    try {
        // Collect form data
        console.log('📋 Starting to collect form data...');
        const fullNameEl = document.getElementById('fullName');
        const emailEl = document.getElementById('email');
        const phoneEl = document.getElementById('phone');
        const addressEl = document.getElementById('address');
        const cityEl = document.getElementById('city');
        const stateEl = document.getElementById('state');
        const zipcodeEl = document.getElementById('zipcode');
        const countryEl = document.getElementById('country');
        const agreeTermsEl = document.getElementById('agreeTerms');

        console.log('✅ Form elements found:', {
            fullName: !!fullNameEl,
            email: !!emailEl,
            phone: !!phoneEl,
            address: !!addressEl,
            city: !!cityEl,
            state: !!stateEl,
            zipcode: !!zipcodeEl,
            country: !!countryEl,
            agreeTerms: !!agreeTermsEl
        });

        const formData = {
            fullName: fullNameEl?.value || '',
            email: emailEl?.value || '',
            phone: phoneEl?.value || '',
            address: addressEl?.value || '',
            city: cityEl?.value || '',
            state: stateEl?.value || '',
            zipcode: zipcodeEl?.value || '',
            country: countryEl?.value || '',
            shippingMethod: document.querySelector('input[name="shipping"]:checked')?.value || 'standard',
            paymentMethod: document.querySelector('input[name="paymentMethod"]:checked')?.value || 'cod',
            agreeTerms: agreeTermsEl?.checked || false
        };

        console.log('📋 Form data collected successfully:', formData);

        // Validate form
        const errors = validateCheckoutForm(formData);
        if (Object.keys(errors).length > 0) {
            console.error('❌ Validation errors found:', errors);
            displayFormErrors(errors);
            alert('❌ Please fix the errors in the form:\n' + Object.values(errors).join('\n'));
            return;
        }

        console.log('✅ Form validation passed');

        // Show loading indicator
        console.log('⏳ Showing loading overlay...');
        showLoadingOverlay(true);

        // Prepare order object
        console.log('📦 Creating order object...');
        const order = createOrderObject(formData);
        console.log('📦 Order object created:', order);

        // Process based on payment method
        if (formData.paymentMethod === 'cod') {
            console.log('💵 Processing Cash on Delivery...');
            await processCashOnDelivery(order, formData);
        } else if (formData.paymentMethod === 'stripe') {
            console.log('💳 Processing Stripe Payment...');
            await processStripePayment(order, formData);
        } else if (formData.paymentMethod === 'paypal') {
            console.log('💰 Processing PayPal Payment...');
            await processPayPalPayment(order, formData);
        } else {
            throw new Error('Unknown payment method: ' + formData.paymentMethod);
        }

    } catch (error) {
        console.error('❌ FATAL CHECKOUT ERROR:', error);
        showLoadingOverlay(false);
        const errorMsg = '❌ ' + (error.message || 'Payment failed. Please try again.');
        console.error('Error details:', error);
        alert(errorMsg);
    }
}

// ==================== PROCESS CASH ON DELIVERY ====================
async function processCashOnDelivery(order, formData) {
    try {
        console.log('💳 Processing Cash on Delivery order...');

        // Update order with COD payment status
        order.paymentMethod = 'cod';
        order.paymentStatus = 'pending';
        order.status = 'confirmed';

        // Save order to localStorage
        saveOrderToLocalStorage(order);

        // Send WhatsApp notification
        await sendWhatsAppNotification(order, formData);

        // Try to save to backend
        try {
            const backendOrder = {
                customerId: order.customerId,
                customerName: order.customerName,
                customerEmail: order.customer?.email || order.customerEmail || null,
                customerPhone: order.customer?.phone || order.customerPhone || null,
                items: order.items,
                total: order.pricing.total,
                shippingAddress: order.shippingAddress,
                shippingCity: order.city || order.shippingCity || null
            };

            console.log('📤 Sending to backend:', backendOrder);

            const response = await fetch(`${BACKEND_URL}/api/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(backendOrder)
            });

            if (response.ok) {
                const result = await response.json();
                console.log('✅ Order saved to backend:', result.order._id);
            } else {
                console.warn('⚠️ Backend save failed, but order is saved locally');
            }
        } catch (backendError) {
            console.warn('⚠️ Backend connection failed, but order is saved locally:', backendError.message);
        }

        showLoadingOverlay(false);
        console.log('🎉 Order processing complete, redirecting to confirmation...');
        console.log('🔗 Order ID:', order.id);
        redirectToConfirmation(order.id);

    } catch (error) {
        console.error('❌ COD Error:', error);
        showLoadingOverlay(false);
        throw new Error('Failed to process order. Please try again.');
    }
}

// ==================== WHATSAPP NOTIFICATION ====================
async function sendWhatsAppNotification(order, formData) {
    if (!WHATSAPP_CONFIG.enabled) {
        console.log('ℹ WhatsApp notifications disabled');
        return;
    }

    try {
        // Format order summary
        const orderSummary = formatOrderForWhatsApp(order, formData);
        
        if (WHATSAPP_CONFIG.mode === 'demo') {
            // Demo mode: show notification summary in console and popup
            console.log('📱 WhatsApp Notification (DEMO MODE):\n', orderSummary);
            showWhatsAppDemoAlert(orderSummary);
            return;
        }

        // Live mode: send via Twilio or WhatsApp API
        if (WHATSAPP_CONFIG.service === 'twilio') {
            await sendViaTwilio(orderSummary, formData.phone);
        } else if (WHATSAPP_CONFIG.service === 'whatsapp-api') {
            await sendViaWhatsAppAPI(orderSummary, formData.phone);
        }

    } catch (error) {
        console.warn('⚠️ WhatsApp notification failed (non-critical):', error.message);
        // Don't throw - order should still proceed even if notification fails
    }
}

// Format order for WhatsApp message
function formatOrderForWhatsApp(order, formData) {
    const items = order.items.map(item => 
        `• ${item.name} x${item.quantity} = ৳${(item.price * item.quantity).toFixed(2)}`
    ).join('\n');

    return `🍫 *Evan's Bakery - New Order*

*Order ID:* #${order.id}
*Status:* Confirmed (Pending Payment on Delivery)

*Customer:*
${formData.fullName}
📧 ${formData.email}
📱 ${formData.phone}

*Shipping Address:*
${formData.address}
${formData.city}, ${formData.state} ${formData.zipcode}
${formData.country}

*Items Ordered:*
${items}

*Order Summary:*
Subtotal: $${order.subtotal.toFixed(2)}
Shipping: $${order.shippingCost.toFixed(2)}
Tax: $${order.tax.toFixed(2)}
*Total: $${order.total.toFixed(2)}*

*Payment Method:* Cash on Delivery
*Shipping Method:* ${order.shippingMethod}

_Received at ${new Date().toLocaleString()}_`;
}

// Send via Twilio WhatsApp
async function sendViaTwilio(message, userPhone) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/whatsapp/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: message,
                userPhone: userPhone,
                service: 'twilio'
            })
        });

        if (!response.ok) {
            throw new Error('Failed to send WhatsApp message');
        }

        console.log('✓ WhatsApp notification sent via Twilio');
    } catch (error) {
        throw new Error(`Twilio error: ${error.message}`);
    }
}

// Send via WhatsApp Business API
async function sendViaWhatsAppAPI(message, userPhone) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/whatsapp/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: message,
                userPhone: userPhone,
                service: 'whatsapp-api'
            })
        });

        if (!response.ok) {
            throw new Error('Failed to send WhatsApp message');
        }

        console.log('✓ WhatsApp notification sent via WhatsApp API');
    } catch (error) {
        throw new Error(`WhatsApp API error: ${error.message}`);
    }
}

// Show demo alert
function showWhatsAppDemoAlert(message) {
    const modal = document.createElement('div');
    modal.id = 'whatsappDemoModal';
    modal.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;
    
    modal.innerHTML = `
        <div style="background: white; padding: 2rem; border-radius: 1rem; max-width: 500px; max-height: 80vh; overflow-y: auto;">
            <h2 style="margin: 0 0 1rem 0; color: #25d366;">📱 WhatsApp Demo Message</h2>
            <p style="color: #666; font-size: 0.9rem; margin: 0 0 1rem 0;">This is how the order notification would be sent to WhatsApp:</p>
            <pre style="background: #f5f5f5; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; font-size: 0.9rem; margin: 1rem 0;">${message}</pre>
            <button onclick="document.getElementById('whatsappDemoModal').remove()" style="background: #25d366; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; cursor: pointer; font-weight: 600;">Close</button>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// ==================== PROCESS STRIPE PAYMENT ====================
async function processStripePayment(order, formData) {
    if (!window.stripe) {
        throw new Error('Stripe.js failed to load');
    }

    try {
        // Step 1: Create payment intent on backend
        console.log('Creating Stripe payment intent...');
        const intentResponse = await fetch(`${BACKEND_URL}/api/create-payment-intent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order })
        });

        if (!intentResponse.ok) {
            throw new Error('Failed to create payment intent');
        }

        const { clientSecret, intentId } = await intentResponse.json();
        console.log('✓ Payment intent created:', intentId);

        // Step 2: Confirm payment with card
        const { paymentIntent, error } = await window.stripe.confirmCardPayment(clientSecret, {
            payment_method: {
                card: window.cardElement || { token: 'tok_visa' },
                billing_details: {
                    name: formData.fullName,
                    email: formData.email,
                    phone: formData.phone,
                    address: {
                        line1: formData.address,
                        city: formData.city,
                        state: formData.state,
                        postal_code: formData.zipcode,
                        country: formData.country
                    }
                }
            }
        });

        if (error) {
            throw new Error(`Stripe error: ${error.message}`);
        }

        if (paymentIntent.status === 'succeeded') {
            console.log('✓ Payment succeeded:', paymentIntent.id);

            // Step 3: Confirm payment on backend
            const confirmResponse = await fetch(`${BACKEND_URL}/api/confirm-payment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    paymentIntentId: intentId,
                    order 
                })
            });

            if (!confirmResponse.ok) {
                throw new Error('Failed to confirm payment on backend');
            }

            const { order: savedOrder } = await confirmResponse.json();
            showLoadingOverlay(false);
            redirectToConfirmation(savedOrder.id);
        } else {
            throw new Error(`Payment status: ${paymentIntent.status}`);
        }

    } catch (error) {
        throw error;
    }
}

// ==================== PROCESS PAYPAL PAYMENT ====================
async function processPayPalPayment(order, formData) {
    try {
        console.log('Creating PayPal order...');

        // Step 1: Create PayPal order on backend
        const createResponse = await fetch(`${BACKEND_URL}/api/paypal/create-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order })
        });

        if (!createResponse.ok) {
            throw new Error('Failed to create PayPal order');
        }

        const { orderId: paypalOrderId } = await createResponse.json();
        console.log('✓ PayPal order created:', paypalOrderId);

        // Step 2: Store order reference for capture callback
        sessionStorage.setItem('pendingOrder', JSON.stringify({
            paypalOrderId,
            evansOrderId: order.id
        }));

        // Step 3: Redirect to PayPal approval
        window.location.href = `https://www.sandbox.paypal.com/checkoutnow?token=${paypalOrderId}`;

    } catch (error) {
        throw error;
    }
}

// ==================== REDIRECT TO CONFIRMATION ====================
function redirectToConfirmation(orderId) {
    console.log('🔄 Redirecting to confirmation page...');
    console.log('📝 Order ID:', orderId);
    
    // Clear cart after successful order
    try {
        if (window.cart) {
            console.log('🛒 Cart object exists:', typeof window.cart);
            if (typeof window.cart.clear === 'function') {
                console.log('🗑️ Clearing cart...');
                window.cart.clear();
                console.log('✅ Cart cleared');
            } else {
                console.warn('⚠️ Cart.clear is not a function');
            }
        } else {
            console.warn('⚠️ Cart object not found on window');
        }
    } catch (cartError) {
        console.error('❌ Error clearing cart:', cartError);
    }

    // Clear pending order
    try {
        console.log('🧹 Cleaning up session storage...');
        sessionStorage.removeItem('pendingOrder');
        console.log('✅ Session storage cleaned');
    } catch (sessionError) {
        console.error('❌ Error accessing sessionStorage:', sessionError);
    }

    // Build confirmation URL
    try {
        const confirmationUrl = `confirmation.html?orderId=${orderId}`;
        console.log('🌐 Confirmation URL:', confirmationUrl);
        
        // Redirect to confirmation page
        console.log('➡️ EXECUTING window.location.href = "' + confirmationUrl + '"');
        window.location.href = confirmationUrl;
        console.log('✅ window.location.href assignment executed');
    } catch (redirectError) {
        console.error('❌ Error during redirect:', redirectError);
        alert('Error: Could not redirect to confirmation page. Please contact support.');
    }
}

// ==================== CREATE ORDER OBJECT ====================
function createOrderObject(formData) {
    const orderId = generateOrderId();
    const timestamp = new Date().toISOString();
    const shippingCosts = { 'standard': 325, 'express': 975, 'overnight': 1625 }; // BDT pricing
    const subtotal = parseFloat(cart.getTotal());
    const shippingCost = shippingCosts[formData.shippingMethod];
    const tax = (subtotal + shippingCost) * 0.10;
    const total = subtotal + shippingCost + tax;

    const order = {
        id: orderId,
        _id: orderId,
        timestamp: timestamp,
        status: 'pending',
        paymentStatus: 'pending',
        customerId: `user-${Date.now()}`,
        customerName: formData.fullName,
        customer: {
            fullName: formData.fullName,
            email: formData.email,
            phone: formData.phone
        },
        shippingAddress: `${formData.address}, ${formData.city}, ${formData.state} ${formData.zipcode}, ${formData.country}`,
        shippingMethod: formData.shippingMethod,
        paymentMethod: formData.paymentMethod,
        items: cart.cart.map(item => ({
            productId: item.id,
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            total: item.price * item.quantity
        })),
        pricing: {
            subtotal: subtotal,
            shipping: shippingCost,
            tax: tax,
            total: total
        }
    };

    return order;
}

// ==================== GENERATE ORDER ID ====================
function generateOrderId() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.random().toString(36).substr(2, 9).toUpperCase();
    return `ORD-${year}${month}${day}-${random}`;
}

// ==================== SIMULATE PAYMENT PROCESSING ====================
// TODO: Phase 2 - Replace with real Stripe/PayPal API calls
async function simulatePaymentProcessing(order) {
    return new Promise((resolve, reject) => {
        // Simulate API call delay
        setTimeout(() => {
            // Simulate 95% success rate (for testing error handling)
            const success = Math.random() < 0.95;
            
            if (success) {
                console.log('✓ Payment processed successfully');
                console.log('Order:', order);
                resolve({
                    success: true,
                    transactionId: 'TXN_' + Math.random().toString(36).substr(2, 9).toUpperCase(),
                    orderId: order.id
                });
            } else {
                reject(new Error('Payment declined. Please check your card details and try again.'));
            }
        }, 2000);
    });
}

// ==================== SAVE ORDER TO BACKEND ====================
async function saveOrderToBackend(order, paymentData) {
    try {
        console.log('Saving order to backend:', order.id);

        // Try to save to backend API
        const response = await fetch(`${BACKEND_URL}/api/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                order: order,
                transactionId: paymentData?.transactionId || null
            })
        });

        if (response.ok) {
            console.log('✓ Order saved to backend');
            return await response.json();
        } else {
            console.warn('Backend save failed, using localStorage');
            saveOrderToLocalStorage(order);
            return { success: true, order };
        }

    } catch (error) {
        console.warn('Backend connection failed, using localStorage:', error);
        saveOrderToLocalStorage(order);
        return { success: true, order };
    }
}

// ==================== SAVE ORDER TO LOCAL STORAGE ====================
function saveOrderToLocalStorage(order) {
    try {
        const orders = JSON.parse(localStorage.getItem('evansOrders') || '[]');
        orders.push({
            ...order,
            paymentStatus: 'completed',
            status: 'confirmed'
        });
        localStorage.setItem('evansOrders', JSON.stringify(orders));
        console.log('✓ Order saved to localStorage');
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
}

// ==================== UI HELPERS ====================
function showLoadingOverlay(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = show ? 'flex' : 'none';
    }
}

function showErrorMessage(message) {
    // Create error alert
    const alert = document.createElement('div');
    alert.className = 'error-alert';
    alert.innerHTML = `
        <div class="error-alert__content">
            <p class="error-alert__title">❌ Error</p>
            <p class="error-alert__message">${message}</p>
            <button class="error-alert__close">Close</button>
        </div>
    `;
    document.body.appendChild(alert);

    // Remove on close
    alert.querySelector('.error-alert__close').addEventListener('click', () => {
        alert.remove();
    });

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (alert.parentElement) {
            alert.remove();
        }
    }, 5000);
}

// ==================== STRIPE INTEGRATION PLACEHOLDER ====================
// TODO: Phase 2 - Implement real Stripe integration
/*
async function integrateStripe(order) {
    // Load Stripe.js
    const stripe = await loadStripe(STRIPE_PUBLIC_KEY);
    
    // Create payment method
    const { paymentIntent } = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order })
    }).then(r => r.json());
    
    // Confirm payment
    const result = await stripe.confirmCardPayment(paymentIntent.client_secret, {
        payment_method: {
            card: cardElement,
            billing_details: {
                name: order.customer.fullName,
                email: order.customer.email
            }
        }
    });
    
    if (result.paymentIntent.status === 'succeeded') {
        return saveOrderToBackend(order);
    }
}
*/

// ==================== PAYPAL INTEGRATION PLACEHOLDER ====================
// TODO: Phase 2 - Implement real PayPal integration
/*
function integratePayPal() {
    // Load PayPal SDK
    // Create PayPal button
    // Handle approval callback
    // Capture transaction
}
*/

// ==================== ERROR ALERT STYLES ====================
const errorAlertStyle = document.createElement('style');
errorAlertStyle.textContent = `
    .error-alert {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        animation: fadeIn 0.3s ease;
    }
    
    .error-alert__content {
        background: white;
        padding: 2rem;
        border-radius: 1rem;
        max-width: 400px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    }
    
    .error-alert__title {
        font-size: 1.25rem;
        font-weight: 600;
        margin-bottom: 0.5rem;
    }
    
    .error-alert__message {
        color: #666;
        margin-bottom: 1rem;
    }
    
    .error-alert__close {
        background-color: #8b6f47;
        color: white;
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 0.5rem;
        cursor: pointer;
        font-weight: 600;
    }
    
    .error-alert__close:hover {
        background-color: #4a3728;
    }
    
    @keyframes fadeIn {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }
`;
document.head.appendChild(errorAlertStyle);

// ==================== EXPORT FOR TESTING ====================
window.checkoutManager = {
    createOrder: createOrderObject,
    generateOrderId: generateOrderId,
    validateForm: validateCheckoutForm
};
