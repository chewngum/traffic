// Mailgun Email Service for Traffic Labb
// Handles: Account creation, password reset, contact form, feedback

import formData from 'form-data';
import Mailgun from 'mailgun.js';

// Function to create Mailgun client with fresh credentials
function getMailgunClient() {
  const mailgun = new Mailgun(formData);

  const apiKey = (process.env.MAILGUN_API_KEY || "").trim();
  const domain = (process.env.MAILGUN_DOMAIN || "").trim();
  const apiUrl = process.env.MAILGUN_API_URL || 'https://api.mailgun.net'; // Default to US region

  if (!apiKey || !domain) {
    throw new Error('Mailgun credentials not configured. Set MAILGUN_API_KEY and MAILGUN_DOMAIN environment variables.');
  }

  return {
    client: mailgun.client({
      username: 'api',
      key: apiKey,
      url: apiUrl
    }),
    domain: domain
  };
}

// Function to get email configuration with current environment variables
function getEmailConfig() {
  return {
    FROM_EMAIL: process.env.FROM_EMAIL || "noreply@trafficlabb.com",
    FROM_NAME: "Traffic Labb",
    SUPPORT_EMAIL: process.env.SUPPORT_EMAIL || "support@trafficlabb.com",
    REPLY_TO: process.env.REPLY_TO_EMAIL || "support@trafficlabb.com"
  };
}

/**
 * Send email using Mailgun
 * @param {Object} params - Email parameters
 * @param {string} params.to - Recipient email
 * @param {string} params.subject - Email subject
 * @param {string} params.htmlBody - HTML email body
 * @param {string} params.textBody - Plain text email body
 * @param {string} params.replyTo - Reply-to email (optional)
 */
async function sendEmail({ to, subject, htmlBody, textBody, replyTo }) {
  try {
    const EMAIL_CONFIG = getEmailConfig();
    const { client, domain } = getMailgunClient();

    const messageData = {
      from: `${EMAIL_CONFIG.FROM_NAME} <${EMAIL_CONFIG.FROM_EMAIL}>`,
      to: [to],
      subject: subject,
      html: htmlBody,
      text: textBody,
      'h:Reply-To': replyTo || EMAIL_CONFIG.REPLY_TO
    };

    const response = await client.messages.create(domain, messageData);

    console.log(`Email sent successfully to ${to}. Message ID: ${response.id}`);
    return { success: true, messageId: response.id };

  } catch (error) {
    console.error("Mailgun email error:", error);

    // Provide more detailed error information
    if (error.response) {
      console.error("Mailgun API response:", error.response.data);
    }

    throw new Error(`Failed to send email: ${error.message}`);
  }
}

/**
 * Send welcome email for new account creation
 */
export async function sendWelcomeEmail(userEmail, userName) {
  const subject = "Welcome to Traffic Labb! 🚦";

  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #354e8d 0%, #496f9c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #6b99c2; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #6c757d; font-size: 0.85rem; }
        .feature-list { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .feature-list li { margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to Traffic Labb! 🚦</h1>
        </div>
        <div class="content">
          <h2>Hi ${userName},</h2>
          <p>Thank you for creating an account with Traffic Labb! We're excited to have you on board.</p>

          <p>Your account has been successfully created and you now have access to:</p>

          <div class="feature-list">
            <ul>
              <li>✓ Professional traffic simulation tools</li>
              <li>✓ Advanced analytics and reporting</li>
              <li>✓ Data export capabilities</li>
              <li>✓ Result history tracking</li>
              <li>✓ Priority support</li>
            </ul>
          </div>

          <p style="text-align: center;">
            <a href="${process.env.APP_URL || 'https://trafficlabb.com'}/login/" class="button">
              Get Started →
            </a>
          </p>

          <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>

          <p>Best regards,<br>The Traffic Labb Team</p>
        </div>
        <div class="footer">
          <p>This email was sent to ${userEmail}</p>
          <p>© ${new Date().getFullYear()} Traffic Labb. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textBody = `
Welcome to Traffic Labb!

Hi ${userName},

Thank you for creating an account with Traffic Labb! Your account has been successfully created.

You now have access to:
- Professional traffic simulation tools
- Advanced analytics and reporting
- Data export capabilities
- Result history tracking
- Priority support

Get started: ${process.env.APP_URL || 'https://trafficlabb.com'}/login/

If you have any questions, please contact our support team.

Best regards,
The Traffic Labb Team

This email was sent to ${userEmail}
© ${new Date().getFullYear()} Traffic Labb. All rights reserved.
  `;

  return sendEmail({
    to: userEmail,
    subject,
    htmlBody,
    textBody
  });
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(userEmail, userName, resetToken) {
  const resetUrl = `${process.env.APP_URL || 'https://trafficlabb.com'}/reset-password/?token=${resetToken}`;
  const subject = "Reset Your Traffic Labb Password 🔒";

  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #354e8d 0%, #496f9c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #6b99c2; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 6px; margin: 20px 0; color: #856404; }
        .footer { text-align: center; margin-top: 30px; color: #6c757d; font-size: 0.85rem; }
        .code-box { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; border: 2px dashed #6b99c2; text-align: center; font-family: monospace; font-size: 1.1rem; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔒 Password Reset Request</h1>
        </div>
        <div class="content">
          <h2>Hi ${userName},</h2>
          <p>We received a request to reset your Traffic Labb password.</p>

          <p>Click the button below to reset your password:</p>

          <p style="text-align: center;">
            <a href="${resetUrl}" class="button">
              Reset Password →
            </a>
          </p>

          <p>Or copy and paste this link into your browser:</p>
          <div class="code-box">${resetUrl}</div>

          <div class="warning">
            <strong>⏰ Important:</strong> This link will expire in 1 hour for security reasons.
          </div>

          <p><strong>If you didn't request this password reset, please ignore this email.</strong> Your password will remain unchanged.</p>

          <p>For security reasons, never share this link with anyone.</p>

          <p>Best regards,<br>The Traffic Labb Team</p>
        </div>
        <div class="footer">
          <p>This email was sent to ${userEmail}</p>
          <p>© ${new Date().getFullYear()} Traffic Labb. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textBody = `
Password Reset Request

Hi ${userName},

We received a request to reset your Traffic Labb password.

Reset your password by visiting this link:
${resetUrl}

⏰ Important: This link will expire in 1 hour for security reasons.

If you didn't request this password reset, please ignore this email. Your password will remain unchanged.

For security reasons, never share this link with anyone.

Best regards,
The Traffic Labb Team

This email was sent to ${userEmail}
© ${new Date().getFullYear()} Traffic Labb. All rights reserved.
  `;

  return sendEmail({
    to: userEmail,
    subject,
    htmlBody,
    textBody
  });
}

/**
 * Send contact form submission notification to support
 */
export async function sendContactFormEmail(formData) {
  const { name, email, subject: userSubject, message } = formData;
  const subject = `Contact Form: ${userSubject}`;

  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #354e8d 0%, #496f9c 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .info-box { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #6b99c2; }
        .message-box { background: white; padding: 20px; border-radius: 6px; margin: 15px 0; }
        .label { font-weight: 600; color: #354e8d; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>📧 New Contact Form Submission</h2>
        </div>
        <div class="content">
          <div class="info-box">
            <p><span class="label">From:</span> ${name}</p>
            <p><span class="label">Email:</span> ${email}</p>
            <p><span class="label">Subject:</span> ${userSubject}</p>
            <p><span class="label">Date:</span> ${new Date().toLocaleString()}</p>
          </div>

          <div class="message-box">
            <p class="label">Message:</p>
            <p>${message.replace(/\n/g, '<br>')}</p>
          </div>

          <p><em>Reply directly to this email to respond to ${name}.</em></p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textBody = `
New Contact Form Submission

From: ${name}
Email: ${email}
Subject: ${userSubject}
Date: ${new Date().toLocaleString()}

Message:
${message}

Reply directly to this email to respond to ${name}.
  `;

  const EMAIL_CONFIG = getEmailConfig();
  return sendEmail({
    to: EMAIL_CONFIG.SUPPORT_EMAIL,
    subject,
    htmlBody,
    textBody,
    replyTo: email // Support team can reply directly to the user
  });
}

/**
 * Send contact form confirmation to user
 */
export async function sendContactFormConfirmation(userEmail, userName) {
  const subject = "We Received Your Message ✓";

  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #354e8d 0%, #496f9c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .success-box { background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 6px; margin: 20px 0; color: #155724; }
        .footer { text-align: center; margin-top: 30px; color: #6c757d; font-size: 0.85rem; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✓ Message Received</h1>
        </div>
        <div class="content">
          <h2>Hi ${userName},</h2>

          <div class="success-box">
            <strong>Thank you for contacting us!</strong> We've received your message and will get back to you within 24 hours.
          </div>

          <p>Our support team reviews all messages carefully and will respond to your inquiry as soon as possible.</p>

          <p>In the meantime, you can:</p>
          <ul>
            <li>Check out our <a href="${process.env.APP_URL}/support/FAQ/">FAQ page</a> for common questions</li>
            <li>Explore our <a href="${process.env.APP_URL}/support/">support resources</a></li>
            <li>Continue using our <a href="${process.env.APP_URL}/traffic/">simulation tools</a></li>
          </ul>

          <p>Best regards,<br>The Traffic Labb Team</p>
        </div>
        <div class="footer">
          <p>This email was sent to ${userEmail}</p>
          <p>© ${new Date().getFullYear()} Traffic Labb. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textBody = `
Message Received

Hi ${userName},

Thank you for contacting us! We've received your message and will get back to you within 24 hours.

Our support team reviews all messages carefully and will respond to your inquiry as soon as possible.

In the meantime, you can:
- Check out our FAQ page: ${process.env.APP_URL}/support/FAQ/
- Explore our support resources: ${process.env.APP_URL}/support/
- Continue using our simulation tools: ${process.env.APP_URL}/traffic/

Best regards,
The Traffic Labb Team

This email was sent to ${userEmail}
© ${new Date().getFullYear()} Traffic Labb. All rights reserved.
  `;

  return sendEmail({
    to: userEmail,
    subject,
    htmlBody,
    textBody
  });
}

/**
 * Send feedback form notification to support
 */
export async function sendFeedbackEmail(feedbackData) {
  const { name, email, rating, category, message } = feedbackData;
  const subject = `Feedback Received: ${category} (${rating}/5 stars)`;

  const ratingStars = "⭐".repeat(parseInt(rating)) + "☆".repeat(5 - parseInt(rating));

  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #354e8d 0%, #496f9c 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .info-box { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #6b99c2; }
        .rating-box { background: white; padding: 20px; border-radius: 6px; margin: 15px 0; text-align: center; font-size: 1.5rem; }
        .message-box { background: white; padding: 20px; border-radius: 6px; margin: 15px 0; }
        .label { font-weight: 600; color: #354e8d; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>💭 New Feedback Received</h2>
        </div>
        <div class="content">
          <div class="rating-box">
            ${ratingStars}
            <div style="font-size: 1rem; color: #6c757d; margin-top: 10px;">${rating} out of 5 stars</div>
          </div>

          <div class="info-box">
            <p><span class="label">From:</span> ${name}</p>
            <p><span class="label">Email:</span> ${email}</p>
            <p><span class="label">Category:</span> ${category}</p>
            <p><span class="label">Date:</span> ${new Date().toLocaleString()}</p>
          </div>

          <div class="message-box">
            <p class="label">Feedback:</p>
            <p>${message.replace(/\n/g, '<br>')}</p>
          </div>

          <p><em>Reply to this email to follow up with ${name}.</em></p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textBody = `
New Feedback Received

Rating: ${ratingStars} (${rating}/5 stars)

From: ${name}
Email: ${email}
Category: ${category}
Date: ${new Date().toLocaleString()}

Feedback:
${message}

Reply to this email to follow up with ${name}.
  `;

  const EMAIL_CONFIG = getEmailConfig();
  return sendEmail({
    to: EMAIL_CONFIG.SUPPORT_EMAIL,
    subject,
    htmlBody,
    textBody,
    replyTo: email
  });
}

/**
 * Send feedback confirmation to user
 */
export async function sendFeedbackConfirmation(userEmail, userName) {
  const subject = "Thank You for Your Feedback! 🌟";

  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #354e8d 0%, #496f9c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .success-box { background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 6px; margin: 20px 0; color: #155724; text-align: center; }
        .footer { text-align: center; margin-top: 30px; color: #6c757d; font-size: 0.85rem; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🌟 Thank You!</h1>
        </div>
        <div class="content">
          <h2>Hi ${userName},</h2>

          <div class="success-box">
            <strong>Your feedback has been received!</strong>
          </div>

          <p>Thank you for taking the time to share your thoughts with us. Your feedback helps us improve Traffic Labb and provide better service to all our users.</p>

          <p>We carefully review all feedback and use it to guide our development priorities and improvements.</p>

          <p>If your feedback requires a response, our team will get back to you soon.</p>

          <p>Best regards,<br>The Traffic Labb Team</p>
        </div>
        <div class="footer">
          <p>This email was sent to ${userEmail}</p>
          <p>© ${new Date().getFullYear()} Traffic Labb. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textBody = `
Thank You for Your Feedback!

Hi ${userName},

Your feedback has been received!

Thank you for taking the time to share your thoughts with us. Your feedback helps us improve Traffic Labb and provide better service to all our users.

We carefully review all feedback and use it to guide our development priorities and improvements.

If your feedback requires a response, our team will get back to you soon.

Best regards,
The Traffic Labb Team

This email was sent to ${userEmail}
© ${new Date().getFullYear()} Traffic Labb. All rights reserved.
  `;

  return sendEmail({
    to: userEmail,
    subject,
    htmlBody,
    textBody
  });
}

export default {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendContactFormEmail,
  sendContactFormConfirmation,
  sendFeedbackEmail,
  sendFeedbackConfirmation
};
