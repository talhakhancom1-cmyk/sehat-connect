import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const scopes = [
  { value: 'booking', label: 'Book appointments', hint: 'Can book appointments on your behalf' },
  { value: 'payment', label: 'Make payments', hint: 'Can pay for appointments/services' },
  { value: 'record_view', label: 'View records', hint: 'Can view selected record categories' },
];

const recordCategories = [
  'Blood Report', 'X-Ray', 'MRI', 'CT Scan', 'ECG', 'Ultrasound', 'Vaccination',
  'Prescription', 'Operation Report', 'Discharge Summary', 'Insurance',
  'Mental Health', 'Reproductive Health', 'Infectious Disease', 'Genetics',
];

export default function DelegationForm({ members, onGrant, onClose }) {
  const [memberId, setMemberId] = useState('');
  const [scope, setScope] = useState('booking');
  const [cats, setCats] = useState([]);
  const [expiresHours, setExpiresHours] = useState(24);
  const [saving, setSaving] = useState(false);

  const toggleCat = (c) => setCats((cs) => cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]);

  const submit = async () => {
    if (!memberId) return;
    setSaving(true);
    await onGrant({ delegatee_user_id: memberId, scope, record_view_categories: scope === 'record_view' ? cats : [], expires_hours: Number(expiresHours) });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="bg-card w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto scrollbar-thin">
        <div className="sticky top-0 bg-card flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-bold text-base">Grant access</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <Label className="text-xs">Delegate to</Label>
            <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-input bg-background px-3 text-sm">
              <option value="">Select a member…</option>
              {members.map((m) => <option key={m.id} value={m.user_id}>{m.user_name || m.user_email || 'Member'}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">Scope</Label>
            <div className="mt-1 space-y-2">
              {scopes.map((s) => (
                <label key={s.value} className="flex items-start gap-2 p-2 rounded-xl border border-border cursor-pointer hover:bg-secondary/40">
                  <input type="radio" name="scope" checked={scope === s.value} onChange={() => setScope(s.value)} className="mt-1" />
                  <div>
                    <p className="text-sm font-medium">{s.label}</p>
                    <p className="text-[11px] text-muted-foreground">{s.hint}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          {scope === 'record_view' && (
            <div>
              <Label className="text-xs">Record categories</Label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {recordCategories.map((c) => (
                  <button key={c} onClick={() => toggleCat(c)} className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${cats.includes(c) ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border'}`}>{c}</button>
                ))}
              </div>
            </div>
          )}
          <div>
            <Label className="text-xs">Expires in (hours)</Label>
            <input type="number" min={1} value={expiresHours} onChange={(e) => setExpiresHours(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-input bg-background px-3 text-sm" />
          </div>
        </div>
        <div className="sticky bottom-0 bg-card flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !memberId || (scope === 'record_view' && cats.length === 0)}>{saving ? 'Granting…' : 'Grant access'}</Button>
        </div>
      </div>
    </div>
  );
}