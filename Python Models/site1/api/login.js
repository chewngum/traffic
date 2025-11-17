import bcrypt from 'bcryptjs';
import pool from '../lib/database.js';
import { sendLoginNotification } from '../lib/email-service.js';
import { generateAccessToken, createSecureCookie } from '../lib/jwt.js';

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
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username and password are required' 
      });
    }

    // Check if DATABASE_URL is available
    if (!process.env.DATABASE_URL) {
      console.error('DATABASE_URL environment variable is not set');
      return res.status(500).json({ 
        success: false, 
        error: 'Database configuration error' 
      });
    }

    // Query user from database
    const userResult = await pool.query(`
      SELECT u.*
      FROM users u
      WHERE (u.username = $1 OR u.email = $1)
    `, [username.toLowerCase()]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password'
      });
    }

    const user = userResult.rows[0];

    // Check if user is active
    if (user.is_active === false) {
      return res.status(403).json({
        success: false,
        error: 'Account has been deactivated. Please contact support.'
      });
    }

    // Check password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password'
      });
    }

    // Update last login
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    // Get user roles (default to 'authenticated' if not set)
    const userRoles = user.roles || 'authenticated';

    // Send login notification to admin (non-blocking)
    const ipAddress = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket.remoteAddress || 'Unknown';
    const userAgent = req.headers['user-agent'] || 'Unknown';

    sendLoginNotification({
      username: user.username,
      email: user.email,
      displayName: user.display_name,
      accessLevel: user.access_level || 'N/A',
      roles: userRoles,
      loginTime: new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }),
      ipAddress,
      userAgent
    }).catch(err => {
      console.error('Failed to send login notification email:', err);
      // Don't fail the login if email fails
    });

    // Parse roles array
    const rolesArray = userRoles.split(',').map(r => r.trim());

    // Generate secure JWT token
    const token = generateAccessToken({
      userId: user.id,
      username: user.username,
      email: user.email,
      roles: rolesArray,
      displayName: user.display_name
    });

    // Create secure HttpOnly cookie
    const cookieHeader = createSecureCookie('authToken', token, {
      maxAge: 24 * 60 * 60, // 24 hours
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax'
    });

    // Set the cookie header
    res.setHeader('Set-Cookie', cookieHeader);

    res.json({
      success: true,
      token: token, // Also send in body for localStorage fallback
      roles: rolesArray,
      displayName: user.display_name,
      email: user.email,
      company: user.company,
      description: user.description,
      tokenExpiry: 24,
      siteName: 'Traffic Labb',
      message: `Login successful - ${rolesArray.join(', ')} access granted`
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}