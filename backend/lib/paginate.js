/**
 * Shared pagination helper for Sequelize list endpoints.
 *
 * Supports two strategies:
 *   1. Offset pagination (default): ?page=1&per_page=20
 *      Returns { data, total_count, page, per_page, total_pages, has_more }
 *   2. Cursor pagination: ?cursor=<base64>&limit=20
 *      Returns { data, next_cursor, has_more }
 *
 * Also supports the Base44 convention (?_limit=20) for backward compatibility.
 *
 * Usage in a route:
 *   const { paginate, buildPaginatedResponse } = require('../lib/paginate');
 *   const { page, per_page, offset, limit, use_cursor, cursor } = paginate(req);
 *   const { rows, count } = await Model.findAndCountAll({ where, order, offset, limit });
 *   res.json(buildPaginatedResponse(req, rows, count));
 */
const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

function paginate(req) {
  const query = req?.query || {};

  // Cursor mode: if `cursor` is present, use cursor pagination
  if (query.cursor) {
    const limit = Math.min(parseInt(query.limit || query._limit, 10) || DEFAULT_PER_PAGE, MAX_PER_PAGE);
    let cursor = null;
    try {
      cursor = JSON.parse(Buffer.from(query.cursor, 'base64').toString('utf8'));
    } catch {
      cursor = null;
    }
    return { use_cursor: true, cursor, limit, offset: 0, page: null, per_page: limit };
  }

  // Offset mode
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const per_page = Math.min(
    parseInt(query.per_page || query._limit, 10) || DEFAULT_PER_PAGE,
    MAX_PER_PAGE
  );
  const offset = (page - 1) * per_page;

  return { use_cursor: false, cursor: null, page, per_page, offset, limit: per_page };
}

/**
 * Build a paginated response object (offset mode).
 */
function buildPaginatedResponse(req, rows, totalCount = 0) {
  const { page, per_page } = paginate(req);
  const total_pages = Math.ceil(totalCount / per_page);
  return {
    data: rows,
    total_count: totalCount,
    page,
    per_page,
    total_pages,
    has_more: page < total_pages,
  };
}

/**
 * Build a cursor for the next page (cursor mode).
 * The cursor encodes the sort value + id of the last row.
 */
function buildNextCursor(rows, sortField = 'created_at') {
  if (!rows || rows.length === 0) return null;
  const last = rows[rows.length - 1];
  const raw = last.get ? last.get() : last;
  const cursorData = {
    [sortField]: raw[sortField],
    id: raw.id,
  };
  return Buffer.from(JSON.stringify(cursorData), 'utf8').toString('base64');
}

/**
 * Build a cursor-mode response.
 */
function buildCursorResponse(rows, hasNext, sortField = 'created_at') {
  return {
    data: rows,
    next_cursor: hasNext ? buildNextCursor(rows, sortField) : null,
    has_more: hasNext,
  };
}

module.exports = {
  paginate,
  buildPaginatedResponse,
  buildNextCursor,
  buildCursorResponse,
  DEFAULT_PER_PAGE,
  MAX_PER_PAGE,
};
