import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}


export const isIframe = window.self !== window.top;

/**
 * Format an appointment_date (which may arrive as an ISO timestamp like
 * "2025-01-15T00:00:00.000Z" or a plain "2025-01-15" string) into a
 * human-friendly date string in the user's local timezone.
 *
 * We treat the date as a calendar date (no time component matters since
 * the actual time is stored separately in `time_slot`). Parsing with
 * `new Date()` would shift the date in non-UTC timezones, so we split
 * on "T" and build the date from the Y/M/D parts directly.
 */
export function formatAppointmentDate(value) {
  if (!value) return '—';
  const str = String(value);
  // Extract just the YYYY-MM-DD part (before any "T" time component)
  const datePart = str.split('T')[0];
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return str;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Append the JWT auth token to a file download URL so the browser can
 * fetch it from <img>/<a> tags (which can't send Authorization headers).
 * If the URL already has a valid token param, it's returned as-is.
 */
export function authFileUrl(url) {
  if (!url) return url;
  // Only modify relative /api/files/ URLs or same-origin file URLs
  if (!url.includes('/api/files/') && !url.includes('/files/')) return url;
  const token = localStorage.getItem('ehc_token');
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  // If URL already has auth= param, don't add again
  if (url.includes('auth=')) return url;
  return `${url}${sep}auth=${encodeURIComponent(token)}`;
}
