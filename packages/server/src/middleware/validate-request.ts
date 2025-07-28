// src/middleware/validate-request.ts - Fixed version
import type { Context, Next } from 'hono';
import { z, ZodSchema } from 'zod';

export const validateRequest = (schema: ZodSchema) => {
  return async (c: Context, next: Next) => {
    try {
      const body = await c.req.json();
      const validatedData = schema.parse(body);
      
      // Store validated data in context
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