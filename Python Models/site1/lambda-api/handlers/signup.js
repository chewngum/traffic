// Native Lambda handler for user signup
import bcrypt from 'bcryptjs';
import pool from '../../lib/database.js';
import { sendWelcomeEmail } from '../../lib/email-service.js';
import { generateAccessToken, createSecureCookie } from '../../lib/jwt.js';
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
    const { firstName, lastName, email, password } = parseBody(event);

    // Validate required fields
    if (!firstName || !lastName || !email || !password) {
      return errorResponse(400, 'All fields are required');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return errorResponse(400, 'Invalid email format');
    }

    // Validate password strength
    if (password.length < 8 ||
        !/[A-Z]/.test(password) ||
        !/[a-z]/.test(password) ||
        !/\d/.test(password)) {
      return errorResponse(400, 'Password must be at least 8 characters with uppercase, lowercase, and number');
    }

    // Check if DATABASE_URL is available
    if (!process.env.DATABASE_URL) {
      console.error('DATABASE_URL environment variable is not set');
      return errorResponse(500, 'Database configuration error');
    }

    // Check if email already exists
    const existingUserResult = await pool.query(
      'SELECT email FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUserResult.rows.length > 0) {
      return errorResponse(409, 'Email address already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create display name
    const displayName = `${firstName} ${lastName}`;

    // Default roles for new users (authenticated,paying for new registrations)
    const defaultRoles = 'authenticated,paying';

    // Insert new user with roles
    const insertResult = await pool.query(`
      INSERT INTO users (username, email, password_hash, roles, is_active, display_name, description)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, username, email, roles, is_active, display_name
    `, [
      email.toLowerCase(), // Use email as username
      email.toLowerCase(),
      passwordHash,
      defaultRoles,
      true, // Account is active by default
      displayName,
      'User account'
    ]);

    const newUser = insertResult.rows[0];

    // Log successful registration
    console.log(`New user registered: ${newUser.username} (${newUser.email}) with roles: ${newUser.roles}`);

    // Send welcome email (async - don't block response)
    sendWelcomeEmail(newUser.email, newUser.display_name)
      .then(() => console.log(`Welcome email sent to ${newUser.email}`))
      .catch(err => console.error('Welcome email failed:', err));

    // Parse roles array
    const rolesArray = newUser.roles.split(',').map(r => r.trim());

    // Generate secure JWT token for immediate login
    const token = generateAccessToken({
      userId: newUser.id,
      username: newUser.username,
      email: newUser.email,
      roles: rolesArray,
      displayName: newUser.display_name
    });

    // Create secure HttpOnly cookie
    const cookieHeader = createSecureCookie('authToken', token, {
      maxAge: 24 * 60 * 60, // 24 hours
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax'
    });

    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true',
        'Set-Cookie': cookieHeader
      },
      body: JSON.stringify({
        success: true,
        message: 'Account created successfully',
        token: token, // Return token for automatic login
        roles: rolesArray,
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          displayName: newUser.display_name,
          roles: rolesArray
        }
      })
    };

  } catch (error) {
    console.error('Signup error:', error);

    // Handle specific database errors
    if (error.code === '23505') { // Unique violation
      return errorResponse(409, 'Email address already registered');
    }

    return errorResponse(500, 'Internal server error');
  }
};
