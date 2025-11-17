import bcrypt from 'bcryptjs';
import pool from '../lib/database.js';
import { verifyToken, parseRoles, hasAnyRole } from '../lib/jwt.js';

function validateToken(token) {
  try {
    // Verify JWT token
    const decoded = verifyToken(token);

    return {
      userId: decoded.userId,
      username: decoded.username,
      email: decoded.email,
      roles: parseRoles(decoded.roles),
      displayName: decoded.displayName
    };
  } catch (error) {
    console.error('Token validation error:', error.message);
    return null;
  }
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Validate authentication
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  const tokenData = validateToken(token);
  
  if (!tokenData) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Check role requirement for account page
  // Only authenticated users (not guests) can access account settings
  if (!hasAnyRole(tokenData.roles, ['authenticated', 'paying', 'beta', 'admin'])) {
    return res.status(403).json({
      success: false,
      error: 'Authentication required for account settings. Guest accounts cannot access this page.'
    });
  }

  try {
    if (req.method === 'GET') {
      // Handle regular users - query database
      const userResult = await pool.query(`
        SELECT id, username, email, display_name, phone, organisation, roles, created_at, last_login
        FROM users
        WHERE username = $1
      `, [tokenData.username]);

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = userResult.rows[0];

      // Parse roles from database (handles both string and array formats)
      user.roles = parseRoles(user.roles);

      // Get usage statistics by simulation type
      const usageStats = await pool.query(`
        SELECT 
            simulation_type,
            COUNT(*) as total_runs,
            COUNT(*) FILTER (WHERE success = true) as successful_runs,
            AVG(runtime_ms) as avg_runtime_ms,
            MAX(created_at) as last_run
        FROM simulation_usage 
        WHERE user_id = $1 
        GROUP BY simulation_type
        ORDER BY total_runs DESC
      `, [user.id]);
      
      // Get total usage across all simulations
      const totalUsage = await pool.query(`
        SELECT 
            COUNT(*) as total_simulations,
            COUNT(*) FILTER (WHERE success = true) as successful_simulations,
            COUNT(DISTINCT simulation_type) as simulation_types_used
        FROM simulation_usage 
        WHERE user_id = $1
      `, [user.id]);
      
      res.json({
        success: true,
        ...user,
        usage_statistics: {
          total: totalUsage.rows[0],
          by_type: usageStats.rows
        }
      });

    } else if (req.method === 'PUT') {
      // Handle regular user profile updates
      const { firstName, lastName, phone, organisation } = req.body;

      if (!firstName || !lastName) {
        return res.status(400).json({
          success: false,
          error: 'First and last name are required'
        });
      }

      // Validate phone format if provided
      if (phone && phone.trim()) {
        // Remove all non-digit characters except leading +
        const cleanPhone = phone.replace(/[\s\-\(\)\.]/g, '');
        // Allow optional + followed by 4-15 digits (covers Australian and international formats)
        const phoneRegex = /^[\+]?[\d]{4,15}$/;

        if (!phoneRegex.test(cleanPhone)) {
          console.error('Phone validation failed:', { original: phone, cleaned: cleanPhone });
          return res.status(400).json({
            success: false,
            error: `Invalid phone number format. Please enter a valid phone number (e.g., 0412345678 or +61412345678)`
          });
        }
      }

      const displayName = `${firstName.trim()} ${lastName.trim()}`;
      const phoneValue = phone && phone.trim() ? phone.trim() : null;
      const organisationValue = organisation && organisation.trim() ? organisation.trim() : null;

      await pool.query(`
        UPDATE users
        SET display_name = $1, phone = $2, organisation = $3, updated_at = NOW()
        WHERE username = $4
      `, [displayName, phoneValue, organisationValue, tokenData.username]);

      res.json({ 
        success: true, 
        message: 'Profile updated successfully' 
      });

    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error) {
    console.error('Account API error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}