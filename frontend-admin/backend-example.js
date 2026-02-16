/* ====================================================================
   BACKEND EXAMPLE - Node.js with Express
   Phase 2 Backend Integration for Evan's Bakery
   
   Setup:
   npm init -y
   npm install express cors dotenv stripe axios
   
   ================================================================== */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');

const app = express();

// ==================== MIDDLEWARE ====================
app.use(cors());
app.use(express.json());

// ==================== ENVIRONMENT VARIABLES ====================
const PORT = process.env.PORT || 5000;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;

// In-memory order storage (replace with database)
const orders = [];

// ==================== HEALTH CHECK ====================
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Evan\'s Bakery API is running' });
});

// ==================== CREATE PAYMENT INTENT (Stripe) ====================
app.post('/api/create-payment-intent', async (req, res) => {
    try {
        const { order } = req.body;

        if (!order || !order.pricing || !order.pricing.total) {
            return res.status(400).json({ error: 'Invalid order data' });
        }

        // Create Stripe payment intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(order.pricing.total * 100), // Convert to cents
            currency: 'bdt',
            description: `Order ${order.id} from Evan's Bakery`,
            metadata: {
                orderId: order.id,
                customerEmail: order.customer.email
            }
        });

        res.json({
            clientSecret: paymentIntent.client_secret,
            intentId: paymentIntent.id
        });

    } catch (error) {
        console.error('Payment intent error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== CONFIRM STRIPE PAYMENT ====================
app.post('/api/confirm-payment', async (req, res) => {
    try {
        const { paymentIntentId, order } = req.body;

        // Retrieve payment intent
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status === 'succeeded') {
            // Payment successful - save order
            const savedOrder = await saveOrder(order, paymentIntent.id, 'completed');
            
            res.json({
                success: true,
                order: savedOrder,
                transactionId: paymentIntent.id
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'Payment not completed'
            });
        }

    } catch (error) {
        console.error('Payment confirmation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== PAYPAL CREATE ORDER ====================
app.post('/api/paypal/create-order', async (req, res) => {
    try {
        const { order } = req.body;
        const accessToken = await getPayPalAccessToken();

        const paypalOrder = {
            intent: 'CAPTURE',
            purchase_units: [
                {
                    amount: {
                        currency_code: 'BDT',
                        value: order.pricing.total.toString(),
                        breakdown: {
                            item_total: {
                                currency_code: 'BDT',
                                value: order.pricing.subtotal.toString()
                            },
                            shipping: {
                                currency_code: 'BDT',
                                value: order.pricing.shipping.toString()
                            },
                            tax_total: {
                                currency_code: 'BDT',
                                value: order.pricing.tax.toString()
                            }
                        }
                    },
                    items: order.items.map(item => ({
                        name: item.name,
                        quantity: item.quantity.toString(),
                        unit_amount: {
                            currency_code: 'BDT',
                            value: item.price.toString()
                        }
                    })),
                    shipping: {
                        name: {
                            full_name: order.customer.fullName
                        },
                        address: {
                            address_line_1: order.shippingAddress.address,
                            admin_area_2: order.shippingAddress.city,
                            admin_area_1: order.shippingAddress.state,
                            postal_code: order.shippingAddress.zipcode,
                            country_code: 'US'
                        }
                    }
                }
            ]
        };

        const response = await axios.post(
            'https://api.sandbox.paypal.com/v2/checkout/orders',
            paypalOrder,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        res.json({
            orderId: response.data.id,
            status: response.data.status
        });

    } catch (error) {
        console.error('PayPal order creation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== PAYPAL CAPTURE PAYMENT ====================
app.post('/api/paypal/capture-payment', async (req, res) => {
    try {
        const { paypalOrderId, order } = req.body;
        const accessToken = await getPayPalAccessToken();

        const response = await axios.post(
            `https://api.sandbox.paypal.com/v2/checkout/orders/${paypalOrderId}/capture`,
            {},
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data.status === 'COMPLETED') {
            // Payment successful - save order
            const transactionId = response.data.purchase_units[0].payments.captures[0].id;
            const savedOrder = await saveOrder(order, transactionId, 'completed');

            res.json({
                success: true,
                order: savedOrder,
                transactionId: transactionId
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'Payment not completed'
            });
        }

    } catch (error) {
        console.error('PayPal capture error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== GET PAYPAL ACCESS TOKEN ====================
async function getPayPalAccessToken() {
    const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64');

    const response = await axios.post(
        'https://api.sandbox.paypal.com/v1/oauth2/token',
        'grant_type=client_credentials',
        {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }
    );

    return response.data.access_token;
}

// ==================== SAVE ORDER ====================
async function saveOrder(order, transactionId, paymentStatus) {
    const savedOrder = {
        ...order,
        transactionId: transactionId,
        paymentStatus: paymentStatus,
        status: 'confirmed',
        savedAt: new Date().toISOString()
    };

    // TODO: Save to database (MongoDB, PostgreSQL, Firebase, etc)
    // Example with MongoDB:
    // await Order.create(savedOrder);

    // For now, save to in-memory array
    orders.push(savedOrder);

    // TODO: Send confirmation email
    // await sendOrderConfirmationEmail(savedOrder);

    return savedOrder;
}

// ==================== CREATE ORDER ENDPOINT ====================
app.post('/api/orders', async (req, res) => {
    try {
        const { order, transactionId } = req.body;

        // Validate order
        if (!order.id || !order.customer.email) {
            return res.status(400).json({ error: 'Invalid order data' });
        }

        // Save order
        const savedOrder = await saveOrder(order, transactionId, 'pending');

        res.status(201).json({
            success: true,
            order: savedOrder
        });

    } catch (error) {
        console.error('Order creation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== GET ORDER ====================
app.get('/api/orders/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;

        // TODO: Query database
        // const order = await Order.findById(orderId);

        const order = orders.find(o => o.id === orderId);

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json(order);

    } catch (error) {
        console.error('Order retrieval error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== GET ALL ORDERS ====================
app.get('/api/orders', async (req, res) => {
    try {
        // TODO: Query database with pagination
        // const orders = await Order.find().limit(50);

        res.json({
            total: orders.length,
            orders: orders
        });

    } catch (error) {
        console.error('Orders retrieval error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== WEBHOOK - STRIPE ====================
app.post('/webhook/stripe', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];

    try {
        const event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );

        // Handle event
        switch (event.type) {
            case 'payment_intent.succeeded':
                console.log('Payment succeeded:', event.data.object);
                break;
            case 'payment_intent.payment_failed':
                console.log('Payment failed:', event.data.object);
                break;
        }

        res.json({received: true});

    } catch (error) {
        console.error('Webhook error:', error);
        res.status(400).send(`Webhook Error: ${error.message}`);
    }
});

// ==================== WEBHOOK - PAYPAL ====================
app.post('/webhook/paypal', async (req, res) => {
    const event = req.body;

    try {
        // Verify webhook signature
        // const verified = await verifyPayPalWebhook(event);

        // if (!verified) {
        //     return res.status(400).json({ error: 'Invalid webhook signature' });
        // }

        // Handle PayPal events
        switch (event.event_type) {
            case 'CHECKOUT.ORDER.COMPLETED':
                console.log('PayPal order completed:', event);
                break;
            case 'PAYMENT.CAPTURE.COMPLETED':
                console.log('PayPal capture completed:', event);
                break;
        }

        res.json({success: true});

    } catch (error) {
        console.error('PayPal webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== SEND EMAIL CONFIRMATION ====================
// TODO: Implement email sending (SendGrid, Nodemailer, etc)
async function sendOrderConfirmationEmail(order) {
    /*
    Example with SendGrid:
    
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const msg = {
        to: order.customer.email,
        from: 'noreply@evansbakery.com',
        subject: `Order Confirmation - ${order.id}`,
        html: generateOrderEmailHTML(order)
    };

    await sgMail.send(msg);
    */
}

// ==================== ERROR HANDLING ====================
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
    console.log(`
    🍫 Artisan Bakery API Server
    ============================
    Running on http://localhost:${PORT}
    
    Available Endpoints:
    - GET  /health
    - POST /api/create-payment-intent
    - POST /api/confirm-payment
    - POST /api/orders
    - GET  /api/orders/:orderId
    - GET  /api/orders
    - POST /api/paypal/create-order
    - POST /api/paypal/capture-payment
    - POST /webhook/stripe
    - POST /webhook/paypal
    
    Environment Variables Required:
    - STRIPE_SECRET_KEY
    - PAYPAL_CLIENT_ID
    - PAYPAL_SECRET
    - STRIPE_WEBHOOK_SECRET (optional)
    ============================
    `);
});

module.exports = app;
