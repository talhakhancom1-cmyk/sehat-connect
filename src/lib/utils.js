import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}


export const isIframe = window.self !== window.top;

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
