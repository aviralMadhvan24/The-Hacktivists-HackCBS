// HTTP helpers: typed errors, async route wrapper, zod validation, error middleware.

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (msg, details) => new HttpError(400, 'VALIDATION_ERROR', msg, details);
const unauthorized = (msg = 'Please sign in.') => new HttpError(401, 'UNAUTHORIZED', msg);
const forbidden = (msg = 'You do not have permission to do that.') => new HttpError(403, 'FORBIDDEN', msg);
const notFound = (msg = 'Not found.') => new HttpError(404, 'NOT_FOUND', msg);
const conflict = (msg) => new HttpError(409, 'CONFLICT', msg);

/** Wraps an async route so rejections reach the error middleware. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Parses data with a zod schema or throws a 400 listing every problem. */
function validate(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issues = r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    const msg = issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('; ');
    throw badRequest(msg, issues);
  }
  return r.data;
}

// eslint-disable-next-line no-unused-vars
function errorMiddleware(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ success: false, error: err.code, message: err.message, details: err.details });
  }
  if (err && err.code === 'DB_NOT_CONFIGURED') {
    return res.status(503).json({ success: false, error: 'DB_NOT_CONFIGURED', message: 'The database is not configured. Set DATABASE_URL.' });
  }
  if (err && err.code === '23505') {
    return res.status(409).json({ success: false, error: 'CONFLICT', message: 'That record already exists.' });
  }
  if (err && (err.code === 'ECONNREFUSED' || err.code === '57P01' || err.code === 'ETIMEDOUT')) {
    console.error('Database unavailable:', err.message);
    return res.status(503).json({ success: false, error: 'DB_UNAVAILABLE', message: 'The database is temporarily unavailable. Please retry shortly.' });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'INVALID_JSON', message: 'Request body is not valid JSON.' });
  }
  console.error('Unhandled server error:', err);
  const expose = process.env.NODE_ENV !== 'production';
  return res.status(500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: expose && err && err.message ? err.message : 'An unexpected error occurred.',
  });
}

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound, conflict, wrap, validate, errorMiddleware };
