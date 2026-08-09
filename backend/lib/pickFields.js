/**
 * Pick only the allowed fields from an object (mass-assignment protection).
 *
 * Usage:
 *   const updates = pickFields(req.body, ['display_name', 'phone']);
 *
 * @param {object} source - The input object (e.g. req.body)
 * @param {string[]} allowed - Whitelist of field names
 * @returns {object} A new object containing only the allowed fields that were present
 */
function pickFields(source, allowed) {
  if (!source || typeof source !== 'object') return {};
  const result = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      result[key] = source[key];
    }
  }
  return result;
}

module.exports = { pickFields };
