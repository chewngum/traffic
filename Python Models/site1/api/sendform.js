// api/sendform.js
// Contact and Feedback Form API endpoint using AWS SES

import { sendContactFormEmail, sendContactFormConfirmation, sendFeedbackEmail } from '../lib/email-service.js';

export default async function handler(req, res) {
  console.log('=== SendForm API Called ===');
  console.log('Method:', req.method);
  console.log('Body:', JSON.stringify(req.body, null, 2));

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    console.log('❌ Method not allowed:', req.method);
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.'
    });
  }

  try {
    // Extract and validate form data
    const {
      feedbackType,
      name,
      email,
      company,
      inquiryType,
      subject,
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
      subject,
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

    // Get client IP for logging
    const clientIP = req.headers['x-forwarded-for'] ||
                     req.headers['x-real-ip'] ||
                     req.connection?.remoteAddress ||
                     'unknown';
    console.log('Client IP:', clientIP);

    // Prepare email data
    const emailData = {
      name: name || 'Anonymous User',
      email: email || 'Not provided',
      company: company || 'Not provided',
      inquiryType: inquiryType || 'Not specified',
      subject: subject || `${feedbackType === 'contact' ? 'Contact Form' : 'Feedback'} from ${name || 'Anonymous'}`,
      message: message,
      timestamp: timestamp || new Date().toISOString(),
      page: page || 'Unknown page',
      url: url || 'Not provided',
      userAccessLevel: userAccessLevel,
      ipAddress: clientIP
    };

    console.log('Sending email via AWS SES...');

    // Send email based on feedback type
    if (feedbackType === 'contact') {
      // Contact form submission
      await sendContactFormEmail(emailData);

      // Send confirmation to user if email provided
      if (email && email !== 'Not provided') {
        sendContactFormConfirmation(email, name || 'there')
          .catch(err => console.error('Confirmation email failed:', err));
      }

      console.log(`✅ Contact form submitted from ${email || 'anonymous'}`);
    } else {
      // Feedback form submission (bug, feature, improvement, other)
      await sendFeedbackEmail({
        ...emailData,
        feedbackType
      });

      console.log(`✅ Feedback submitted: ${feedbackType} from ${email || 'anonymous'}`);
    }

    return res.status(200).json({
      success: true,
      message: 'Your message has been sent successfully. Thank you for contacting us!'
    });

  } catch (error) {
    console.error('❌ SendForm API error:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({
      success: false,
      error: 'Failed to send message. Please try again later.',
      debug: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
