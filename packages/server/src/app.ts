// src/app.ts - Complete setup with all routers and Zod integration
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';

import { errorHandler } from './middleware/error-handler.js';

// Import all routers
import { activityTypesRouter } from './routes/activity-types.router.js';
import { authRouter } from './routes/auth.router.js';
import { usersRouter } from './routes/users.router.js';
import { activitiesRouter } from './routes/enhanced-activities.router.js';
import { skillRatingRouter } from './routes/skill-rating.router.js';
import { messagingRouter } from './routes/messaging.router.js';
import { activityChatRouter } from './routes/activity-chat.router.js';
import { deltaRouter } from './routes/delta.router.js';
import { notificationsRouter } from './routes/notifications.router.js';
import invitationsRouter from './routes/invitations.router.js';

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

// Health check endpoints
app.get('/', (c) => {
  return c.json({
    message: 'Sports API Server Running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    status: 'healthy'
  });
});

app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API Routes - All routes properly mounted
const apiRoutes = app
  .basePath('/api')
  .route('/auth', authRouter)
  .route('/users', usersRouter)
  .route('/activity-types', activityTypesRouter)
  .route('/activities', activitiesRouter)
  .route('/skill-ratings', skillRatingRouter)
  .route('/messaging', messagingRouter)
  .route('/chat', activityChatRouter)
  .route('/delta', deltaRouter)
  .route('/notifications', notificationsRouter)
  .route('/invitations', invitationsRouter);

// Error handling middleware (should be last)
app.use('*', errorHandler());

// Enhanced 404 handler with available routes
app.notFound((c) => {
  return c.json({ 
    error: 'Route Not Found',
    message: `The endpoint ${c.req.method} ${c.req.path} was not found`,
    availableRoutes: {
      auth: [
        'POST /api/auth/login',
        'POST /api/auth/register', 
        'POST /api/auth/refresh',
        'POST /api/auth/logout',
        'GET /api/auth/me'
      ],
      users: [
        'GET /api/users/:userId/quick-stats',
        'GET /api/users/:userId/elo',
        'GET /api/users/:userId/skills',
        'GET /api/users/:userId/activity-stats',
        'GET /api/users/:userId/profile'
      ],
      activities: [
        'GET /api/activities',
        'POST /api/activities',
        'GET /api/activities/:id',
        'POST /api/activities/:id/join',
        'POST /api/activities/:id/complete'
      ],
      skillRatings: [
        'POST /api/skill-ratings',
        'GET /api/skill-ratings/activity/:activityId/pending',
        'GET /api/skill-ratings/user/:userId'
      ],
      notifications: [
        'GET /api/notifications/count',
        'GET /api/notifications',
        'POST /api/notifications/:id/read'
      ],
      other: [
        'GET /api/activity-types',
        'GET /api/delta/changes',
        'GET /api/delta/health'
      ]
    },
    timestamp: new Date().toISOString()
  }, 404);
});

export default app;
export type ApiRoutes = typeof apiRoutes;