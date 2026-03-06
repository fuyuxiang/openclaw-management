import { NextFunction, Request, Response } from 'express';
import { AppError, CommandError } from '../utils/errors';
import { sendError } from '../utils/response';

export function notFoundHandler(_req: Request, res: Response): void {
  sendError(res, 404, 'NOT_FOUND', '接口不存在');
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    sendError(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  if (err instanceof CommandError) {
    sendError(res, 500, 'COMMAND_ERROR', err.message, {
      exitCode: err.exitCode,
      stdout: err.stdout,
      stderr: err.stderr
    });
    return;
  }

  const message = err instanceof Error ? err.message : '未知错误';
  sendError(res, 500, 'INTERNAL_ERROR', message);
}
