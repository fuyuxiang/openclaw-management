import { Response } from 'express';
import { ApiFailure, ApiSuccess } from '../types';

export function sendSuccess<T>(res: Response, data: T, message?: string, statusCode = 200): Response<ApiSuccess<T>> {
  return res.status(statusCode).json({
    success: true,
    data,
    ...(message ? { message } : {})
  });
}

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown
): Response<ApiFailure> {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {})
    }
  });
}
