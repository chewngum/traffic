import bcrypt from 'bcryptjs';
import pool from '../lib/database.js';

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
      SELECT u.*, al.name as access_level_name, al.color as access_level_color
      FROM users u 
      JOIN access_levels al ON u.access_level = al.level
      WHERE u.username = $1 OR u.email = $1
    `, [username.toLowerCase()]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid username or password' 
      });
    }

    const user = userResult.rows[0];
    
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

    // Create token
    const tokenData = `${Date.now()}:${user.username}:${user.access_level}`;
    const token = Buffer.from(tokenData).toString('base64');
    
    res.json({
      success: true,
      token: token,
      accessLevel: user.access_level,
      displayName: user.display_name,
      email: user.email,
      company: user.company,
      accessLevelName: user.access_level_name,
      accessLevelColor: user.access_level_color,
      description: user.description,
      tokenExpiry: 24,
      siteName: 'Traffic Labb',
      message: `Login successful - ${user.access_level_name} access granted`
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}