// packages/server/src/routes/team.router.ts
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

import { insertTeamSchema, updateTeamSchema, nanoIdSchema } from '../db/zod.schema.js';
import { type AppContext } from '../lib/context.js';
import {
  createTeam,
  deleteTeam,
  getTeam,
  getTeams,
  updateTeam,
} from '../repository/team.repo.js';
import { sendSuccess } from '../utils/responses.js';

export const teamsRouter = new Hono<AppContext>()
  .get('/', async (c) => {
    const teams = await getTeams();
    return sendSuccess(c, {
      payload: teams,
      message: 'Teams retrieved successfully',
    });
  })
  .get(
    '/:id',
    zValidator('param', z.object({ id: nanoIdSchema })),
    async (c) => {
      const { id } = c.req.valid('param');
      const team = await getTeam(id);
      if (!team) throw new HTTPException(404, { message: 'Team not found' });
      
      return sendSuccess(c, {
        payload: team,
        message: 'Team retrieved successfully',
      });
    },
  )
  .post('/', zValidator('query', insertTeamSchema), async (c) => {
    const teamData = c.req.valid('query');
    const team = await createTeam(teamData);
    
    return sendSuccess(c, {
      payload: team,
      message: 'Team created successfully',
      statusCode: 201,
    });
  })
  .patch(
    '/:id',
    zValidator('param', z.object({ id: nanoIdSchema })),
    zValidator('json', updateTeamSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const teamData = c.req.valid('json');
      
      const team = await updateTeam(id, teamData);
      if (!team) throw new HTTPException(404, { message: 'Team not found' });
      
      return sendSuccess(c, {
        payload: team,
        message: 'Team updated successfully',
      });
    },
  )
  .delete(
    '/:id',
    zValidator('param', z.object({ id: nanoIdSchema })),
    async (c) => {
      const { id } = c.req.valid('param');
      const team = await deleteTeam(id);
      if (!team) throw new HTTPException(404, { message: 'Team not found' });
      
      return sendSuccess(c, {
        payload: null,
        message: 'Team deleted successfully',
      });
    },
  );