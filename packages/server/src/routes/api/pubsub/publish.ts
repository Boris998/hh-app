import { createClient } from 'redis';
import { Hono } from 'hono';

const publisher = createClient({ url: process.env.REDIS_URL! });
await publisher.connect();

const app = new Hono();
app.post('/publish', async (c) => {
  const { channel, message } = await c.req.json();
  await publisher.publish(channel, message);
  return c.json({ success: true });
});