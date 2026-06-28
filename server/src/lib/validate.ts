import type { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';

// Request validation middleware. Every endpoint validates its input against a
// Zod schema before any logic runs, so malformed/oversized/unknown fields are
// rejected at the edge. Parsed (and thus sanitized/typed) values replace the
// raw input.
type Schemas = {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
};

export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      if (schemas.query) {
        // req.query is a read-only getter on Express 5+/some setups; stash the
        // parsed result instead of reassigning.
        (req as Request & { validatedQuery?: unknown }).validatedQuery = schemas.query.parse(req.query);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Helper to read the validated query (see note above).
export function validatedQuery<T>(req: Request): T {
  return (req as Request & { validatedQuery?: T }).validatedQuery as T;
}
