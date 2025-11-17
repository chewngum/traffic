#!/usr/bin/env node

/**
 * Local Development Server
 * Serves static files from /public and proxies API calls to serverless-offline
 */

import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { config } from 'dotenv';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.local if .env doesn't exist
if (!fs.existsSync('.env') && fs.existsSync('.env.local')) {
  console.log('📋 Loading environment from .env.local...');
  config({ path: '.env.local' });
} else {
  config();
}

const FRONTEND_PORT = 8080;
const LAMBDA_PORT = 3000;

// Start serverless-offline in the background
console.log('🚀 Starting serverless-offline...\n');
const serverless = spawn('npx', ['serverless', 'offline', '--httpPort', String(LAMBDA_PORT)], {
  stdio: 'inherit',
  env: { ...process.env } // Pass environment variables to serverless
});

// Wait for serverless to start
setTimeout(() => {
  const app = express();

  // Proxy API requests to serverless-offline
  app.use('/api', createProxyMiddleware({
    target: `http://localhost:${LAMBDA_PORT}`,
    changeOrigin: true,
    logLevel: 'warn',
    onError: (err, req, res) => {
      console.error('Proxy error:', err.message);
      res.status(500).json({ error: 'API proxy error' });
    }
  }));

  // Serve static files from public directory
  app.use(express.static(path.join(__dirname, 'public'), {
    extensions: ['html']
  }));

  // Catch-all route for SPA - must be last
  app.use((req, res) => {
    // Only serve index.html for non-API routes
    if (!req.path.startsWith('/api')) {
      const indexPath = path.join(__dirname, 'public', 'index.html');
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: 'API route not found' });
    }
  });

  app.listen(FRONTEND_PORT, () => {
    console.log('\n✨ Development server running!\n');
    console.log(`🌐 Frontend: http://localhost:${FRONTEND_PORT}`);
    console.log(`🔌 API:      http://localhost:${LAMBDA_PORT}/api`);
    console.log('\n📁 Serving static files from: /public');
    console.log('\nPress Ctrl+C to stop\n');
  });

  // Handle errors
  app.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`\n❌ Port ${FRONTEND_PORT} is already in use!`);
      console.error(`Run: lsof -ti:${FRONTEND_PORT} | xargs kill -9\n`);
      serverless.kill();
      process.exit(1);
    } else {
      console.error('Server error:', error);
    }
  });
}, 4000);

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down...');
  serverless.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  serverless.kill();
  process.exit(0);
});