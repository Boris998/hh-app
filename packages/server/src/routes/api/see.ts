import { Hono } from 'hono';
import { streamText } from 'hono/streaming';

const app = new Hono();

app.get('/sse', (c) => {
  return streamText(c, async (stream) => {
    while (true) {
      await stream.write(`data: ${Date.now()}\n\n`);
      await stream.sleep(1000); 
    }
  });
});