// Password Reset Request API
// Generates reset token and sends email via AWS SES

import pool from '../lib/database.js';
import crypto from 'crypto';
import { sendPasswordResetEmail } from '../lib/email-service.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Find user by email
    const userResult = await pool.query(
      'SELECT id, username, email, display_name FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    // SECURITY: Always return success even if email doesn't exist
    // This prevents email enumeration attacks
    if (userResult.rows.length === 0) {
      console.log(`Password reset requested for non-existent email: ${email}`);
      return res.json({
        success: true,
        message: 'If that email is registered, a password reset link has been sent'
      });
    }

    const user = userResult.rows[0];

    // Generate secure random token (32 bytes = 256 bits)
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Hash the token before storing (we only store the hash)
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Set expiration to 1 hour from now
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    // Get client IP and user agent for security logging
    const ipAddress = req.headers['x-forwarded-for'] ||
                     req.headers['x-real-ip'] ||
                     req.connection?.remoteAddress ||
                     'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Delete any existing unused tokens for this user (cleanup)
    await pool.query(
      'DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL',
      [user.id]
    );

    // Store the hashed token in database
    await pool.query(
      `INSERT INTO password_reset_tokens
       (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, tokenHash, expiresAt, ipAddress.substring(0, 45), userAgent.substring(0, 500)]
    );

    console.log(`Password reset token created for user ${user.id} (${user.email})`);

    // Send password reset email via AWS SES
    try {
      await sendPasswordResetEmail(user.email, user.display_name, resetToken);
      console.log(`Password reset email sent to ${user.email}`);
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);

      // Delete the token if email fails
      await pool.query(
        'DELETE FROM password_reset_tokens WHERE token_hash = $1',
        [tokenHash]
      );

      return res.status(500).json({
        success: false,
        error: 'Failed to send reset email. Please try again later.'
      });
    }

    res.json({
      success: true,
      message: 'Password reset link has been sent to your email'
    });

  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}
