/* ====================================================================
   BACKEND EXAMPLE - Firebase Cloud Functions
   Phase 2 Backend Integration for Evan's Bakery (Serverless)
   
   Setup:
   npm install -g firebase-tools
   firebase init functions
   npm install stripe axios
   
   Deploy: firebase deploy --only functions
   ================================================================== */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const stripe = require('stripe')(functions.config().stripe.secret_key);
const axios = require('axios');

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// ==================== CONSTANTS ====================
const PAYPAL_CLIENT_ID = functions.config().paypal.client_id;
const PAYPAL_SECRET = functions.config().paypal.secret;

// ==================== CREATE PAYMENT INTENT (Stripe) ====================
exports.createPaymentIntent = functions.https.onCall(async (data, context) => {
    try {
        const { order } = data;

        if (!order || !order.pricing || !order.pricing.total) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'Invalid order data'
            );
        }

        // Create Stripe payment intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(order.pricing.total * 100),
            currency: 'usd',
            description: `Order ${order.id} from Evan's Bakery`,
            metadata: {
                orderId: order.id,
                customerEmail: order.customer.email
            }
        });

        return {
            clientSecret: paymentIntent.client_secret,
            intentId: paymentIntent.id
        };

    } catch (error) {
        console.error('Error creating payment intent:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// ==================== CONFIRM STRIPE PAYMENT ====================
exports.confirmPayment = functions.https.onCall(async (data, context) => {
    try {
        const { paymentIntentId, order } = data;

        // Retrieve payment intent
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status === 'succeeded') {
            // Save order to Firestore
            const savedOrder = await saveOrderToFirestore(order, paymentIntent.id, 'completed');

            // Send confirmation email
            await sendOrderConfirmationEmail(order);

            return {
                success: true,
                order: savedOrder,
                transactionId: paymentIntent.id
            };
        } else {
            throw new functions.https.HttpsError(
                'failed-precondition',
                'Payment not completed'
            );
        }

    } catch (error) {
        console.error('Error confirming payment:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// ==================== CREATE PAYPAL ORDER ====================
exports.createPayPalOrder = functions.https.onCall(async (data, context) => {
    try {
        const { order } = data;
        const accessToken = await getPayPalAccessToken();

        const paypalOrder = {
            intent: 'CAPTURE',
            purchase_units: [
                {
                    amount: {
                        currency_code: 'USD',
                        value: order.pricing.total.toString(),
                        breakdown: {
                            item_total: {
                                currency_code: 'USD',
                                value: order.pricing.subtotal.toString()
                            },
                            shipping: {
                                currency_code: 'USD',
                                value: order.pricing.shipping.toString()
                            },
                            tax_total: {
                                currency_code: 'USD',
                                value: order.pricing.tax.toString()
                            }
                        }
                    },
                    items: order.items.map(item => ({
                        name: item.name,
                        quantity: item.quantity.toString(),
                        unit_amount: {
                            currency_code: 'USD',
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

        return {
            orderId: response.data.id,
            status: response.data.status
        };

    } catch (error) {
        console.error('Error creating PayPal order:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// ==================== CAPTURE PAYPAL PAYMENT ====================
exports.capturePayPalPayment = functions.https.onCall(async (data, context) => {
    try {
        const { paypalOrderId, order } = data;
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
            const transactionId = response.data.purchase_units[0].payments.captures[0].id;
            
            // Save order to Firestore
            const savedOrder = await saveOrderToFirestore(order, transactionId, 'completed');

            // Send confirmation email
            await sendOrderConfirmationEmail(order);

            return {
                success: true,
                order: savedOrder,
                transactionId: transactionId
            };
        } else {
            throw new functions.https.HttpsError(
                'failed-precondition',
                'Payment not completed'
            );
        }

    } catch (error) {
        console.error('Error capturing PayPal payment:', error);
        throw new functions.https.HttpsError('internal', error.message);
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

// ==================== SAVE ORDER TO FIRESTORE ====================
async function saveOrderToFirestore(order, transactionId, paymentStatus) {
    const orderData = {
        ...order,
        transactionId: transactionId,
        paymentStatus: paymentStatus,
        status: 'confirmed',
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now()
    };

    // Save to Firestore
    await db.collection('orders').doc(order.id).set(orderData);

    return {
        id: order.id,
        ...orderData
    };
}

// ==================== CREATE ORDER ====================
exports.createOrder = functions.https.onCall(async (data, context) => {
    try {
        const { order, transactionId } = data;

        if (!order.id || !order.customer.email) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'Invalid order data'
            );
        }

        // Save order
        const savedOrder = await saveOrderToFirestore(order, transactionId, 'pending');

        return {
            success: true,
            order: savedOrder
        };

    } catch (error) {
        console.error('Error creating order:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// ==================== GET ORDER ====================
exports.getOrder = functions.https.onCall(async (data, context) => {
    try {
        const { orderId } = data;

        const orderDoc = await db.collection('orders').doc(orderId).get();

        if (!orderDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Order not found');
        }

        return {
            id: orderDoc.id,
            ...orderDoc.data()
        };

    } catch (error) {
        console.error('Error retrieving order:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// ==================== GET ALL ORDERS ====================
exports.getAllOrders = functions.https.onCall(async (data, context) => {
    try {
        const ordersSnapshot = await db
            .collection('orders')
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();

        const orders = [];
        ordersSnapshot.forEach(doc => {
            orders.push({
                id: doc.id,
                ...doc.data()
            });
        });

        return {
            total: orders.length,
            orders: orders
        };

    } catch (error) {
        console.error('Error retrieving orders:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// ==================== SEND EMAIL CONFIRMATION ====================
async function sendOrderConfirmationEmail(order) {
    // Using Cloud Functions for Firebase with SendGrid
    const nodeMailer = require('nodemailer');

    // Configure based on your email service
    // Example: SendGrid, Mailgun, SMTP, etc.

    const transporter = nodeMailer.createTransport({
        // Configure based on your email provider
    });

    const emailHTML = generateOrderConfirmationHTML(order);

    await transporter.sendMail({
        from: 'noreply@evansbakery.com',
        to: order.customer.email,
        subject: `Order Confirmation - ${order.id}`,
        html: emailHTML
    });
}

// ==================== GENERATE ORDER CONFIRMATION EMAIL HTML ====================
function generateOrderConfirmationHTML(order) {
    const itemsHTML = order.items
        .map(item => `
            <tr>
                <td>${item.name}</td>
                <td align="center">${item.quantity}</td>
                <td align="right">$${item.price.toFixed(2)}</td>
                <td align="right">$${item.total.toFixed(2)}</td>
            </tr>
        `)
        .join('');

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #8B6F47; color: white; padding: 20px; text-align: center; }
                .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; }
                .section h3 { margin-top: 0; color: #8B6F47; }
                table { width: 100%; border-collapse: collapse; }
                th { background: #f5f5f5; padding: 10px; text-align: left; }
                td { padding: 10px; border-bottom: 1px solid #ddd; }
                .total { font-weight: bold; font-size: 1.2em; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🍫 Evan's Bakery</h1>
                    <p>Order Confirmation</p>
                </div>

                <div class="section">
                    <h3>Thank you for your order!</h3>
                    <p>Order ID: <strong>${order.id}</strong></p>
                    <p>Order Date: ${new Date(order.timestamp).toLocaleDateString()}</p>
                </div>

                <div class="section">
                    <h3>Customer Information</h3>
                    <p><strong>Name:</strong> ${order.customer.fullName}</p>
                    <p><strong>Email:</strong> ${order.customer.email}</p>
                    <p><strong>Phone:</strong> ${order.customer.phone}</p>
                </div>

                <div class="section">
                    <h3>Shipping Address</h3>
                    <p>${order.shippingAddress.address}<br>
                    ${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.zipcode}</p>
                </div>

                <div class="section">
                    <h3>Order Items</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th align="center">Quantity</th>
                                <th align="right">Price</th>
                                <th align="right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHTML}
                        </tbody>
                    </table>
                </div>

                <div class="section">
                    <h3>Order Summary</h3>
                    <table>
                        <tr>
                            <td>Subtotal:</td>
                            <td align="right">$${order.pricing.subtotal.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td>Shipping (${order.shippingMethod}):</td>
                            <td align="right">$${order.pricing.shipping.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td>Tax:</td>
                            <td align="right">$${order.pricing.tax.toFixed(2)}</td>
                        </tr>
                        <tr class="total">
                            <td>TOTAL:</td>
                            <td align="right">$${order.pricing.total.toFixed(2)}</td>
                        </tr>
                    </table>
                </div>

                <div class="section">
                    <p>Your order is being prepared. You will receive tracking information shortly.</p>
                    <p>Questions? Contact us at support@evansbakery.com</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// ==================== STRIPE WEBHOOK ====================
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
    const sig = req.headers['stripe-signature'];

    try {
        const event = stripe.webhooks.constructEvent(
            req.rawBody,
            sig,
            functions.config().stripe.webhook_secret
        );

        // Handle event
        switch (event.type) {
            case 'payment_intent.succeeded':
                console.log('Payment succeeded:', event.data.object);
                // Update order status
                break;

            case 'payment_intent.payment_failed':
                console.log('Payment failed:', event.data.object);
                // Notify customer
                break;
        }

        res.json({received: true});

    } catch (error) {
        console.error('Webhook error:', error);
        res.status(400).send(`Webhook Error: ${error.message}`);
    }
});

// ==================== PAYPAL WEBHOOK ====================
exports.paypalWebhook = functions.https.onRequest(async (req, res) => {
    const event = req.body;

    try {
        // Verify webhook signature
        // TODO: Implement PayPal webhook verification

        // Handle events
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
        res.status(500).json({error: error.message});
    }
});

// ==================== EXPORT TO GOOGLE SHEETS ====================
// TODO: Implement Google Sheets API integration
exports.exportOrderToSheets = functions.https.onCall(async (data, context) => {
    try {
        const { orderId } = data;

        // Retrieve order
        const order = await db.collection('orders').doc(orderId).get();

        if (!order.exists) {
            throw new Error('Order not found');
        }

        // TODO: Use Google Sheets API to append row
        // const sheets = google.sheets({version: 'v4', auth});
        // await sheets.spreadsheets.values.append({...});

        return {
            success: true,
            message: 'Order exported to Google Sheets'
        };

    } catch (error) {
        console.error('Export error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

module.exports = {
    createPaymentIntent,
    confirmPayment,
    createPayPalOrder,
    capturePayPalPayment,
    createOrder,
    getOrder,
    getAllOrders,
    stripeWebhook,
    paypalWebhook,
    exportOrderToSheets
};
