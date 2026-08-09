import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { recordAudit } from '@/lib/audit';
import { computeAdherence } from '@/lib/medication';
import { Button } from '@/components/ui/button';
import { Check, X, Clock, Bell } from 'lucide-react';

// Patient logs a dose against a MedicationPlan. Also shows adherence from
// already-recorded DoseEvents (passed in).
export default function DoseLogger({ plan, doseEvents, onLogged }) {
  const [status, setStatus] = useState('taken');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const { rate, taken, total } = computeAdherence(doseEvents);

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

  const statuses = [
    { key: 'taken', label: 'Taken', icon: Check },
    { key: 'skipped', label: 'Skipped', icon: X },
    { key: 'snoozed', label: 'Snooze', icon: Clock },
    { key: 'missed', label: 'Missed', icon: Bell },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">{plan.medication_name}</p>
          <p className="text-xs text-muted-foreground">{plan.dosage} · {plan.frequency}</p>
        </div>
        {rate !== null && (
          <div className="text-right">
            <p className="text-lg font-bold text-primary">{rate}%</p>
            <p className="text-[10px] text-muted-foreground">{taken}/{total} doses</p>
          </div>
        )}
      </div>

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