import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { recordAudit } from '@/lib/audit';
import { transitionAllowed } from '@/lib/appointmentStateMachine';
import { X, Stethoscope } from 'lucide-react';
import { formatAppointmentDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toUserError } from '@/lib/userError';
import { validateRequired, validateLength } from '@/lib/validate';

// Converts any date-like value into a valid ISO 8601 string for the backend.
// Returns null if the value cannot be parsed, so the caller can fall back.
function toValidIsoDate(value) {
  if (!value && value !== 0) return null;
  // Already a valid ISO string or date-only "YYYY-MM-DD" — validate via Date.
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

// Doctor writes the clinical encounter for an appointment. On save, the
// appointment is transitioned to `completed` (if not already) and the encounter
// is created; any prescriptions already issued for this appointment are linked.
export default function EncounterForm({ appointment, doctor, onClose, onSaved }) {
  const [form, setForm] = useState({
    chief_complaint: appointment?.symptoms || appointment?.reason || '',
    examination: '',
    diagnosis: '',
    differential_diagnosis: '',
    clinical_notes: '',
    advice: '',
    follow_up: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (saving) return;
    setError('');

    // Frontend validation — mirror backend rules.
    const complaintErr = validateRequired(form.chief_complaint, 'Chief complaint') || validateLength(form.chief_complaint, 0, 500, 'Chief complaint');
    if (complaintErr) { setError(complaintErr); return; }
    const diagnosisErr = validateLength(form.diagnosis, 0, 2000, 'Diagnosis');
    if (diagnosisErr) { setError(diagnosisErr); return; }

    // Validate and normalize the encounter date before anything else.
    // appointment.appointment_date may be an ISO string, a "YYYY-MM-DD" string,
    // a Date object, or (in edge cases) an unparseable value like "Invalid date".
    // We always send a valid ISO 8601 timestamp to the backend.
    const encounterDate = toValidIsoDate(appointment?.appointment_date) || new Date().toISOString();

    setSaving(true);
    try {
      // Transition appointment to completed first (validates via state machine).
      if (appointment.status !== 'completed') {
        const guard = transitionAllowed(appointment, 'completed');
        if (!guard.ok) { setError(guard.reason); setSaving(false); return; }
        await base44.entities.Appointment.update(appointment.id, { status: 'completed' });
      }

      const encounter = await base44.entities.Encounter.create({
        appointment_id: appointment.id,
        doctor_id: doctor.id,
        doctor_name: doctor.full_name,
        patient_id: appointment.patient_id,
        patient_name: appointment.patient_name,
        patient_age: appointment.patient_age || null,
        patient_gender: appointment.patient_gender || null,
        encounter_date: encounterDate,
        encounter_type: appointment.type || 'video',
        ...form,
        status: 'completed',
      });

      // Link any prescriptions already issued for this appointment.
      const prescs = await base44.entities.Prescription.filter({ appointment_id: appointment.id });
      if (prescs.length) {
        await Promise.all(prescs.map(p => base44.entities.Prescription.update(p.id, { encounter_id: encounter.id })));
      }

      await recordAudit({
        action: 'encounter_create',
        target_type: 'Encounter',
        target_id: encounter.id,
        patient_id: appointment.patient_id,
        detail: `Encounter for ${encounterDate} ${appointment.time_slot}`,
      });

      onSaved?.();
      onClose?.();
    } catch (err) {
      console.error('Encounter save failed:', err);
      // Surface a clear error in the form instead of letting the raw DB error propagate.
      const msg = toUserError(err, 'Could not save the encounter. Please try again.');
      setError(msg);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto scrollbar-thin animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-primary" />
            <div>
              <h3 className="font-bold">Clinical encounter</h3>
              <p className="text-[11px] text-muted-foreground">{appointment.patient_name} · {formatAppointmentDate(appointment.appointment_date)} {appointment.time_slot}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-4 space-y-3">
          <Field label="Chief complaint"><Input value={form.chief_complaint} onChange={e => set('chief_complaint', e.target.value)} /></Field>
          <Field label="Examination"><Textarea rows={2} value={form.examination} onChange={e => set('examination', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Diagnosis"><Input value={form.diagnosis} onChange={e => set('diagnosis', e.target.value)} /></Field>
            <Field label="Differential"><Input value={form.differential_diagnosis} onChange={e => set('differential_diagnosis', e.target.value)} /></Field>
          </div>
          <Field label="Clinical notes"><Textarea rows={3} value={form.clinical_notes} onChange={e => set('clinical_notes', e.target.value)} /></Field>
          <Field label="Advice"><Textarea rows={2} value={form.advice} onChange={e => set('advice', e.target.value)} /></Field>
          <Field label="Follow up"><Input value={form.follow_up} onChange={e => set('follow_up', e.target.value)} placeholder="e.g. Review in 1 week" /></Field>
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
        <div className="sticky bottom-0 bg-card border-t border-border p-4 flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">{saving ? 'Saving…' : 'Save encounter'}</Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}