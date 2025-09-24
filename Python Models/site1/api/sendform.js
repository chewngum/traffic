// api/sendform.js
// Secure contact form API endpoint with enhanced debugging

export default async function handler(req, res) {
    console.log('=== SendForm API Called ===');
    console.log('Method:', req.method);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));

    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        console.log('❌ Method not allowed:', req.method);
        return res.status(405).json({ 
            success: false, 
            error: 'Method not allowed. Use POST.' 
        });
    }

    try {
        // Check environment variables
        console.log('Environment check:', {
            hasServiceId: !!process.env.EMAILJS_SERVICE_ID,
            hasUserId: !!process.env.EMAILJS_USER_ID,
            hasPrivateKey: !!process.env.EMAILJS_PRIVATE_KEY,
            hasContactTemplate: !!process.env.EMAILJS_TEMPLATE_CONTACT,
            hasFeedbackTemplate: !!process.env.EMAILJS_TEMPLATE_FEEDBACK
        });

        // Validate authorization token if provided (optional feature)
        const authHeader = req.headers.authorization;
        let userInfo = null;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            console.log('Processing auth header...');
            const token = authHeader.substring(7);
            try {
                const decoded = Buffer.from(token, 'base64').toString('utf-8');
                const [timestamp, username, accessLevel] = decoded.split(':');
                const tokenAge = Date.now() - parseInt(timestamp);
                const expiryHours = 24; // Default expiry
                
                if (tokenAge < expiryHours * 60 * 60 * 1000) {
                    userInfo = { username, accessLevel };
                    console.log('✅ Valid user token:', userInfo);
                } else {
                    console.log('⚠️ Expired token');
                }
            } catch (e) {
                console.log('⚠️ Invalid token format:', e.message);
            }
        }

        // Extract and validate form data
        const {
            feedbackType,
            name,
            email = 'Not provided',
            company,
            inquiryType,
            message,
            timestamp,
            page,
            url,
            userAccessLevel = 0
        } = req.body || {};

        console.log('Form data extracted:', {
            feedbackType,
            name,
            email,
            company,
            inquiryType,
            messageLength: message?.length || 0,
            timestamp,
            page,
            url
        });

        // Basic validation
        if (!feedbackType || !message || !message.trim()) {
            console.log('❌ Validation failed: missing required fields');
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: feedbackType and message'
            });
        }

        if (message.length > 5000) {
            console.log('❌ Message too long:', message.length);
            return res.status(400).json({
                success: false,
                error: 'Message too long. Maximum 5000 characters.'
            });
        }

        // Rate limiting placeholder (not implemented)
        const clientIP = req.headers['x-forwarded-for'] || 
                         req.headers['x-real-ip'] || 
                         req.connection?.remoteAddress || 
                         'unknown';
        console.log('Client IP:', clientIP);

        // Prepare email data (matches EmailJS template)
        const emailData = {
            from_name: name || (userInfo ? `${userInfo.username} (Level ${userInfo.accessLevel})` : 'Anonymous User'),
            from_email: email,
            company: company || 'Not provided',
            inquiry_type: inquiryType || 'Not specified',
            feedback_type: feedbackType,
            message: message,
            timestamp: timestamp || new Date().toISOString(),
            page_source: page || 'Unknown page',
            page_url: url || 'Not provided',
            user_access_level: userInfo ? `Level ${userInfo.accessLevel}` : `Level ${userAccessLevel}`,
            user_ip: clientIP,
            to_name: 'Support Team'
        };

        console.log('Email data prepared:', emailData);

        // Send email using EmailJS (server-side) with appropriate template
        console.log('Attempting to send email...');
        const emailResponse = await sendEmailViaEmailJS(emailData, feedbackType);
        
        console.log('Email response:', emailResponse);
        
        if (emailResponse.success) {
            console.log(`✅ Feedback submitted successfully: ${feedbackType} from ${email || 'anonymous'}`);
            return res.status(200).json({
                success: true,
                message: 'Feedback sent successfully'
            });
        } else {
            console.log('❌ Email sending failed:', emailResponse.error);
            throw new Error('Failed to send email: ' + emailResponse.error);
        }

    } catch (error) {
        console.error('❌ SendForm API error:', error);
        console.error('Error stack:', error.stack);
        return res.status(500).json({
            success: false,
            error: 'Internal server error. Please try again later.',
            debug: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

// Function to send email via EmailJS (server-side) with template selection
async function sendEmailViaEmailJS(templateParams, feedbackType) {
    console.log('📧 sendEmailViaEmailJS called with:', { feedbackType, templateParamsKeys: Object.keys(templateParams) });
    
    try {
        // EmailJS credentials (store securely in environment variables)
        const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
        const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY; // This is used as user_id
        const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;

        console.log('Environment variables loaded:', {
            hasServiceId: !!EMAILJS_SERVICE_ID,
            hasPublicKey: !!EMAILJS_PUBLIC_KEY,
            hasPrivateKey: !!EMAILJS_PRIVATE_KEY,
            serviceId: EMAILJS_SERVICE_ID ? `${EMAILJS_SERVICE_ID.substring(0, 8)}...` : 'missing',
            publicKey: EMAILJS_PUBLIC_KEY ? `${EMAILJS_PUBLIC_KEY.substring(0, 8)}...` : 'missing'
        });

        // Select appropriate template based on feedback type
        let templateId;
        if (feedbackType === 'contact') {
            // Home page contact form
            templateId = process.env.EMAILJS_TEMPLATE_CONTACT;
            console.log('Using contact template:', templateId ? `${templateId.substring(0, 8)}...` : 'missing');
        } else {
            // Compact feedback form (bug, feature, improvement, other)
            templateId = process.env.EMAILJS_TEMPLATE_FEEDBACK;
            console.log('Using feedback template:', templateId ? `${templateId.substring(0, 8)}...` : 'missing');
        }

        if (!EMAILJS_PUBLIC_KEY) {
            console.log('❌ EmailJS public key not configured');
            throw new Error('EmailJS public key not configured');
        }

        if (!EMAILJS_SERVICE_ID) {
            console.log('❌ EmailJS service ID not configured');
            throw new Error('EmailJS service ID not configured');
        }

        if (!templateId) {
            console.log(`❌ EmailJS template not configured for feedback type: ${feedbackType}`);
            throw new Error(`EmailJS template not configured for feedback type: ${feedbackType}`);
        }

        const emailPayload = {
            service_id: EMAILJS_SERVICE_ID,
            template_id: templateId,
            user_id: EMAILJS_PUBLIC_KEY, // Public Key goes in user_id field
            template_params: templateParams
        };

        // Add private key if available for additional security
        if (EMAILJS_PRIVATE_KEY) {
            emailPayload.accessToken = EMAILJS_PRIVATE_KEY;
        }

        console.log('Calling EmailJS API with payload keys:', Object.keys(emailPayload));
        console.log('Template params keys:', Object.keys(templateParams));

        // Call EmailJS API
        const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(emailPayload)
        });

        console.log('EmailJS API response status:', response.status);
        console.log('EmailJS API response ok:', response.ok);

        if (response.ok) {
            console.log('✅ EmailJS API call successful');
            return { success: true };
        } else {
            const errorText = await response.text();
            console.log('❌ EmailJS API error response:', errorText);
            return { 
                success: false, 
                error: `EmailJS API error: ${response.status} ${errorText}` 
            };
        }

    } catch (error) {
        console.error('❌ sendEmailViaEmailJS error:', error);
        console.error('Error stack:', error.stack);
        return { 
            success: false, 
            error: error.message 
        };
    }
}