import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { toUserError } from '@/lib/userError';
import { Bell, Save } from 'lucide-react';

const DEFAULT_TIMES = { morning: '08:00', afternoon: '14:00', evening: '20:00' };

// Patient-facing panel to configure global medication reminder preferences.
// Backed by the ReminderPreference entity (one row per patient).
export default function ReminderSettings() {
  const { toast } = useToast();
  const [pref, setPref] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [times, setTimes] = useState({ ...DEFAULT_TIMES });

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const data = await base44.entities.ReminderPreference.filter({}, '-created_at', 1);
      const p = data[0] || { reminders_enabled: true, reminder_times: { ...DEFAULT_TIMES } };
      setPref(p);
      setEnabled(p.reminders_enabled !== false);
      setTimes({ ...DEFAULT_TIMES, ...(p.reminder_times || {}) });
    } catch {
      /* first time — keep defaults */
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const body = { reminders_enabled: enabled, reminder_times: times };
      if (pref?.id) {
        await base44.entities.ReminderPreference.update(pref.id, body);
      } else {
        await base44.entities.ReminderPreference.create(body);
      }
      toast({ title: 'Reminder settings saved' });
      load();
    } catch (e) {
      toast({ title: 'Could not save settings', description: toUserError(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-24 rounded-2xl bg-card border border-border animate-pulse" />;

  const timeFields = [
    { key: 'morning', label: 'Morning', icon: '☀️' },
    { key: 'afternoon', label: 'Afternoon', icon: '🌤️' },
    { key: 'evening', label: 'Evening', icon: '🌙' },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Reminder Settings</h3>
        </div>
        <button
          onClick={() => setEnabled(!enabled)}
          aria-label="Toggle reminders"
          className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-secondary'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : ''}`} />
        </button>
      </div>
      {enabled && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Set default times for your medication reminders (24h format)</p>
          {timeFields.map(f => (
            <div key={f.key} className="flex items-center justify-between">
              <span className="text-sm">{f.icon} {f.label}</span>
              <input
                type="time"
                value={times[f.key] || ''}
                onChange={e => setTimes({ ...times, [f.key]: e.target.value })}
                className="px-2 py-1 rounded-lg border border-input bg-secondary/50 text-sm"
              />
            </div>
          ))}
        </div>
      )}
      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
      >
        <Save className="w-3.5 h-3.5" />
        {saving ? 'Saving…' : 'Save Settings'}
      </button>
    </div>
  );
}
