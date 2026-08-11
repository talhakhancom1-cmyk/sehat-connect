// Converts backend error messages to user-friendly text.
// Hides stack traces, technical details, and raw error dumps.
export function toUserError(err, fallback = 'Something went wrong. Please try again.') {
  if (!err) return fallback;
  // If it's a network error
  if (err.name === 'TypeError' && err.message?.includes('fetch')) {
    return 'Network error — please check your connection and try again.';
  }
  // Extract the message
  let msg = err.message || err.error || (typeof err === 'string' ? err : '');
  // If it's a response object with data
  if (err.response?.data?.error) msg = err.response.data.error;
  if (err.response?.data?.message) msg = err.response.data.message;
  // Hide technical details
  if (msg.includes('sequelize') || msg.includes('database') || msg.includes('SQL')) {
    return 'A server error occurred. Please try again.';
  }
  if (msg.includes('jwt') || msg.includes('token') || msg.includes('auth')) {
    return 'Your session may have expired. Please log in again.';
  }
  // Truncate very long messages
  if (msg.length > 200) msg = msg.substring(0, 200) + '...';
  return msg || fallback;
}
