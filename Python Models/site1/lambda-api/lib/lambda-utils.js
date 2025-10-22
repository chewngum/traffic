// Shared utilities for Lambda handlers

/**
 * Standard CORS headers for all responses
 */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

/**
 * Create a Lambda response object
 */
export function createResponse(statusCode, body, additionalHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...additionalHeaders
    },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  };
}

/**
 * Handle CORS preflight requests
 */
export function handleCORS(event) {
  const method = event.requestContext?.http?.method || event.httpMethod;
  if (method === 'OPTIONS') {
    return createResponse(200, '');
  }
  return null;
}

/**
 * Parse request body
 */
export function parseBody(event) {
  if (!event.body) return {};
  return typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
}

/**
 * Get HTTP method from event
 */
export function getMethod(event) {
  return event.requestContext?.http?.method || event.httpMethod || 'GET';
}

/**
 * Get authorization header
 */
export function getAuthHeader(event) {
  const headers = event.headers || {};
  return headers.authorization || headers.Authorization || '';
}

/**
 * Validate authentication token
 */
export function isValidToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [timestamp, username, accessLevel] = decoded.split(':');
    const tokenAge = Date.now() - parseInt(timestamp);
    return tokenAge < 24 * 60 * 60 * 1000; // 24 hours
  } catch {
    return false;
  }
}

/**
 * Get user info from token
 */
export function getUserInfoFromToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [timestamp, username, accessLevel] = decoded.split(':');
    return {
      username: username || 'unknown',
      accessLevel: parseInt(accessLevel) || 0,
      tokenTimestamp: parseInt(timestamp)
    };
  } catch {
    return {
      username: 'unknown',
      accessLevel: 0,
      tokenTimestamp: 0
    };
  }
}

/**
 * Validate authentication and return user info or error response
 */
export function validateAuth(event) {
  const authHeader = getAuthHeader(event);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      error: createResponse(401, { error: 'Authentication required' }),
      userInfo: null
    };
  }

  const token = authHeader.substring(7);

  if (!isValidToken(token)) {
    return {
      error: createResponse(401, { error: 'Invalid or expired token' }),
      userInfo: null
    };
  }

  return {
    error: null,
    userInfo: getUserInfoFromToken(token),
    token
  };
}

/**
 * Error response helper
 */
export function errorResponse(statusCode, error, details = null) {
  const body = { error };
  if (details && process.env.NODE_ENV === 'development') {
    body.details = details;
  }
  return createResponse(statusCode, body);
}

/**
 * Success response helper
 */
export function successResponse(data, statusCode = 200) {
  return createResponse(statusCode, { success: true, ...data });
}
