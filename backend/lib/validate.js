// Shared server-side validation helpers.
// Each validator returns an error string when the value is invalid, or null
// when the value is valid (or absent — most validators skip empty values so
// they can be used for optional fields without extra conditionals).

'use strict';

// RFC-ish email pattern: local@domain with a reasonable TLD length.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Phone: allows +, digits, spaces, dashes, parentheses; rejects letters.
const PHONE_RE = /^[+]?[\d\s\-()]+$/;

// HH:MM 24-hour format (e.g. "14:30")
const TIME_24H_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// HH:MM 12-hour with optional AM/PM (e.g. "01:30 PM") — used by schedules
const TIME_12H_RE = /^([0-1]?\d):([0-5]\d)\s*(AM|PM)$/i;

/**
 * Validate an email address (RFC-ish).
 * @param {string} str
 * @returns {boolean} true when the string looks like a valid email.
 */
function validateEmail(str) {
  if (typeof str !== 'string' || !str.trim()) return false;
  return EMAIL_RE.test(str.trim());
}

/**
 * Validate a phone number. Allows +, digits, spaces, dashes, parentheses.
 * Rejects strings containing letters.
 * @param {string} str
 * @returns {boolean} true when the string is a plausible phone number.
 */
function validatePhone(str) {
  if (typeof str !== 'string' || !str.trim()) return false;
  const trimmed = str.trim();
  // Must contain at least 7 digits to be plausible
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return false;
  return PHONE_RE.test(trimmed);
}

/**
 * Validate that a numeric value falls within [min, max].
 * @param {*} value — will be coerced to Number.
 * @param {number} min
 * @param {number} max
 * @param {string} fieldName — human-readable name for the error message.
 * @returns {string|null} error string or null when valid.
 */
function validateNumericRange(value, min, max, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  if (Number.isNaN(num)) {
    return `${fieldName} must be a valid number`;
  }
  if (num < min || num > max) {
    return `${fieldName} must be between ${min} and ${max}`;
  }
  return null;
}

/**
 * Validate that a string's length does not exceed max.
 * @param {*} value
 * @param {number} max
 * @param {string} fieldName
 * @returns {string|null} error string or null when valid.
 */
function validateStringLength(value, max, fieldName) {
  if (value === undefined || value === null) return null;
  const str = String(value);
  if (str.length > max) {
    return `${fieldName} must be at most ${max} characters`;
  }
  return null;
}

/**
 * Validate that a value is one of the allowed values.
 * @param {*} value
 * @param {Array} allowedValues
 * @param {string} fieldName
 * @returns {string|null} error string or null when valid.
 */
function validateEnum(value, allowedValues, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  if (!allowedValues.includes(value)) {
    return `${fieldName} must be one of: ${allowedValues.join(', ')}`;
  }
  return null;
}

/**
 * Validate that a date's year falls within [minYear, maxYear].
 * @param {string|Date} date
 * @param {number} minYear
 * @param {number} maxYear
 * @param {string} fieldName
 * @returns {string|null} error string or null when valid.
 */
function validateDateRange(date, minYear, maxYear, fieldName) {
  if (date === undefined || date === null || date === '') return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    return `${fieldName} must be a valid date`;
  }
  const year = d.getFullYear();
  if (year < minYear || year > maxYear) {
    return `${fieldName} year must be between ${minYear} and ${maxYear}`;
  }
  return null;
}

/**
 * Validate that a date is not in the past.
 * @param {string|Date} date
 * @param {string} fieldName
 * @returns {string|null} error string or null when valid (or absent).
 */
function validateFutureDate(date, fieldName) {
  if (date === undefined || date === null || date === '') return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    return `${fieldName} must be a valid date`;
  }
  // Compare date-only (ignore time) so "today" is always valid.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const input = new Date(d);
  input.setHours(0, 0, 0, 0);
  if (input < today) {
    return `${fieldName} must be today or in the future`;
  }
  return null;
}

/**
 * Validate a file mimetype against an allowed list.
 * @param {string} mimetype
 * @param {string[]} allowedTypes
 * @param {string} fieldName
 * @returns {string|null} error string or null when valid.
 */
function validateFileType(mimetype, allowedTypes, fieldName) {
  if (!mimetype) {
    return `${fieldName} is missing a file type`;
  }
  if (!allowedTypes.includes(mimetype)) {
    return `${fieldName} type '${mimetype}' is not allowed`;
  }
  return null;
}

/**
 * Validate HH:MM time format (24-hour or 12-hour with AM/PM).
 * @param {string} value
 * @param {string} fieldName
 * @returns {string|null} error string or null when valid (or absent).
 */
function validateTimeFormat(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const str = String(value).trim();
  if (TIME_24H_RE.test(str) || TIME_12H_RE.test(str)) return null;
  return `${fieldName} must be in HH:MM or HH:MM AM/PM format`;
}

/**
 * Sanitize a raw error into a user-friendly message, hiding stack traces
 * and internal details. Falls back to a generic message for unknown errors.
 * @param {Error|string} err
 * @returns {string}
 */
function sanitizeError(err) {
  if (!err) return 'An unexpected error occurred';
  const raw = typeof err === 'string' ? err : (err.message || String(err));

  // Hide stack traces / file paths entirely.
  if (/at\s.+:\d+:\d+/.test(raw) || raw.includes('\n')) {
    return 'An unexpected error occurred';
  }

  // Map common database / ORM errors to friendly text.
  const lower = raw.toLowerCase();
  if (lower.includes('enum') && lower.includes('invalid input parameter')) {
    return 'One of the provided values is not allowed';
  }
  if (lower.includes('notnull') || lower.includes('not null')) {
    return 'A required field is missing';
  }
  if (lower.includes('unique') || lower.includes('duplicate key')) {
    return 'A record with these details already exists';
  }
  if (lower.includes('foreign key') || lower.includes('violates foreign key')) {
    return 'A referenced record could not be found';
  }
  if (lower.includes('econnrefused') || lower.includes('connect etimedout')) {
    return 'A required service is temporarily unavailable';
  }
  if (lower.includes('jwt') || lower.includes('token')) {
    return 'Authentication error — please sign in again';
  }

  // Truncate very long messages to avoid leaking internals.
  if (raw.length > 300) {
    return 'An unexpected error occurred';
  }

  return raw;
}

module.exports = {
  validateEmail,
  validatePhone,
  validateNumericRange,
  validateStringLength,
  validateEnum,
  validateDateRange,
  validateFutureDate,
  validateFileType,
  validateTimeFormat,
  sanitizeError,
  // Expose regexes for direct use if needed
  EMAIL_RE,
  PHONE_RE,
  TIME_24H_RE,
  TIME_12H_RE,
};
