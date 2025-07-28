// src/index.ts - Server startup with env loading
import 'dotenv/config'; // Load environment variables first
import { serve } from '@hono/node-server';
import app from './app.js';

const port = parseInt(process.env.PORT || '3001');

console.log(`🚀 Starting Sports API Server...`);
console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`💾 Database: ${process.env.DATABASE_URL ? '✅ Connected' : '❌ Not configured'}`);
console.log(`🔗 DB URL: ${process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 30) + '...' : 'Not set'}`);

serve({
  fetch: app.fetch,
  port: port,
}, (info) => {
  console.log(`✅ Server is running on http://localhost:${info.port}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   GET  http://localhost:${info.port}/`);
  console.log(`   GET  http://localhost:${info.port}/health`);
  console.log(`   GET  http://localhost:${info.port}/api/activity-types`);
  console.log(`   POST http://localhost:${info.port}/api/auth/login`);
  console.log(`\n🔧 To test: curl http://localhost:${info.port}/health`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down server gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down server gracefully...');
  process.exit(0);
});