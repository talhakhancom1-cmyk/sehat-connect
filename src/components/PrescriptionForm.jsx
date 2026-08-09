import React, { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

// Doctor creates a new prescription. `patients` is a de-duplicated list of
// { patient_id, patient_name } derived from the doctor's appointments.
export default function PrescriptionForm({ patients, doctor, onClose, onCreated }) {
  const [patientId, setPatientId] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [meds, setMeds] = useState([{ name: '', dosage: '', frequency: '', duration: '', instructions: '' }]);
  const [saving, setSaving] = useState(false);

  const updateMed = (i, field, value) => setMeds(m => m.map((mm, idx) => idx === i ? { ...mm, [field]: value } : mm));
  const addMed = () => setMeds(m => [...m, { name: '', dosage: '', frequency: '', duration: '', instructions: '' }]);
  const removeMed = (i) => setMeds(m => m.filter((_, idx) => idx !== i));

  const canSave = patientId && meds.some(m => m.name) && !saving;

  const handleSubmit = async () => {
    if (!canSave) return;
    setSaving(true);
    await onCreated({
      patient_id: patientId,
      patient_name: patients.find(p => p.patient_id === patientId)?.patient_name || '',
      doctor_id: doctor.id,
      doctor_name: doctor.full_name,
      doctor_specialty: doctor.specialty,
      diagnosis,
      notes,
      follow_up: followUp || undefined,
      date: new Date().toISOString().slice(0, 10),
      status: 'active',
      is_signed: false,
      medications: meds.filter(m => m.name),
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto scrollbar-thin animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border p-4 flex items-center justify-between">
          <h3 className="font-bold">New Prescription</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary active:scale-95 transition-all"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <Label className="text-xs">Patient</Label>
            <select value={patientId} onChange={e => setPatientId(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-xl border border-input bg-card text-sm">
              <option value="">Select patient…</option>
              {patients.map(p => <option key={p.patient_id} value={p.patient_id}>{p.patient_name}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">Diagnosis</Label>
            <Input value={diagnosis} onChange={e => setDiagnosis(e.target.value)} placeholder="Primary diagnosis" className="mt-1" />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Medications</Label>
              <button onClick={addMed} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><Plus className="w-3 h-3" /> Add</button>
            </div>
            <div className="space-y-3 mt-2">
              {meds.map((m, i) => (
                <div key={i} className="rounded-xl border border-border p-3 space-y-2 relative">
                  {meds.length > 1 && (
                    <button onClick={() => removeMed(i)} className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                  <Input value={m.name} onChange={e => updateMed(i, 'name', e.target.value)} placeholder="Medication name" className="text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={m.dosage} onChange={e => updateMed(i, 'dosage', e.target.value)} placeholder="Dosage (e.g. 500mg)" className="text-sm" />
                    <Input value={m.frequency} onChange={e => updateMed(i, 'frequency', e.target.value)} placeholder="Frequency (e.g. 2x daily)" className="text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={m.duration} onChange={e => updateMed(i, 'duration', e.target.value)} placeholder="Duration (e.g. 7 days)" className="text-sm" />
                    <Input value={m.instructions} onChange={e => updateMed(i, 'instructions', e.target.value)} placeholder="Instructions (optional)" className="text-sm" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes for the patient" className="mt-1" rows={2} />
          </div>
          <div>
            <Label className="text-xs">Follow up</Label>
            <Input value={followUp} onChange={e => setFollowUp(e.target.value)} placeholder="e.g. Review in 1 week" className="mt-1" />
          </div>
        </div>
        <div className="sticky bottom-0 bg-card border-t border-border p-4 flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSave} className="flex-1">{saving ? 'Saving…' : 'Save prescription'}</Button>
        </div>
      </div>
    </div>
  );
}