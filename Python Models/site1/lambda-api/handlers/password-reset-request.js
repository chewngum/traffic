// Native Lambda handler for password reset request
import pool from '../../lib/database.js';
import crypto from 'crypto';
import { sendPasswordResetEmail } from '../../lib/email-service.js';
import {
  handleCORS,
  parseBody,
  getMethod,
  errorResponse,
  createResponse
} from '../lib/lambda-utils.js';

export const main = async (event) => {
  try {
    // Handle CORS
    const corsResponse = handleCORS(event);
    if (corsResponse) return corsResponse;

    // Only accept POST
    if (getMethod(event) !== 'POST') {
      return errorResponse(405, 'Method not allowed');
    }

    // Parse body
    const { email } = parseBody(event);

    if (!email) {
      return errorResponse(400, 'Email address is required');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return errorResponse(400, 'Invalid email format');
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
      return createResponse(200, {
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
    const ipAddress = event.requestContext?.http?.sourceIp ||
                     event.requestContext?.identity?.sourceIp ||
                     event.headers?.['x-forwarded-for'] ||
                     'unknown';
    const userAgent = event.headers?.['user-agent'] || 'unknown';

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

      return errorResponse(500, 'Failed to send reset email. Please try again later.');
    }

    return createResponse(200, {
      success: true,
      message: 'Password reset link has been sent to your email'
    });

  } catch (error) {
    console.error('Password reset request error:', error);
    return errorResponse(500, 'Internal server error');
  }
};
