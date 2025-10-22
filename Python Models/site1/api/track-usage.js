// Fixed /api/track-usage.js - Direct handling without internal API calls

import pool from '../lib/database.js';

// Guest session storage - in-memory for this session only
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

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const token = authHeader.substring(7);
        if (!isValidToken(token)) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }

        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        const { simulationType, parameters, runtimeMs, success, timestamp, pageUrl } = req.body;

        // Validate required fields
        if (!simulationType || typeof runtimeMs !== 'number' || typeof success !== 'boolean') {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: simulationType, runtimeMs, success' 
            });
        }

        // Updated list of allowed simulation types
        const allowedSimulationTypes = [
            'boomgate',
            'carlift',
            'carparkutilisation',
            'mechanical',
            'schoolpickup',
            'two-way-passing',
            'rampdrawer',
            'streetsection'
        ];

        if (!allowedSimulationTypes.includes(simulationType)) {
            return res.status(400).json({ 
                success: false, 
                error: `Invalid simulation type: ${simulationType}` 
            });
        }

        const userInfo = getUserInfoFromToken(token);
        const isGuest = userInfo.username.startsWith('guest_') || userInfo.accessLevel === 0;

        if (isGuest) {
            // For guest users, store in memory
            const sessionKey = getGuestSessionKey(token);
            recordGuestUsage(sessionKey, simulationType, parameters || {}, runtimeMs, success);
            
            console.log(`Guest usage recorded: ${simulationType}, ${runtimeMs}ms, success: ${success}`);
            
            return res.json({ 
                success: true, 
                message: 'Guest usage tracked successfully',
                isGuest: true
            });
        } else {
            // For regular users, record in database
            try {
                // Get user ID from database
                const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [userInfo.username]);
                
                if (userResult.rows.length === 0) {
                    return res.status(404).json({ 
                        success: false, 
                        error: 'User not found' 
                    });
                }
                
                const userId = userResult.rows[0].id;
                
                // Insert usage record
                await pool.query(`
                    INSERT INTO simulation_usage (user_id, simulation_type, parameters, runtime_ms, success, created_at)
                    VALUES ($1, $2, $3, $4, $5, NOW())
                `, [userId, simulationType, JSON.stringify(parameters || {}), runtimeMs, success]);
                
                console.log(`User usage recorded: ${userInfo.username}, ${simulationType}, ${runtimeMs}ms, success: ${success}`);
                
                return res.json({ 
                    success: true, 
                    message: 'Usage tracked successfully',
                    isGuest: false
                });
                
            } catch (dbError) {
                console.error('Database error in usage tracking:', dbError);
                
                // Fallback to guest-style tracking if database fails
                const sessionKey = getGuestSessionKey(token);
                recordGuestUsage(sessionKey, simulationType, parameters || {}, runtimeMs, success);
                
                return res.json({ 
                    success: true, 
                    message: 'Usage tracked in session (database unavailable)',
                    isGuest: false,
                    fallback: true
                });
            }
        }

    } catch (error) {
        console.error('Usage tracking error:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

function isValidToken(token) {
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const [timestamp, username, accessLevel] = decoded.split(':');
        const tokenAge = Date.now() - parseInt(timestamp);
        return tokenAge < 24 * 60 * 60 * 1000; // 24 hours
    } catch {
        return false;
    }
}

function getUserInfoFromToken(token) {
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