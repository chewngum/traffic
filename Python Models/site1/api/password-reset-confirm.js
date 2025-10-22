// Password Reset Confirmation API
// Validates reset token and updates user password

import pool from '../lib/database.js';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

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
    const { token, newPassword } = req.body;

    // Validate input
    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Token and new password are required'
      });
    }

    // Validate password strength
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters long'
      });
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
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token'
      });
    }

    const resetToken = tokenResult.rows[0];

    // Check if token has already been used
    if (resetToken.used_at) {
      return res.status(400).json({
        success: false,
        error: 'This reset link has already been used'
      });
    }

    // Check if token has expired (1 hour expiration)
    const now = new Date();
    const expiresAt = new Date(resetToken.expires_at);

    if (now > expiresAt) {
      return res.status(400).json({
        success: false,
        error: 'Reset token has expired. Please request a new one.'
      });
    }

    // Get client IP and user agent for logging
    const ipAddress = req.headers['x-forwarded-for'] ||
                     req.headers['x-real-ip'] ||
                     req.connection?.remoteAddress ||
                     'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

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

      res.json({
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
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}
