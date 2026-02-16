/* ====================================================================
   WHATSAPP INTEGRATION - whatsapp-handler.js
   Handles WhatsApp message sending via Twilio or Meta API
   ================================================================== */

// ==================== TWILIO SETUP ====================
/**
 * Install Twilio SDK:
 * npm install twilio
 * 
 * Then require it:
 */
// const twilio = require('twilio');

// ==================== SEND WHATSAPP MESSAGE (TWILIO) ====================
/**
 * Express middleware for sending WhatsApp messages via Twilio
 * 
 * POST /api/whatsapp/send
 * 
 * Request body:
 * {
 *   message: "Your order message",
 *   userPhone: "(555) 123-4567",
 *   service: "twilio"
 * }
 */
async function sendWhatsAppViaTwilio(req, res) {
    try {
        const { message, userPhone, service } = req.body;

        // Validate inputs
        if (!message || !userPhone) {
            return res.status(400).json({
                error: 'Missing required fields: message, userPhone'
            });
        }

        // Check if Twilio is configured
        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
            console.warn('⚠️ Twilio credentials not configured');
            return res.status(500).json({
                error: 'Twilio not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env'
            });
        }

        // Initialize Twilio client
        const twilio = require('twilio');
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const client = twilio(accountSid, authToken);

        // Format phone number for Twilio
        // Remove all non-digit characters
        const phoneDigits = userPhone.replace(/\D/g, '');
        
        // Add country code if not present (US default: 1)
        let formattedPhone = phoneDigits;
        if (!phoneDigits.startsWith('1') && phoneDigits.length === 10) {
            formattedPhone = '1' + phoneDigits;
        }
        
        const phoneWithPlus = '+' + formattedPhone;

        console.log(`📱 Sending WhatsApp message to ${phoneWithPlus}...`);

        // Send message via Twilio WhatsApp
        const result = await client.messages.create({
            from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886'}`, // Default: Twilio sandbox
            to: `whatsapp:${phoneWithPlus}`,
            body: message
        });

        console.log(`✓ WhatsApp message sent! SID: ${result.sid}`);

        // Log delivery attempt
        logWhatsAppDelivery({
            service: 'twilio',
            toPhone: phoneWithPlus,
            messageSid: result.sid,
            status: 'sent',
            timestamp: new Date()
        });

        // Return success response
        res.json({
            success: true,
            service: 'twilio',
            messageSid: result.sid,
            toPhone: phoneWithPlus,
            timestamp: new Date(),
            message: 'Message queued for delivery'
        });

    } catch (error) {
        console.error('❌ Twilio WhatsApp Error:', error);

        // Log error
        logWhatsAppDelivery({
            service: 'twilio',
            status: 'failed',
            error: error.message,
            timestamp: new Date()
        });

        // Return error response
        res.status(500).json({
            success: false,
            error: 'Failed to send WhatsApp message via Twilio',
            details: error.message,
            errorCode: error.code
        });
    }
}

// ==================== SEND WHATSAPP MESSAGE (META API) ====================
/**
 * Send WhatsApp message via Meta's WhatsApp Business API
 * Requires: Phone Number ID and Access Token
 */
async function sendWhatsAppViaMeta(req, res) {
    try {
        const { message, userPhone, service } = req.body;

        // Validate inputs
        if (!message || !userPhone) {
            return res.status(400).json({
                error: 'Missing required fields: message, userPhone'
            });
        }

        // Check if Meta credentials are configured
        if (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN) {
            console.warn('⚠️ Meta WhatsApp credentials not configured');
            return res.status(500).json({
                error: 'Meta WhatsApp not configured. Please set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in .env'
            });
        }

        // Format phone number for Meta
        const phoneDigits = userPhone.replace(/\D/g, '');
        let formattedPhone = phoneDigits;
        if (!phoneDigits.startsWith('1') && phoneDigits.length === 10) {
            formattedPhone = '1' + phoneDigits;
        }
        const phoneWithPlus = '+' + formattedPhone;

        console.log(`📱 Sending WhatsApp via Meta to ${phoneWithPlus}...`);

        // Send message via Meta API
        const response = await fetch(
            `https://graph.instagram.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: phoneWithPlus,
                    type: 'text',
                    text: {
                        preview_url: false,
                        body: message
                    }
                })
            }
        );

        // Parse response
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error?.message || 'Failed to send message');
        }

        console.log(`✓ WhatsApp via Meta sent! Message ID: ${result.messages[0].id}`);

        // Log delivery attempt
        logWhatsAppDelivery({
            service: 'meta',
            toPhone: phoneWithPlus,
            messageId: result.messages[0].id,
            status: 'sent',
            timestamp: new Date()
        });

        // Return success response
        res.json({
            success: true,
            service: 'meta',
            messageId: result.messages[0].id,
            toPhone: phoneWithPlus,
            timestamp: new Date(),
            message: 'Message sent successfully'
        });

    } catch (error) {
        console.error('❌ Meta WhatsApp Error:', error);

        // Log error
        logWhatsAppDelivery({
            service: 'meta',
            status: 'failed',
            error: error.message,
            timestamp: new Date()
        });

        // Return error response
        res.status(500).json({
            success: false,
            error: 'Failed to send WhatsApp message via Meta',
            details: error.message
        });
    }
}

// ==================== MAIN ROUTER ====================
/**
 * Export this function and add to your Express app:
 * 
 * const { setupWhatsAppRoutes } = require('./whatsapp-handler');
 * app.use('/api/whatsapp', setupWhatsAppRoutes());
 */
function setupWhatsAppRoutes() {
    const express = require('express');
    const router = express.Router();

    // Route: POST /api/whatsapp/send
    router.post('/send', async (req, res) => {
        const { service } = req.body;

        // Route to appropriate service
        if (service === 'twilio') {
            return sendWhatsAppViaTwilio(req, res);
        } else if (service === 'whatsapp-api' || service === 'meta') {
            return sendWhatsAppViaMeta(req, res);
        } else {
            // Default to Twilio
            return sendWhatsAppViaTwilio(req, res);
        }
    });

    // Route: GET /api/whatsapp/status
    router.get('/status', (req, res) => {
        res.json({
            status: 'WhatsApp integration active',
            services: {
                twilio: !!process.env.TWILIO_ACCOUNT_SID,
                meta: !!process.env.WHATSAPP_PHONE_NUMBER_ID
            },
            timestamp: new Date()
        });
    });

    // Route: GET /api/whatsapp/logs
    router.get('/logs', (req, res) => {
        res.json({
            logs: getWhatsAppLogs(),
            timestamp: new Date()
        });
    });

    return router;
}

// ==================== LOGGING & MONITORING ====================
// In-memory log storage (use database for production)
let whatsappLogs = [];

function logWhatsAppDelivery(data) {
    const logEntry = {
        id: Date.now().toString(),
        ...data,
        timestamp: new Date().toISOString()
    };

    whatsappLogs.push(logEntry);

    // Keep only last 100 logs in memory
    if (whatsappLogs.length > 100) {
        whatsappLogs = whatsappLogs.slice(-100);
    }

    // Also log to console
    if (data.status === 'sent') {
        console.log(`✓ [${data.service}] WhatsApp sent to ${data.toPhone}`);
    } else if (data.status === 'failed') {
        console.error(`✗ [${data.service}] WhatsApp failed: ${data.error}`);
    }

    // TODO: Save to database for production
    // await WhatsAppLog.create(logEntry);
}

function getWhatsAppLogs() {
    return whatsappLogs.map(log => ({
        ...log,
        ago: getTimeAgo(new Date(log.timestamp))
    }));
}

function getTimeAgo(date) {
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

// ==================== EXPORTS ====================
module.exports = {
    setupWhatsAppRoutes,
    sendWhatsAppViaTwilio,
    sendWhatsAppViaMeta,
    logWhatsAppDelivery,
    getWhatsAppLogs
};

// ==================== USAGE IN EXPRESS APP ====================
/**
 * Example integration:
 * 
 * const express = require('express');
 * const { setupWhatsAppRoutes } = require('./whatsapp-handler');
 * 
 * const app = express();
 * 
 * // Middleware
 * app.use(express.json());
 * app.use(express.urlencoded({ extended: true }));
 * 
 * // WhatsApp routes
 * app.use('/api/whatsapp', setupWhatsAppRoutes());
 * 
 * // Start server
 * app.listen(5000, () => {
 *     console.log('✓ Server running on port 5000');
 *     console.log('✓ WhatsApp API available at /api/whatsapp');
 * });
 */
