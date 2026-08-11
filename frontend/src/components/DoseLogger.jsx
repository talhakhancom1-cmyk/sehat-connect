import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { recordAudit } from '@/lib/audit';
import { computeAdherence } from '@/lib/medication';
import { useToast } from '@/components/ui/use-toast';
import { toUserError } from '@/lib/userError';
import { Button } from '@/components/ui/button';
import { Check, X, Clock, Bell, BellOff, AlertCircle } from 'lucide-react';

const isToday = (iso) => {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
};

const formatTime = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Patient logs a dose against a MedicationPlan. Also shows adherence from
// already-recorded DoseEvents (passed in), today's upcoming (pending) doses,
// missed doses, and a per-medication reminders toggle.
export default function DoseLogger({ plan, doseEvents = [], onLogged }) {
  const { toast } = useToast();
  const [status, setStatus] = useState('taken');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [reminderOn, setReminderOn] = useState(plan?.reminders_enabled !== false);
  const [togglingReminder, setTogglingReminder] = useState(false);
  const [actioningId, setActioningId] = useState(null);

  const { rate, taken, total } = computeAdherence(doseEvents);

  // Today's pending doses (upcoming, not yet acted on).
  const todayPending = doseEvents
    .filter(d => d.status === 'pending' && isToday(d.taken_at))
    .sort((a, b) => new Date(a.taken_at) - new Date(b.taken_at));

  // Missed doses (status 'missed').
  const missedDoses = doseEvents.filter(d => d.status === 'missed');

  const log = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await base44.entities.DoseEvent.create({
        medication_plan_id: plan.id,
        prescription_id: plan.prescription_id,
        patient_id: plan.patient_id,
        patient_name: plan.patient_name,
        doctor_id: plan.doctor_id,
        taken_at: new Date().toISOString(),
        status,
        source: 'patient',
        notes: note || undefined,
      });
      await recordAudit({ action: 'dose_event_log', target_type: 'MedicationPlan', target_id: plan.id, patient_id: plan.patient_id, detail: `Dose ${status}` });
      setNote('');
      onLogged?.();
    } finally { setSaving(false); }
  };

  const toggleReminders = async () => {
    if (togglingReminder) return;
    setTogglingReminder(true);
    const next = !reminderOn;
    try {
      await fetch(`${base44.apiUrl}/medication-plans/${plan.id}/reminders`, {
        method: 'PUT',
        headers: base44.headers(),
        body: JSON.stringify({ reminders_enabled: next }),
      });
      setReminderOn(next);
      toast({ title: next ? 'Reminders on' : 'Reminders off', description: plan.medication_name });
    } catch (e) {
      toast({ title: 'Could not update reminders', description: toUserError(e), variant: 'destructive' });
    } finally {
      setTogglingReminder(false);
    }
  };

  // Mark a pending dose as taken or skipped via the status-specific endpoint.
  const markDose = async (dose, newStatus) => {
    if (actioningId) return;
    setActioningId(dose.id);
    try {
      const resp = await fetch(`${base44.apiUrl}/dose-events/${dose.id}/status`, {
        method: 'PUT',
        headers: base44.headers(),
        body: JSON.stringify({ status: newStatus }),
      });
      if (!resp.ok) throw new Error('Could not update dose');
      await recordAudit({ action: 'dose_event_update', target_type: 'DoseEvent', target_id: dose.id, patient_id: plan.patient_id, detail: `Dose ${newStatus}` });
      onLogged?.();
    } catch (e) {
      toast({ title: 'Could not update dose', description: toUserError(e), variant: 'destructive' });
    } finally {
      setActioningId(null);
    }
  };

  const statuses = [
    { key: 'taken', label: 'Taken', icon: Check },
    { key: 'skipped', label: 'Skipped', icon: X },
    { key: 'snoozed', label: 'Snooze', icon: Clock },
    { key: 'missed', label: 'Missed', icon: Bell },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{plan.medication_name}</p>
          <p className="text-xs text-muted-foreground">{plan.dosage} · {plan.frequency}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {rate !== null && (
            <div className="text-right">
              <p className="text-lg font-bold text-primary">{rate}%</p>
              <p className="text-[10px] text-muted-foreground">{taken}/{total} doses</p>
            </div>
          )}
          <button
            onClick={toggleReminders}
            disabled={togglingReminder}
            title={reminderOn ? 'Reminders on' : 'Reminders off'}
            className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${reminderOn ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}
          >
            {reminderOn ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Missed doses indicator */}
      {missedDoses.length > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-red-600 font-medium">
          <AlertCircle className="w-3 h-3" />
          {missedDoses.length} missed {missedDoses.length === 1 ? 'dose' : 'doses'}
        </div>
      )}

      {/* Today's upcoming doses */}
      {todayPending.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Today's doses</p>
          {todayPending.map(d => (
            <div key={d.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-secondary/40">
              <div className="flex items-center gap-1.5 text-xs">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span className="font-medium">{formatTime(d.taken_at)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => markDose(d, 'taken')}
                  disabled={actioningId === d.id}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  <Check className="w-3 h-3" /> Taken
                </button>
                <button
                  onClick={() => markDose(d, 'skipped')}
                  disabled={actioningId === d.id}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary text-muted-foreground text-[11px] font-medium hover:bg-secondary/80 disabled:opacity-50"
                >
                  <X className="w-3 h-3" /> Skip
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1.5">
        {statuses.map(s => {
          const Icon = s.icon;
          return (
            <button key={s.key} onClick={() => setStatus(s.key)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${status === s.key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}>
              <Icon className="w-3 h-3" /> {s.label}
            </button>
          );
        })}
      </div>

      <input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note"
        className="w-full px-3 py-2 rounded-lg border border-input bg-card text-sm" />

      <Button onClick={log} disabled={saving} className="w-full">
        {saving ? 'Logging…' : 'Log this dose'}
      </Button>
    </div>
  );
}
