// Native Lambda handler for usage tracking
import pool from '../../lib/database.js';
import {
  handleCORS,
  parseBody,
  getMethod,
  validateAuth,
  errorResponse,
  successResponse
} from '../lib/lambda-utils.js';

// Guest session storage - in-memory for this Lambda instance
const guestSessions = new Map();

function getGuestSessionKey(token) {
  const decoded = Buffer.from(token, 'base64').toString('utf-8');
  const [timestamp, username] = decoded.split(':');
  return `${username}_${timestamp}`;
}

function recordGuestUsage(sessionKey, simulationType, parameters, runtimeMs, success) {
  if (!guestSessions.has(sessionKey)) {
    guestSessions.set(sessionKey, []);
  }

  const usage = guestSessions.get(sessionKey);
  usage.push({
    simulation_type: simulationType,
    parameters: JSON.stringify(parameters),
    runtime_ms: runtimeMs,
    success: success,
    created_at: new Date().toISOString()
  });

  // Keep only last 50 runs to prevent memory issues
  if (usage.length > 50) {
    usage.splice(0, usage.length - 50);
  }

  guestSessions.set(sessionKey, usage);
}

export const main = async (event) => {
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

    // Parse request body
    const { simulationType, parameters, runtimeMs, success, timestamp, pageUrl } = parseBody(event);

    // Validate required fields
    if (!simulationType || typeof runtimeMs !== 'number' || typeof success !== 'boolean') {
      return errorResponse(400, 'Missing required fields: simulationType, runtimeMs, success');
    }

    // Validate simulation type
    const allowedSimulationTypes = [
      'boomgate',
      'carlift',
      'carparkutilisation',
      'mechanical',
      'schoolpickup',
      'two-way-passing',
      'rampdrawer'
    ];

    if (!allowedSimulationTypes.includes(simulationType)) {
      return errorResponse(400, `Invalid simulation type: ${simulationType}`);
    }

    const { userInfo, token } = auth;
    const isGuest = userInfo.username.startsWith('guest_') || userInfo.accessLevel === 0 || userInfo.username === 'guest';

    if (isGuest) {
      // For guest users, store in memory
      const sessionKey = getGuestSessionKey(token);
      recordGuestUsage(sessionKey, simulationType, parameters || {}, runtimeMs, success);

      console.log(`Guest usage recorded: ${simulationType}, ${runtimeMs}ms, success: ${success}`);

      return successResponse({
        message: 'Guest usage tracked successfully',
        isGuest: true
      });
    } else {
      // For regular users, record in database
      try {
        // Get user ID from database
        const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [userInfo.username]);

        if (userResult.rows.length === 0) {
          return errorResponse(404, 'User not found');
        }

        const userId = userResult.rows[0].id;

        // Insert usage record
        await pool.query(`
          INSERT INTO simulation_usage (user_id, simulation_type, parameters, runtime_ms, success, created_at)
          VALUES ($1, $2, $3, $4, $5, NOW())
        `, [userId, simulationType, JSON.stringify(parameters || {}), runtimeMs, success]);

        console.log(`User usage recorded: ${userInfo.username}, ${simulationType}, ${runtimeMs}ms, success: ${success}`);

        return successResponse({
          message: 'Usage tracked successfully',
          isGuest: false
        });

      } catch (dbError) {
        console.error('Database error in usage tracking:', dbError);

        // Fallback to guest-style tracking if database fails
        const sessionKey = getGuestSessionKey(token);
        recordGuestUsage(sessionKey, simulationType, parameters || {}, runtimeMs, success);

        return successResponse({
          message: 'Usage tracked in session (database unavailable)',
          isGuest: false,
          fallback: true
        });
      }
    }

  } catch (error) {
    console.error('Usage tracking error:', error);
    return errorResponse(500, 'Internal server error', error.message);
  }
};
