// Native Lambda handler for login
import bcrypt from 'bcryptjs';
import pool from '../../lib/database.js';

export const main = async (event) => {
  try {
    // Handle CORS preflight
    if (event.requestContext?.http?.method === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
        },
        body: ''
      };
    }

    // Only accept POST
    const method = event.requestContext?.http?.method || event.httpMethod;
    if (method !== 'POST') {
      return {
        statusCode: 405,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }

    // Parse body
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { username, password } = body;

    if (!username || !password) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
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
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
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
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
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
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          success: false,
          error: 'Invalid username or password'
        })
      };
    }

    // Update last login
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    // Create token
    const tokenData = `${Date.now()}:${user.username}:${user.access_level}`;
    const token = Buffer.from(tokenData).toString('base64');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: true,
        token: token,
        accessLevel: user.access_level,
        displayName: user.display_name,
        accessLevelName: user.access_level_name,
        accessLevelColor: user.access_level_color,
        description: user.description,
        tokenExpiry: 24,
        siteName: 'Traffic Labb',
        message: `Login successful - ${user.access_level_name} access granted`
      })
    };

  } catch (error) {
    console.error('Login error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: false,
        error: 'Internal server error'
      })
    };
  }
};
