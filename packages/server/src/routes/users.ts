import { Hono } from 'hono';
import { getUserById } from '../services/user';
import { zValidator } from '@hono/zod-validator';
import { registerSchema, registerUser } from '../services/auth';

const app = new Hono();

app.get('/users/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const user = await getUserById(id);
  return user ? c.json(user) : c.notFound();
});

app.post('/register', 
  zValidator('json', registerSchema), 
  async (c) => {
    const data = c.req.valid('json');
    const user = await registerUser(data);
    return c.json({ user });
  }
);

export default app;