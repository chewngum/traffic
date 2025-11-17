/**
 * JWT Token Management Library
 * Provides secure token generation and validation using industry-standard JWT
 */

import jwt from 'jsonwebtoken';

// Get JWT secret from environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_SECRET_IN_PRODUCTION';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h'; // Default 24 hours
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d'; // Default 7 days

if (JWT_SECRET === 'CHANGE_THIS_SECRET_IN_PRODUCTION' && process.env.NODE_ENV === 'production') {
  console.warn('WARNING: Using default JWT secret! Set JWT_SECRET environment variable in production!');
}

/**
 * Generate a JWT access token
 * @param {Object} payload - Token payload { userId, username, email, roles }
 * @param {String} expiresIn - Token expiration (default: 24h)
 * @returns {String} JWT token
 */
export function generateAccessToken(payload, expiresIn = JWT_EXPIRY) {
  try {
    const token = jwt.sign(
      {
        userId: payload.userId,
        username: payload.username,
        email: payload.email,
        roles: payload.roles, // Array or comma-separated string
        displayName: payload.displayName,
        type: 'access'
      },
      JWT_SECRET,
      {
        expiresIn,
        issuer: 'traffic-labb',
        audience: 'traffic-labb-users'
      }
    );

    return token;
  } catch (error) {
    console.error('Error generating access token:', error);
    throw new Error('Failed to generate access token');
  }
}

/**
 * Generate a JWT refresh token (longer expiry)
 * @param {Object} payload - Token payload { userId, username }
 * @param {String} expiresIn - Token expiration (default: 7d)
 * @returns {String} JWT refresh token
 */
export function generateRefreshToken(payload, expiresIn = JWT_REFRESH_EXPIRY) {
  try {
    const token = jwt.sign(
      {
        userId: payload.userId,
        username: payload.username,
        type: 'refresh'
      },
      JWT_SECRET,
      {
        expiresIn,
        issuer: 'traffic-labb',
        audience: 'traffic-labb-users'
      }
    );

    return token;
  } catch (error) {
    console.error('Error generating refresh token:', error);
    throw new Error('Failed to generate refresh token');
  }
}

/**
 * Verify and decode a JWT token
 * @param {String} token - JWT token to verify
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
export function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'traffic-labb',
      audience: 'traffic-labb-users'
    });

    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token has expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    } else {
      console.error('Token verification error:', error);
      throw new Error('Token verification failed');
    }
  }
}

/**
 * Decode a JWT token without verification (for client-side use only)
 * WARNING: Never trust unverified tokens on the server!
 * @param {String} token - JWT token to decode
 * @returns {Object} Decoded token payload (unverified)
 */
export function decodeToken(token) {
  try {
    return jwt.decode(token);
  } catch (error) {
    console.error('Token decode error:', error);
    return null;
  }
}

/**
 * Extract token from Authorization header or cookies
 * @param {Object} headers - Request headers
 * @param {Object} cookies - Request cookies
 * @returns {String|null} Extracted token or null
 */
export function extractToken(headers, cookies = {}) {
  // Try Authorization header first (Bearer token)
  const authHeader = headers?.authorization || headers?.Authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Try cookie
  if (cookies?.authToken) {
    return cookies.authToken;
  }

  return null;
}

/**
 * Create secure cookie string for Set-Cookie header
 * @param {String} name - Cookie name
 * @param {String} value - Cookie value
 * @param {Object} options - Cookie options
 * @returns {String} Cookie header value
 */
export function createSecureCookie(name, value, options = {}) {
  const {
    maxAge = 24 * 60 * 60, // 24 hours in seconds
    httpOnly = true,
    secure = process.env.NODE_ENV === 'production',
    sameSite = 'Lax',
    path = '/'
  } = options;

  let cookie = `${name}=${value}; Path=${path}; Max-Age=${maxAge}; SameSite=${sameSite}`;

  if (httpOnly) {
    cookie += '; HttpOnly';
  }

  if (secure) {
    cookie += '; Secure';
  }

  return cookie;
}

/**
 * Create cookie to clear/logout
 * @param {String} name - Cookie name
 * @returns {String} Cookie header value
 */
export function createClearCookie(name) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}

/**
 * Parse roles from JWT payload
 * Handles both array and comma-separated string formats
 * @param {String|Array} roles - Roles from JWT
 * @returns {Array} Array of role strings
 */
export function parseRoles(roles) {
  if (!roles) return ['guest'];
  if (Array.isArray(roles)) return roles;
  if (typeof roles === 'string') return roles.split(',').map(r => r.trim());
  return ['guest'];
}

/**
 * Check if user has required role
 * @param {String|Array} userRoles - User's roles
 * @param {String} requiredRole - Required role
 * @returns {Boolean}
 */
export function hasRole(userRoles, requiredRole) {
  const roles = parseRoles(userRoles);
  return roles.includes(requiredRole);
}

/**
 * Check if user has any of the required roles
 * @param {String|Array} userRoles - User's roles
 * @param {Array} requiredRoles - Array of required roles
 * @returns {Boolean}
 */
export function hasAnyRole(userRoles, requiredRoles) {
  const roles = parseRoles(userRoles);
  return requiredRoles.some(role => roles.includes(role));
}

export default {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  decodeToken,
  extractToken,
  createSecureCookie,
  createClearCookie,
  parseRoles,
  hasRole,
  hasAnyRole
};
