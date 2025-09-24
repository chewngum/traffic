// /api/login.js
// Authentication API with access level management using site manifest

import fs from 'fs';
import path from 'path';

// Load site manifest configuration
function loadSiteManifest() {
  try {
    // Try multiple possible locations for the manifest
    const possiblePaths = [
      path.join(process.cwd(), 'site-manifest.json'),           // Current directory
      path.join(process.cwd(), 'public', 'site-manifest.json'), // Public folder
      path.join(process.cwd(), '..', 'public', 'site-manifest.json'), // Parent/public
      path.join(__dirname, '..', 'public', 'site-manifest.json')       // Relative to api folder
    ];
    
    for (const manifestPath of possiblePaths) {
      if (fs.existsSync(manifestPath)) {
        console.log(`Loading manifest from: ${manifestPath}`);
        const manifestData = fs.readFileSync(manifestPath, 'utf8');
        return JSON.parse(manifestData);
      }
    }
    
    throw new Error('site-manifest.json not found in any expected location');
  } catch (error) {
    console.error('Error loading site-manifest.json:', error);
    // Fallback to default configuration
    return getFallbackConfig();
  }
}

// Fallback configuration if manifest fails to load
function getFallbackConfig() {
  return {
    users: {
      'guest': {
        password: 'guest123',
        accessLevel: 1,
        displayName: 'Guest User',
        description: 'Limited access to basic features'
      },
      'demo': {
        password: 'demo456',
        accessLevel: 2,
        displayName: 'Demo User',
        description: 'Standard access to most features'
      },
      'admin': {
        password: 'admin789',
        accessLevel: 3,
        displayName: 'Administrator',
        description: 'Full access to all features'
      }
    },
    accessLevels: {
      "1": { 
        name: "Guest", 
        color: "#6c757d",
        description: "Basic access to free simulations and tools"
      },
      "2": { 
        name: "Standard", 
        color: "#6b99c2",
        description: "Access to advanced simulations and features"
      },
      "3": { 
        name: "Premium", 
        color: "#354e8d",
        description: "Full access to all features and tools"
      }
    },
    settings: {
      tokenExpiry: 24,
      defaultAccessLevel: 1,
      siteName: "Engineering Simulations"
    }
  };
}

export default function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username and password are required' 
      });
    }

    // Load user database from site manifest
    const manifest = loadSiteManifest();
    const validUsers = manifest.users;
    const accessLevels = manifest.accessLevels;
    const settings = manifest.settings || {};

    // Check if user exists and password matches
    const user = validUsers[username.toLowerCase()];
    
    if (user && user.password === password) {
      // Create a token with user info (timestamp:username:accessLevel)
      const tokenData = `${Date.now()}:${username}:${user.accessLevel}`;
      const token = Buffer.from(tokenData).toString('base64');
      
      // Get access level info
      const accessLevelInfo = accessLevels[user.accessLevel.toString()];
      
      res.json({ 
        success: true, 
        token: token,
        accessLevel: user.accessLevel,
        displayName: user.displayName,
        accessLevelName: accessLevelInfo?.name || 'Unknown',
        accessLevelColor: accessLevelInfo?.color || '#6c757d',
        description: user.description || accessLevelInfo?.description || '',
        tokenExpiry: settings.tokenExpiry || 24,
        siteName: settings.siteName || 'Engineering Simulations',
        message: `Login successful - ${accessLevelInfo?.name || 'Level ' + user.accessLevel} access granted`
      });
    } else {
      res.status(401).json({ 
        success: false, 
        error: 'Invalid username or password' 
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}