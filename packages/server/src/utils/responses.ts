// src/utils/responses.ts
import { type Context } from 'hono';
import type { ContentfulStatusCode, StatusCode } from 'hono/utils/http-status';

// Error codes enum for consistency
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

// Custom error class
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode: ContentfulStatusCode = 400
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Base response types
type Status = 'success' | 'fail' | 'error';

type BaseResponse = {
  status: Status;
  message?: string;
  timestamp: string;
};

type SuccessResponse<T = any> = BaseResponse & {
  status: 'success';
  data: T;
};

type ErrorResponse = BaseResponse & {
  status: 'error' | 'fail';
  error: {
    code: ErrorCode;
    message: string;
    details?: string | string[];
  };
};

// Main response functions using Hono's native types
export const successResponse = <T>(
  c: Context,
  data: T,
  statusCode: ContentfulStatusCode = 200,
  message?: string
) => {
  const response: SuccessResponse<T> = {
    status: 'success',
    data,
    timestamp: new Date().toISOString(),
    ...(message && { message })
  };

  return c.json(response, { status: statusCode });
};

export const errorResponse = (
  c: Context,
  error: AppError | Error,
  statusCode?: ContentfulStatusCode
) => {
  const isAppError = error instanceof AppError;
  const finalStatusCode = statusCode || (isAppError ? error.statusCode : 500);
  const errorCode = isAppError ? error.code : ErrorCode.INTERNAL_ERROR;

  const response: ErrorResponse = {
    status: finalStatusCode >= 500 ? 'error' : 'fail',
    error: {
      code: errorCode,
      message: error.message || 'An unexpected error occurred'
    },
    timestamp: new Date().toISOString()
  };

  return c.json(response, { status: finalStatusCode });
};

// Convenience functions for common responses
export const badRequest = (c: Context, message: string, details?: string | string[]) => {
  const error = new AppError(ErrorCode.VALIDATION_ERROR, message, 400);
  return errorResponse(c, error);
};

export const unauthorized = (c: Context, message: string = 'Unauthorized') => {
  const error = new AppError(ErrorCode.UNAUTHORIZED, message, 401);
  return errorResponse(c, error);
};

export const forbidden = (c: Context, message: string = 'Forbidden') => {
  const error = new AppError(ErrorCode.FORBIDDEN, message, 403);
  return errorResponse(c, error);
};

export const notFound = (c: Context, message: string = 'Resource not found') => {
  const error = new AppError(ErrorCode.NOT_FOUND, message, 404);
  return errorResponse(c, error);
};

export const conflict = (c: Context, message: string) => {
  const error = new AppError(ErrorCode.CONFLICT, message, 409);
  return errorResponse(c, error);
};

export const rateLimited = (c: Context, message: string = 'Too many requests') => {
  const error = new AppError(ErrorCode.RATE_LIMITED, message, 429);
  return errorResponse(c, error);
};

export const internalError = (c: Context, message: string = 'Internal server error') => {
  const error = new AppError(ErrorCode.INTERNAL_ERROR, message, 500);
  return errorResponse(c, error);
};

// Type exports for client-side usage
export type { SuccessResponse, ErrorResponse };