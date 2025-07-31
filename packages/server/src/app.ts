// src/app.ts - Updated with all routers
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';

import { errorHandler } from './middleware/error-handler.js';
import { activityTypesRouter } from './routes/activity-types.router.js';
import { authRouter } from './routes/auth.router.js';
import { messagingRouter } from './routes/messaging.router.js';
import { activitiesRouter } from './routes/enhanced-activities.router.js';
import { activityChatRouter } from './routes/activity-chat.router.js';

const app = new Hono();

// Middlewares
app.use('*', logger());
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'], 
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(secureHeaders());

// Health check
app.get('/', (c) => {
  return c.json({
    message: 'Sports API Server Running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});


app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// API Routes
const apiRoutes = app
  .basePath('/api')
  .route('/auth', authRouter)
  .route('/activity-types', activityTypesRouter)
  .route('/messaging', messagingRouter)
  .route('/activities', activitiesRouter)
  .route('/activities', activityChatRouter);
  // .route('/ws', websocketRouter);  

// Error handling middleware (should be last)
app.use('*', errorHandler());

app.notFound((c) => {
  return c.json({ 
    error: 'Route Not Found',
    message: `The endpoint ${c.req.method} ${c.req.path} was not found`,
    availableRoutes: [
      'GET /api/activities',
      'POST /api/activities',
      'GET /api/activities/:id/chat', 
      'POST /api/activities/:id/chat/messages', 
    ],
    timestamp: new Date().toISOString()
  }, 404);
});

export default app;
export type ApiRoutes = typeof apiRoutes;