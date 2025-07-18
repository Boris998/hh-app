import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { registerSchema, registerUser } from './services/auth';

const app = new Hono();

app.get('/', (c) => c.text('Server running'));

app.post('/auth/register', zValidator('json', registerSchema), async (c) => {
  try {
    const data = c.req.valid('json');
    const user = await registerUser(data);
    return c.json({ user }, 201);
  } catch (error:any) {
    return c.json({ error: error.message }, 400);
  }
});

export default {
  port: process.env.PORT || 3001,
  fetch: app.fetch,
};