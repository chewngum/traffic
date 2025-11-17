import bcrypt from 'bcryptjs';
import pool from '../lib/database.js';
import { sendWelcomeEmail } from '../lib/email-service.js';
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
    const { firstName, lastName, email, company, password } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'All required fields must be filled'
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

    // Validate password strength
    if (password.length < 8 || 
        !/[A-Z]/.test(password) || 
        !/[a-z]/.test(password) || 
        !/\d/.test(password)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Password must be at least 8 characters with uppercase, lowercase, and number' 
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

    // Check if email already exists (email will be used as username)
    const existingUserResult = await pool.query(
      'SELECT email FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUserResult.rows.length > 0) {
      return res.status(409).json({ 
        success: false, 
        error: 'Email address already registered' 
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create display name
    const displayName = `${firstName} ${lastName}`;

    // Insert new user with default roles (authenticated,paying for new registrations)
    const defaultRoles = 'authenticated,paying';

    const insertResult = await pool.query(`
      INSERT INTO users (username, email, password_hash, roles, is_active, display_name, company, description)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, username, email, roles, is_active, display_name, company
    `, [
      email.toLowerCase(), // Use email as username
      email.toLowerCase(),
      passwordHash,
      defaultRoles, // Default roles for new users
      true, // Account is active by default
      displayName,
      company || null, // Company is optional, set to null if not provided
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

    // Set the cookie header
    res.setHeader('Set-Cookie', cookieHeader);

    res.status(201).json({
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
    });

  } catch (error) {
    console.error('Signup error:', error);
    
    // Handle specific database errors
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ 
        success: false, 
        error: 'Email address already registered' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}