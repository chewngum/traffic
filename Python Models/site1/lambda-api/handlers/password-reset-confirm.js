// Native Lambda handler for password reset confirmation
import pool from '../../lib/database.js';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
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
    const { token, newPassword } = parseBody(event);

    // Validate input
    if (!token || !newPassword) {
      return errorResponse(400, 'Token and new password are required');
    }

    // Validate password strength
    if (newPassword.length < 8) {
      return errorResponse(400, 'Password must be at least 8 characters long');
    }

    // Hash the provided token to match against stored hash
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find the token in database
    const tokenResult = await pool.query(
      `SELECT prt.*, u.id as user_id, u.email, u.username
       FROM password_reset_tokens prt
       JOIN users u ON prt.user_id = u.id
       WHERE prt.token_hash = $1`,
      [tokenHash]
    );

    if (tokenResult.rows.length === 0) {
      return errorResponse(400, 'Invalid or expired reset token');
    }

    const resetToken = tokenResult.rows[0];

    // Check if token has already been used
    if (resetToken.used_at) {
      return errorResponse(400, 'This reset link has already been used');
    }

    // Check if token has expired (1 hour expiration)
    const now = new Date();
    const expiresAt = new Date(resetToken.expires_at);

    if (now > expiresAt) {
      return errorResponse(400, 'Reset token has expired. Please request a new one.');
    }

    // Get client IP and user agent for logging
    const ipAddress = event.requestContext?.http?.sourceIp ||
                     event.requestContext?.identity?.sourceIp ||
                     event.headers?.['x-forwarded-for'] ||
                     'unknown';

    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Start a transaction to ensure atomicity
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update user's password
      await client.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [passwordHash, resetToken.user_id]
      );

      // Mark the token as used
      await client.query(
        'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
        [resetToken.id]
      );

      await client.query('COMMIT');

      console.log(`Password reset successful for user ${resetToken.user_id} (${resetToken.email}) from IP: ${ipAddress}`);

      return createResponse(200, {
        success: true,
        message: 'Password has been reset successfully. You can now log in with your new password.'
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Password reset confirmation error:', error);
    return errorResponse(500, 'Internal server error');
  }
};
