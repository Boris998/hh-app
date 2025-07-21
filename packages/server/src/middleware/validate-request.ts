// packages/server/src/middlewares/validate-request.ts
import type { Context, Next } from 'hono';
import { z, ZodSchema } from 'zod';

export const validateRequest = (schema: ZodSchema) => {
  return async (c: Context, next: Next) => {
    try {
      // Get the request body
      const body = await c.req.json();
      
      // Validate the request body
      const validatedData = schema.parse(body);
      
      // Store validated data in context for use in handlers
      c.set('validatedBody', validatedData);
      
      await next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({
          error: 'Validation failed',
          details: error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message,
          })),
        }, 400);
      }
      return c.json({ error: 'Internal server error' }, 500);
    }
  };
};