import { type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

type Status = 'success' | 'fail' | 'error';

type BaseResponse = {
  status: Status;
  message: string;
  statusCode?: number;
};

type SuccessResponse<T> = {
  status: 'success';
  payload: T;
} & BaseResponse;

export type ErrorResponse = {
  status: 'error' | 'fail';
  errors?: string | string[];
} & BaseResponse;

export type Response<T> = SuccessResponse<T> | ErrorResponse;

export const sendSuccess = <T>(
  c: Context,
  { statusCode = 200, ...res }: Omit<SuccessResponse<T>, 'status'>,
) => {
  return c.json({ ...res, status: 'success' }, { status: statusCode as ContentfulStatusCode });
};

export const sendError = (
  c: Context,
  { statusCode = 400, ...res }: ErrorResponse,
) => {
  return c.json(res, { status: statusCode as ContentfulStatusCode });
};
