import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Pill, Check, X, Bell, Clock } from 'lucide-react';

// Doctor-facing adherence summary for a single patient. Calls the custom
// GET /api/dose-events/adherence endpoint, which enforces consent server-side
// (returns 403 when no active consent exists).
export default function MedicationAdherence({ patientId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (patientId) load();
    else setLoading(false);
  }, [patientId]);

  const load = async () => {
    setLoading(true);
    setError('');
    setData(null);
    try {
      const resp = await fetch(`${base44.apiUrl}/dose-events/adherence?patient_id=${patientId}`, {
        headers: base44.headers(),
      });
      if (resp.status === 403) {
        setError('No active consent from this patient');
        return;
      }
      if (!resp.ok) throw new Error('Failed to load adherence');
      const result = await resp.json();
      setData(result);
    } catch (e) {
      setError(e.message || 'Failed to load adherence');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="h-20 rounded-xl bg-card border border-border animate-pulse" />;
  if (error) return <p className="text-xs text-muted-foreground">{error}</p>;
  if (!data) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Pill className="w-4 h-4 text-primary" />
        <h4 className="text-sm font-semibold">Medication Adherence (7 days)</h4>
      </div>
      {data.rate !== null && data.rate !== undefined ? (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-primary">{data.rate}%</span>
            <span className="text-xs text-muted-foreground">{data.taken}/{data.total} doses taken</span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${data.rate}%` }} />
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="flex items-center gap-1 text-green-600"><Check className="w-3 h-3" /> {data.taken} taken</span>
            <span className="flex items-center gap-1 text-yellow-600"><X className="w-3 h-3" /> {data.skipped} skipped</span>
            <span className="flex items-center gap-1 text-red-600"><Bell className="w-3 h-3" /> {data.missed} missed</span>
            <span className="flex items-center gap-1 text-muted-foreground"><Clock className="w-3 h-3" /> {data.pending} pending</span>
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">No dose data recorded yet.</p>
      )}
    </div>
  );
}
