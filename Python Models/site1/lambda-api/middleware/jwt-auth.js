/**
 * JWT Authentication Middleware
 * Validates JWT tokens and extracts user information
 */

import { verifyToken, extractToken, parseRoles, hasRole, hasAnyRole } from '../../lib/jwt.js';

/**
 * Parse cookies from Lambda event
 * @param {Object} event - Lambda event
 * @returns {Object} Parsed cookies
 */
function parseCookies(event) {
  const cookies = {};
  const cookieHeader = event.headers?.cookie || event.headers?.Cookie;

  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const [name, ...rest] = cookie.split('=');
      const value = rest.join('=').trim();
      if (name && value) {
        cookies[name.trim()] = decodeURIComponent(value);
      }
    });
  }

  return cookies;
}

/**
 * Authenticate request and extract user info from JWT
 * @param {Object} event - Lambda event
 * @returns {Object} { authenticated, user, error }
 */
export function authenticateRequest(event) {
  try {
    // Extract token from headers or cookies
    const cookies = parseCookies(event);
    const token = extractToken(event.headers, cookies);

    if (!token) {
      return {
        authenticated: false,
        user: null,
        error: 'No token provided'
      };
    }

    // Verify and decode token
    const decoded = verifyToken(token);

    return {
      authenticated: true,
      user: {
        userId: decoded.userId,
        username: decoded.username,
        email: decoded.email,
        roles: parseRoles(decoded.roles),
        displayName: decoded.displayName
      },
      error: null
    };

  } catch (error) {
    return {
      authenticated: false,
      user: null,
      error: error.message
    };
  }
}

/**
 * Require authentication - returns error response if not authenticated
 * @param {Object} event - Lambda event
 * @returns {Object} { user, errorResponse } - errorResponse is null if authenticated
 */
export function requireAuth(event) {
  const { authenticated, user, error } = authenticateRequest(event);

  if (!authenticated) {
    return {
      user: null,
      errorResponse: {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Authentication required',
          message: error || 'Please log in to access this resource'
        })
      }
    };
  }

  return {
    user,
    errorResponse: null
  };
}

/**
 * Require specific role - returns error response if user doesn't have role
 * @param {Object} event - Lambda event
 * @param {String} requiredRole - Required role (e.g., 'admin', 'paying')
 * @returns {Object} { user, errorResponse }
 */
export function requireRole(event, requiredRole) {
  const { user, errorResponse } = requireAuth(event);

  if (errorResponse) {
    return { user: null, errorResponse };
  }

  if (!hasRole(user.roles, requiredRole)) {
    return {
      user: null,
      errorResponse: {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Insufficient permissions',
          message: `This resource requires '${requiredRole}' role`
        })
      }
    };
  }

  return { user, errorResponse: null };
}

/**
 * Require any of the specified roles
 * @param {Object} event - Lambda event
 * @param {Array} requiredRoles - Array of required roles
 * @returns {Object} { user, errorResponse }
 */
export function requireAnyRole(event, requiredRoles) {
  const { user, errorResponse } = requireAuth(event);

  if (errorResponse) {
    return { user: null, errorResponse };
  }

  if (!hasAnyRole(user.roles, requiredRoles)) {
    return {
      user: null,
      errorResponse: {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Insufficient permissions',
          message: `This resource requires one of: ${requiredRoles.join(', ')}`
        })
      }
    };
  }

  return { user, errorResponse: null };
}

/**
 * Check if user is admin
 * @param {Object} event - Lambda event
 * @returns {Boolean}
 */
export function isAdmin(event) {
  const { authenticated, user } = authenticateRequest(event);
  if (!authenticated) return false;
  return hasRole(user.roles, 'admin');
}

/**
 * Require admin access
 * @param {Object} event - Lambda event
 * @returns {Object} { user, errorResponse }
 */
export function requireAdmin(event) {
  return requireRole(event, 'admin');
}

export default {
  authenticateRequest,
  requireAuth,
  requireRole,
  requireAnyRole,
  requireAdmin,
  isAdmin
};
