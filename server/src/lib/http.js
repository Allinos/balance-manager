/** HTTP helpers: errors, validation, pagination. */

import { z } from 'zod';

export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {string} code     machine-readable code, e.g. 'INVALID_CODE'
   * @param {string} message  user-friendly message
   * @param {object} [details]
   */
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what = 'Record') => new ApiError(404, 'NOT_FOUND', `${what} not found.`);
export const badRequest = (message, code = 'BAD_REQUEST') => new ApiError(400, code, message);

/** Validate `data` with a zod schema, throwing a 400 with field errors. */
export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const fields = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    const first = Object.entries(fields)[0];
    throw new ApiError(400, 'VALIDATION_ERROR', first ? `${first[0]}: ${first[1]}` : 'Invalid input.', { fields });
  }
  return result.data;
}

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).optional().default(''),
});

/** Run a paginated query. `build(qb)` applies filters to both the count and the page query. */
export async function paginate(knex, table, { page, pageSize }, build, { orderBy = [['id', 'desc']], select = ['*'] } = {}) {
  const countQ = knex(table);
  build(countQ);
  const [{ count }] = await countQ.count({ count: '*' });
  const q = knex(table).select(select);
  build(q);
  for (const [col, dir] of orderBy) q.orderBy(col, dir);
  const rows = await q.limit(pageSize).offset((page - 1) * pageSize);
  return { rows, total: Number(count), page, pageSize, pages: Math.max(1, Math.ceil(Number(count) / pageSize)) };
}

/** Wrap async route handlers (Express 5 already forwards rejections, kept for clarity). */
export const handler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function errorHandler(logger = console) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (err instanceof ApiError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'BAD_JSON', message: 'The request body is not valid JSON.' } });
    }
    if (err?.type === 'entity.too.large' || err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'The upload is too large.' } });
    }
    const unique = /unique|duplicate/i.test(String(err?.message)) || err?.code === '23505';
    if (unique) {
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'A record with the same value already exists.' } });
    }
    logger.error(`[${req.method} ${req.originalUrl}]`, err);
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong on the server. Please try again.' } });
  };
}

export const clientIp = (req) => String(req.ip || req.socket?.remoteAddress || '').slice(0, 64);
