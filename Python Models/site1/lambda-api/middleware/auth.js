const { query } = require('../lib/db');

// Extract token from request
function getToken(event) {
  // Check Authorization header
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Check cookies
  const cookies = event.headers?.cookie;
  if (cookies) {
    const match = cookies.match(/token=([^;]+)/);
    if (match) return match[1];
  }
  
  return null;
}

// Verify user session/token against Neon DB
async function verifyAuth(token) {
  if (!token) return null;
  
  try {
    // Adjust this query based on your auth table structure
    const result = await query(
      'SELECT * FROM users WHERE session_token = $1 AND session_expires > NOW()',
      [token]
    );
    
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error('Auth verification error:', error);
    return null;
  }
}

// Middleware wrapper
async function requireAuth(event) {
  const token = getToken(event);
  const user = await verifyAuth(token);
  
  if (!user) {
    return {
      statusCode: 401,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Unauthorized' })
    };
  }
  
  return user;
}

module.exports = {
  getToken,
  verifyAuth,
  requireAuth
};