import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { sendBadRequest } from '../utils/response';

/**
 * Middleware factory: validate request body/query/params against a Joi schema
 */
export function validate(schema: Joi.ObjectSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const data = req[source];

    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
      allowUnknown: false,
    });

    if (error) {
      const messages = error.details.map((detail) => detail.message).join('; ');
      sendBadRequest(res, `Validation error: ${messages}`);
      return;
    }

    // Replace with validated/sanitized values
    req[source] = value;
    next();
  };
}
