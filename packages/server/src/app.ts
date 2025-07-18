import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';

import { type AppContext } from './lib/context.js';
import { errorHandler } from './middlewares/error-handler.js';
import { matchesRouter } from './routes/match.router.js';
import { playersRouter } from './routes/player.router.js';
import { teamsRouter } from './routes/team.router.js';
import { tournamentsRouter } from './routes/tournament.router.js';

const app = new Hono<AppContext>();

// Middlewares
app.use('*', logger());
app.use(cors());
app.use(secureHeaders());

// Health check
app.get('/', (c) => {
  return c.text('Sports API Server');
});

// API Routes
const apiRoutes = app
  .basePath('/api')
  .route('/teams', teamsRouter)
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