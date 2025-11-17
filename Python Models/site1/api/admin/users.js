const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/**
 * Check if user is admin
 */
async function isAdmin(authToken) {
  if (!authToken) return false;

  try {
    const decodedToken = Buffer.from(authToken.replace('Bearer ', ''), 'base64').toString('utf-8');
    const [timestamp, username, roles] = decodedToken.split(':');

    // Check if roles include admin
    if (roles && roles.includes('admin')) {
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

/**
 * GET /api/admin/users - List all users
 */
async function listUsers(req, res) {
  try {
    // Check authorization
    const authToken = req.headers.authorization || req.cookies?.authToken;
    if (!await isAdmin(authToken)) {
      return res.status(403).json({ error: 'Unauthorized - Admin access required' });
    }

    const result = await pool.query(`
      SELECT
        u.id,
        u.username,
        u.email,
        u.display_name,
        u.company,
        u.phone,
        u.organisation,
        u.roles,
        u.created_at,
        u.last_login,
        u.is_active
      FROM users u
      ORDER BY u.created_at DESC
    `);

    res.json({
      users: result.rows,
      total: result.rowCount
    });
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
}

/**
 * PUT /api/admin/users/:userId/roles - Update user roles
 */
async function updateUserRoles(req, res) {
  try {
    // Check authorization
    const authToken = req.headers.authorization || req.cookies?.authToken;
    if (!await isAdmin(authToken)) {
      return res.status(403).json({ error: 'Unauthorized - Admin access required' });
    }

    const { userId } = req.params;
    const { roles } = req.body;

    // Validate roles
    const validRoles = ['guest', 'authenticated', 'paying', 'beta', 'admin'];
    if (!Array.isArray(roles) || !roles.every(role => validRoles.includes(role))) {
      return res.status(400).json({ error: 'Invalid roles. Must be an array of valid role IDs.' });
    }

    // Update user roles
    const rolesString = roles.join(',');
    const result = await pool.query(
      'UPDATE users SET roles = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [rolesString, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'User roles updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating user roles:', error);
    res.status(500).json({ error: 'Failed to update user roles' });
  }
}

/**
 * PUT /api/admin/users/:userId/status - Activate/deactivate user
 */
async function updateUserStatus(req, res) {
  try {
    // Check authorization
    const authToken = req.headers.authorization || req.cookies?.authToken;
    if (!await isAdmin(authToken)) {
      return res.status(403).json({ error: 'Unauthorized - Admin access required' });
    }

    const { userId } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'is_active must be a boolean' });
    }

    const result = await pool.query(
      'UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [is_active, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: `User ${is_active ? 'activated' : 'deactivated'} successfully`,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
}

/**
 * GET /api/admin/users/:userId - Get user details
 */
async function getUserDetails(req, res) {
  try {
    // Check authorization
    const authToken = req.headers.authorization || req.cookies?.authToken;
    if (!await isAdmin(authToken)) {
      return res.status(403).json({ error: 'Unauthorized - Admin access required' });
    }

    const { userId } = req.params;

    const result = await pool.query(
      `SELECT
        u.id,
        u.username,
        u.email,
        u.display_name,
        u.company,
        u.phone,
        u.organisation,
        u.roles,
        u.created_at,
        u.last_login,
        u.is_active
      FROM users u
      WHERE u.id = $1`,
      [userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Error getting user details:', error);
    res.status(500).json({ error: 'Failed to get user details' });
  }
}

/**
 * Main handler
 */
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Parse URL to get userId and action
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathParts = url.pathname.split('/').filter(p => p);

  // Routes:
  // GET /api/admin/users - List all users
  // GET /api/admin/users/:userId - Get user details
  // PUT /api/admin/users/:userId/roles - Update user roles
  // PUT /api/admin/users/:userId/status - Update user status

  if (req.method === 'GET') {
    if (pathParts.length === 3) {
      // List all users
      return listUsers(req, res);
    } else if (pathParts.length === 4) {
      // Get user details
      req.params = { userId: pathParts[3] };
      return getUserDetails(req, res);
    }
  } else if (req.method === 'PUT') {
    if (pathParts.length === 5 && pathParts[4] === 'roles') {
      // Update user roles
      req.params = { userId: pathParts[3] };
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', async () => {
        req.body = JSON.parse(body);
        return updateUserRoles(req, res);
      });
      return;
    } else if (pathParts.length === 5 && pathParts[4] === 'status') {
      // Update user status
      req.params = { userId: pathParts[3] };
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', async () => {
        req.body = JSON.parse(body);
        return updateUserStatus(req, res);
      });
      return;
    }
  }

  res.status(404).json({ error: 'Not found' });
};
