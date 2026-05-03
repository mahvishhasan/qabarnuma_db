// ── Shared backend utilities ─────────────────────────────────

/**
 * Validate required fields. Throws a structured error if any are missing.
 * Usage: validate(['field1', 'field2'], req.body)
 */
function validate(fields, body) {
  const missing = fields.filter(f => body[f] == null || body[f] === '');
  if (missing.length) {
    const err = new Error(`Missing required fields: ${missing.join(', ')}`);
    err.status = 400;
    throw err;
  }
}

/**
 * Parse a positive integer from a value.
 * Returns null if invalid.
 */
function parseId(val) {
  const n = parseInt(val, 10);
  return isNaN(n) || n < 1 ? null : n;
}

/**
 * Standard pagination params from query string.
 * Returns { limit, offset } with safe defaults.
 */
function paginate(query) {
  const limit  = Math.min(parseInt(query.limit,  10) || 100, 500);
  const page   = Math.max(parseInt(query.page,   10) || 1,   1);
  const offset = (page - 1) * limit;
  return { limit, offset, page };
}

module.exports = { validate, parseId, paginate };
