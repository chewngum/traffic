// Native Lambda handler for login
import bcrypt from 'bcryptjs';
import pool from '../../lib/database.js';
import { sendLoginNotification } from '../../lib/email-service.js';
import { generateAccessToken, createSecureCookie, parseRoles } from '../../lib/jwt.js';

export const main = async (event) => {
  try {
    // API Gateway handles OPTIONS automatically with httpApi CORS config
    // Only accept POST
    const method = event.requestContext?.http?.method || event.httpMethod;
    if (method !== 'POST') {
      return {
        statusCode: 405,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }

    // Parse body
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { username, password } = body;

    if (!username || !password) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: false,
          error: 'Username and password are required'
        })
      };
    }

    // Check if DATABASE_URL is available
    if (!process.env.DATABASE_URL) {
      console.error('DATABASE_URL environment variable is not set');
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: false,
          error: 'Database configuration error'
        })
      };
    }

    // Query user from database
    const userResult = await pool.query(`
      SELECT u.*, al.name as access_level_name, al.color as access_level_color
      FROM users u
      JOIN access_levels al ON u.access_level = al.level
      WHERE u.username = $1 OR u.email = $1
    `, [username.toLowerCase()]);

    if (userResult.rows.length === 0) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid username or password'
        })
      };
    }

    const user = userResult.rows[0];

    // Check password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid username or password'
        })
      };
    }

    // Update last login
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    // Get user roles (use roles column if available, otherwise default to 'authenticated')
    const userRoles = user.roles || 'authenticated';

    // Send login notification to admin (non-blocking)
    const ipAddress = event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || 'Unknown';
    const userAgent = event.requestContext?.http?.userAgent || event.headers?.['user-agent'] || 'Unknown';

    sendLoginNotification({
      username: user.username,
      email: user.email,
      displayName: user.display_name,
      accessLevel: user.access_level,
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

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookieHeader
      },
      body: JSON.stringify({
        success: true,
        token: token, // Also send in body for localStorage fallback
        roles: rolesArray,
        accessLevel: user.access_level,
        displayName: user.display_name,
        email: user.email,
        company: user.company,
        accessLevelName: user.access_level_name,
        accessLevelColor: user.access_level_color,
        description: user.description,
        tokenExpiry: 24,
        siteName: 'Traffic Labb',
        message: `Login successful - ${rolesArray.join(', ')} access granted`
      })
    };

  } catch (error) {
    console.error('Login error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: 'Internal server error'
      })
    };
  }
};
