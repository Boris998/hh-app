// src/middleware/error-handler.ts
import type { Context, Next } from 'hono';
import { AppError, ErrorCode, errorResponse } from '../utils/responses';
import { ZodError } from 'zod';
import { HTTPException } from 'hono/http-exception';

export const errorHandler = () => {
  return async (c: Context, next: Next) => {
    try {
      await next();
    } catch (error) {
      console.error('Error caught:', error);

      // Handle Hono's built-in HTTP exceptions
      if (error instanceof HTTPException) {
        const appError = new AppError(
          ErrorCode.VALIDATION_ERROR,
          error.message,
          error.status as any
        );
        return errorResponse(c, appError);
      }

      // Handle Zod validation errors
      if (error instanceof ZodError) {
        const validationErrors = error.errors.map(e => 
          `${e.path.join('.')}: ${e.message}`
        ).join(', ');
        
        const appError = new AppError(
          ErrorCode.VALIDATION_ERROR,
          `Validation failed: ${validationErrors}`,
          400
        );
        return errorResponse(c, appError);
      }

      // Handle custom app errors
      if (error instanceof AppError) {
        return errorResponse(c, error);
      }

      // Handle unknown errors - don't expose internal details in production
      const unknownError = new AppError(
        ErrorCode.INTERNAL_ERROR,
        process.env.NODE_ENV === 'production' 
          ? 'An unexpected error occurred' 
          : (typeof error === 'object' && error && 'message' in error && typeof (error as any).message === 'string'
            ? (error as any).message
            : 'Unknown error'),
        500
      );
      return errorResponse(c, unknownError);
    }
  };
};