// Generic wrapper for simulation handlers
// Converts Express-style handlers to native Lambda format

import {
  handleCORS,
  parseBody,
  getMethod,
  validateAuth,
  errorResponse
} from './lambda-utils.js';

/**
 * Wraps an Express-style simulation handler for Lambda
 * @param {Function} expressHandler - The original Express handler function
 * @returns {Function} Lambda handler function
 */
export function wrapSimulationHandler(expressHandler) {
  return async (event) => {
    try {
      // Handle CORS
      const corsResponse = handleCORS(event);
      if (corsResponse) return corsResponse;

      // Only accept POST
      if (getMethod(event) !== 'POST') {
        return errorResponse(405, 'Method not allowed');
      }

      // Validate authentication
      const auth = validateAuth(event);
      if (auth.error) return auth.error;

      // Parse body
      const body = parseBody(event);

      // Create minimal Express-like req/res objects
      const req = {
        method: 'POST',
        headers: event.headers || {},
        body
      };

      let responseData = null;
      let statusCode = 200;

      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        json(data) {
          responseData = data;
          return this;
        },
        setHeader() {
          return this;
        },
        end() {
          return this;
        }
      };

      // Call the Express handler
      await expressHandler(req, res);

      // Return Lambda response
      return {
        statusCode,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify(responseData)
      };

    } catch (error) {
      console.error('Simulation handler error:', error);
      return errorResponse(500, 'Internal server error', error.message);
    }
  };
}

/**
 * Wraps an Express-style account/API handler for Lambda (supports GET, POST, PUT, DELETE)
 * @param {Function} expressHandler - The original Express handler function
 * @returns {Function} Lambda handler function
 */
export function wrapAccountHandler(expressHandler) {
  return async (event) => {
    try {
      // Handle CORS
      const corsResponse = handleCORS(event);
      if (corsResponse) return corsResponse;

      // Get the HTTP method
      const method = getMethod(event);

      // Validate authentication for non-OPTIONS requests
      const auth = validateAuth(event);
      if (auth.error) return auth.error;

      // Parse body for POST/PUT requests
      const body = (method === 'POST' || method === 'PUT') ? parseBody(event) : null;

      // Create minimal Express-like req/res objects
      const req = {
        method,
        headers: event.headers || {},
        body
      };

      let responseData = null;
      let statusCode = 200;

      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        json(data) {
          responseData = data;
          return this;
        },
        setHeader() {
          return this;
        },
        end() {
          return this;
        }
      };

      // Call the Express handler
      await expressHandler(req, res);

      // Return Lambda response
      return {
        statusCode,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
        },
        body: JSON.stringify(responseData)
      };

    } catch (error) {
      console.error('Account handler error:', error);
      return errorResponse(500, 'Internal server error', error.message);
    }
  };
}
