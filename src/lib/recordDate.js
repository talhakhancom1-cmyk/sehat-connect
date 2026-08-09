// Formats a record's date according to its date_precision so approximate dates
// are never rendered as exact.
export function formatRecordDate(record) {
  if (!record?.date) return '—';
  const d = new Date(record.date);
  if (Number.isNaN(d.getTime())) return record.date;
  const precision = record.date_precision || 'day';
  if (precision === 'year') return d.toLocaleDateString('en-US', { year: 'numeric' });
  if (precision === 'month') return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function monthKey(dateStr) {
  if (!dateStr) return 'Unknown';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}