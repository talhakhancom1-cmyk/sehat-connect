// Frontend validation helpers — mirror the backend validation in backend/lib/validate.js
// Returns error string on failure, null on success.

export function validateEmail(email) {
  if (!email) return null;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email) ? null : 'Please enter a valid email address';
}

export function validatePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length < 7 || digits.length > 15) return 'Phone number must have 7-15 digits';
  if (/[a-zA-Z]/.test(phone)) return 'Phone number cannot contain letters';
  return null;
}

export function validatePassword(password) {
  if (!password) return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[a-zA-Z]/.test(password)) return 'Password must contain at least one letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  return null;
}

export function validateRequired(value, fieldName) {
  return (!value || (typeof value === 'string' && !value.trim())) ? `${fieldName} is required` : null;
}

export function validateLength(value, min, max, fieldName) {
  if (!value) return null;
  if (value.length < min) return `${fieldName} must be at least ${min} characters`;
  if (value.length > max) return `${fieldName} must be at most ${max} characters`;
  return null;
}

export function validateNumericRange(value, min, max, fieldName) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (isNaN(num)) return `${fieldName} must be a number`;
  if (num < min) return `${fieldName} must be at least ${min}`;
  if (num > max) return `${fieldName} must be at most ${max}`;
  return null;
}

export function validateFutureDate(dateStr, fieldName) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return `${fieldName} is not a valid date`;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) return `${fieldName} cannot be in the past`;
  return null;
}

export function validateDateOfBirth(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Date of birth is not a valid date';
  const year = date.getFullYear();
  if (year < 1900) return 'Date of birth year cannot be before 1900';
  const today = new Date();
  if (date > today) return 'Date of birth cannot be in the future';
  return null;
}
