// Native Lambda handler for admin user management
import pool from '../../lib/database.js';
import { requireAdmin } from '../middleware/jwt-auth.js';

/**
 * GET /api/admin/users - List all users
 */
async function listUsers(event) {
  try {
    // Check authorization
    const { user, errorResponse } = requireAdmin(event);
    if (errorResponse) return errorResponse;

    const result = await pool.query(`
      SELECT
        u.id,
        u.username,
        u.email,
        u.display_name,
        u.phone,
        u.organisation,
        u.roles,
        u.created_at,
        u.last_login,
        u.is_active
      FROM users u
      ORDER BY u.created_at DESC
    `);

    return {
      statusCode: 200,
      body: JSON.stringify({
        users: result.rows,
        total: result.rowCount
      })
    };
  } catch (error) {
    console.error('Error listing users:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to list users' })
    };
  }
}

/**
 * GET /api/admin/users/:userId - Get user details
 */
async function getUserDetails(event, userId) {
  try {
    // Check authorization
    const { user, errorResponse } = requireAdmin(event);
    if (errorResponse) return errorResponse;

    const result = await pool.query(
      `SELECT
        u.id,
        u.username,
        u.email,
        u.display_name,
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
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ user: result.rows[0] })
    };
  } catch (error) {
    console.error('Error getting user details:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to get user details' })
    };
  }
}

/**
 * PUT /api/admin/users/:userId/roles - Update user roles
 */
async function updateUserRoles(event, userId, roles) {
  try {
    // Check authorization
    const { user, errorResponse } = requireAdmin(event);
    if (errorResponse) return errorResponse;

    // Validate roles
    const validRoles = ['guest', 'authenticated', 'paying', 'beta', 'admin'];
    if (!Array.isArray(roles) || !roles.every(role => validRoles.includes(role))) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid roles. Must be an array of valid role IDs.' })
      };
    }

    // Update user roles
    const rolesString = roles.join(',');
    const result = await pool.query(
      'UPDATE users SET roles = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [rolesString, userId]
    );

    if (result.rowCount === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'User roles updated successfully',
        user: result.rows[0]
      })
    };
  } catch (error) {
    console.error('Error updating user roles:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to update user roles' })
    };
  }
}

/**
 * PUT /api/admin/users/:userId/status - Activate/deactivate user
 */
async function updateUserStatus(event, userId, is_active) {
  try {
    // Check authorization
    const { user, errorResponse } = requireAdmin(event);
    if (errorResponse) return errorResponse;

    if (typeof is_active !== 'boolean') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'is_active must be a boolean' })
      };
    }

    const result = await pool.query(
      'UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [is_active, userId]
    );

    if (result.rowCount === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `User ${is_active ? 'activated' : 'deactivated'} successfully`,
        user: result.rows[0]
      })
    };
  } catch (error) {
    console.error('Error updating user status:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to update user status' })
    };
  }
}

/**
 * Main Lambda handler
 */
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

    const method = event.requestContext?.http?.method || event.httpMethod;
    const path = event.requestContext?.http?.path || event.path || event.rawPath;

    // Parse path to extract userId if present
    const pathParts = path.split('/').filter(p => p);
    const userId = pathParts[3]; // /api/admin/users/{userId}
    const action = pathParts[4]; // roles or status

    let response;

    if (method === 'GET') {
      if (userId) {
        // GET /api/admin/users/:userId
        response = await getUserDetails(event, userId);
      } else {
        // GET /api/admin/users
        response = await listUsers(event);
      }
    } else if (method === 'PUT') {
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;

      if (action === 'roles') {
        // PUT /api/admin/users/:userId/roles
        response = await updateUserRoles(event, userId, body.roles);
      } else if (action === 'status') {
        // PUT /api/admin/users/:userId/status
        response = await updateUserStatus(event, userId, body.is_active);
      } else {
        response = {
          statusCode: 404,
          body: JSON.stringify({ error: 'Not found' })
        };
      }
    } else {
      response = {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }

    return {
      ...response,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        ...response.headers
      }
    };

  } catch (error) {
    console.error('Admin users handler error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Internal server error'
      })
    };
  }
};
