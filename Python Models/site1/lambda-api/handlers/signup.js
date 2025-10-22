// Native Lambda handler for user signup
import bcrypt from 'bcryptjs';
import pool from '../../lib/database.js';
import { sendWelcomeEmail } from '../../lib/email-service.js';
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

    // Insert new user
    const insertResult = await pool.query(`
      INSERT INTO users (username, email, password_hash, access_level, display_name, description)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, username, email, access_level, display_name
    `, [
      email.toLowerCase(), // Use email as username
      email.toLowerCase(),
      passwordHash,
      2, // Account Holder access level for new users
      displayName,
      'Guest user account'
    ]);

    const newUser = insertResult.rows[0];

    // Log successful registration
    console.log(`New user registered: ${newUser.username} (${newUser.email})`);

    // Send welcome email (async - don't block response)
    sendWelcomeEmail(newUser.email, newUser.display_name)
      .then(() => console.log(`Welcome email sent to ${newUser.email}`))
      .catch(err => console.error('Welcome email failed:', err));

    return createResponse(201, {
      success: true,
      message: 'Account created successfully',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        displayName: newUser.display_name,
        accessLevel: newUser.access_level
      }
    });

  } catch (error) {
    console.error('Signup error:', error);

    // Handle specific database errors
    if (error.code === '23505') { // Unique violation
      return errorResponse(409, 'Email address already registered');
    }

    return errorResponse(500, 'Internal server error');
  }
};
