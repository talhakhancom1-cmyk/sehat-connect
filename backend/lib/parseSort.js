/**
 * Parse the `_sort` query param (Base44 convention) into a Sequelize `order` clause.
 *
 * Frontend sends e.g. `-rating`, `-created_date`, `appointment_date`, `-taken_at`.
 * The leading `-` means DESC; otherwise ASC.
 *
 * @param {object} query        - req.query from the route
 * @param {string[]} allowed    - whitelist of real DB column names that are safe to sort by
 * @param {string}   fallback   - column to use when _sort is absent or invalid
 * @param {string}   fallbackDir - direction for the fallback ('ASC' | 'DESC'), default 'DESC'
 * @returns {Array} Sequelize order clause, e.g. [['rating','DESC']]
 *
 * Also maps common Base44 alias names to their real DB columns:
 *   created_date -> created_at
 *   updated_date -> updated_at
 */
const SORT_ALIASES = {
  created_date: 'created_at',
  updated_date: 'updated_at',
};

function parseSort(query, allowed, fallback = 'created_at', fallbackDir = 'DESC') {
  const raw = String(query._sort || '').trim();
  if (!raw) {
    return [[fallback, fallbackDir]];
  }

  const dir = raw.startsWith('-') ? 'DESC' : 'ASC';
  let field = raw.replace(/^-/, '').trim();
  if (!field) return [[fallback, fallbackDir]];

  // Resolve Base44 alias names to real DB columns
  field = SORT_ALIASES[field] || field;

  // Validate against the whitelist
  if (!allowed.includes(field)) {
    return [[fallback, fallbackDir]];
  }

  return [[field, dir]];
}

module.exports = { parseSort, SORT_ALIASES };
