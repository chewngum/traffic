// Shared utilities for Lambda handlers

/**
 * Get CORS headers based on the request origin
 */
export function getCORSHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const allowedOrigins = ['https://thelabb.com.au', 'http://localhost:3000'];

  // Check if origin is allowed
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true'
  };
}

/**
 * Create a Lambda response object
 */
export function createResponse(statusCode, body, additionalHeaders = {}, event = null) {
  const corsHeaders = event ? getCORSHeaders(event) : {
    'Access-Control-Allow-Origin': 'https://thelabb.com.au',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true'
  };

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
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
    return createResponse(200, '', {}, event);
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
 * Validate JWT token
 */
export function isValidToken(token) {
  try {
    // JWT tokens have 3 parts separated by dots
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    // Decode the payload (middle part)
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));

    // Check expiration
    if (payload.exp) {
      const now = Math.floor(Date.now() / 1000);
      if (now >= payload.exp) return false;
    }

    // Check required fields
    return !!(payload.userId && payload.username);
  } catch {
    return false;
  }
}

/**
 * Get user info from JWT token
 */
export function getUserInfoFromToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid token format');

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));

    return {
      userId: payload.userId,
      username: payload.username || 'unknown',
      email: payload.email,
      roles: Array.isArray(payload.roles) ? payload.roles : (payload.roles || 'guest').split(',').map(r => r.trim()),
      displayName: payload.displayName,
      accessLevel: 1 // Default for authenticated users
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
  console.log('🔍 LAMBDA AUTH DEBUG: Headers:', JSON.stringify(event.headers, null, 2));
  console.log('🔍 LAMBDA AUTH DEBUG: Authorization header:', authHeader);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('🔍 LAMBDA AUTH DEBUG: No Bearer token found');
    return {
      error: createResponse(401, { error: 'Authentication required' }, {}, event),
      userInfo: null
    };
  }

  const token = authHeader.substring(7);
  console.log('🔍 LAMBDA AUTH DEBUG: Token extracted (first 20 chars):', token.substring(0, 20));

  if (!isValidToken(token)) {
    console.log('🔍 LAMBDA AUTH DEBUG: Token validation failed');
    return {
      error: createResponse(401, { error: 'Invalid or expired token' }, {}, event),
      userInfo: null
    };
  }

  const userInfo = getUserInfoFromToken(token);
  console.log('🔍 LAMBDA AUTH DEBUG: Token validated successfully for user:', userInfo.username);

  return {
    error: null,
    userInfo,
    token
  };
}

/**
 * Error response helper
 */
export function errorResponse(statusCode, error, details = null, event = null) {
  const body = { error };
  if (details && process.env.NODE_ENV === 'development') {
    body.details = details;
  }
  return createResponse(statusCode, body, {}, event);
}

/**
 * Success response helper
 */
export function successResponse(data, statusCode = 200) {
  return createResponse(statusCode, { success: true, ...data });
}
