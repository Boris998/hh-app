// packages/server/src/app.ts
import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';

import { type AppContext } from './lib/context.js';
import { errorHandler } from './middlewares/error-handler.js';
import { matchesRouter } from './routes/match.router.js';
import { playersRouter } from './routes/player.router.js';
import { tournamentsRouter } from './routes/tournament.router.js';
import { websocketRouter } from './routes/websocket.router.js';
import { teamRouter } from './routes/team.router.js';

const app = new Hono<AppContext>();

// Middlewares
app.use('*', logger());
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'], // Add your frontend URLs
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(secureHeaders());

// Health check
app.get('/', (c) => {
  return c.text('Sports API Server with WebSocket Support');
});

// WebSocket routes (should be before API routes to handle upgrade requests)
app.route('/ws', websocketRouter);

// API Routes
const apiRoutes = app
  .basePath('/api')
  .route('/teams', teamRouter)
  .route('/players', playersRouter)
  .route('/tournaments', tournamentsRouter)
  .route('/matches', matchesRouter);

// Error handling
app.onError((err, c) => {
  return errorHandler(err, c);
});

app.notFound((c) => {
  return c.text('Route Not Found', 404);
});

export const handler = handle(app);
export default app;
export type ApiRoutes = typeof apiRoutes;