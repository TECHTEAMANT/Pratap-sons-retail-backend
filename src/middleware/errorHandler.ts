import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    logger.warn(`AppError: ${err.message}`, { statusCode: err.statusCode });
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      error: err.message,
    });
    return;
  }

  // PostgreSQL specific errors
  if ((err as any).code) {
    const pgError = err as any;

    switch (pgError.code) {
      case '23505': // unique_violation
        res.status(409).json({
          success: false,
          message: 'Duplicate entry - record already exists',
          error: pgError.detail || pgError.message,
        });
        return;

      case '23503': // foreign_key_violation
        res.status(400).json({
          success: false,
          message: 'Referenced record does not exist',
          error: pgError.detail || pgError.message,
        });
        return;

      case '23502': // not_null_violation
        res.status(400).json({
          success: false,
          message: `Required field missing: ${pgError.column}`,
          error: pgError.message,
        });
        return;

      case '23514': // check_violation
        res.status(400).json({
          success: false,
          message: 'Data validation failed',
          error: pgError.detail || pgError.message,
        });
        return;

      case '42P01': // undefined_table
        logger.error('Table not found', { error: pgError.message });
        res.status(500).json({
          success: false,
          message: 'Database configuration error',
          error: 'Internal server error',
        });
        return;
    }
  }

  // Generic error
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
}
