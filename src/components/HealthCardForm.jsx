import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toUserError } from '@/lib/userError';

const cardTypes = [
  { value: 'emergency', label: 'Emergency' },
  { value: 'medication', label: 'Medication' },
  { value: 'allergy', label: 'Allergy' },
  { value: 'vaccination', label: 'Vaccination' },
  { value: 'chronic', label: 'Chronic Condition' },
  { value: 'maternal', label: 'Maternal' },
  { value: 'child', label: 'Child' },
];

const authLevels = [
  { value: 'none', label: 'None' },
  { value: 'pin', label: 'PIN' },
  { value: 'password', label: 'Password' },
  { value: 'biometric', label: 'Biometric' },
  { value: 'otp', label: 'OTP' },
];

export default function HealthCardForm({ patientId, patientName, onSave, onClose }) {
  const [form, setForm] = useState({
    card_type: 'emergency',
    title: '',
    requires_auth: 'pin',
    lock_screen_accessible: false,
    qr_enabled: true,
    allow_download: false,
    allow_print: false,
    expires_at: '',
  });
  const [rows, setRows] = useState([{ key: '', value: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    setError('');
    const dataSnapshot = {};
    rows.forEach((r) => {
      if (r.key.trim()) dataSnapshot[r.key.trim()] = r.value;
    });
    try {
      await onSave({
        patient_id: patientId,
        patient_name: patientName,
        card_type: form.card_type,
        title: form.title.trim(),
        categories: [form.card_type],
        data_snapshot: dataSnapshot,
        requires_auth: form.requires_auth,
        lock_screen_accessible: form.lock_screen_accessible,
        qr_enabled: form.qr_enabled,
        allow_download: form.allow_download,
        allow_print: form.allow_print,
        is_online: true,
        is_offline: false,
        status: 'active',
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : undefined,
      });
    } catch (e) {
      console.error(e);
      setError(toUserError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      <div className="bg-card w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto scrollbar-thin">
        <div className="sticky top-0 bg-card flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-bold text-base">New Health Card</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <Label className="text-xs">Card type</Label>
            <select value={form.card_type} onChange={(e) => set('card_type', e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-input bg-background px-3 text-sm">
              {cardTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">Title</Label>
            <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Emergency info" className="mt-1" />
          </div>

          <div>
            <Label className="text-xs">Card contents</Label>
            <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">Key-value pairs shown on the card.</p>
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={r.key} onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} placeholder="Field (e.g. Blood group)" className="flex-1" />
                  <Input value={r.value} onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} placeholder="Value (e.g. O+)" className="flex-1" />
                  <button onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive p-1.5"><X className="w-4 h-4" /></button>
                </div>
              ))}
              <button onClick={() => setRows((rs) => [...rs, { key: '', value: '' }])} className="text-xs text-primary font-medium hover:underline">+ Add field</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Requires auth</Label>
              <select value={form.requires_auth} onChange={(e) => set('requires_auth', e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-input bg-background px-3 text-sm">
                {authLevels.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Expires (optional)</Label>
              <Input type="datetime-local" value={form.expires_at} onChange={(e) => set('expires_at', e.target.value)} className="mt-1" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.lock_screen_accessible} onChange={(e) => set('lock_screen_accessible', e.target.checked)} /> Lock screen</label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.qr_enabled} onChange={(e) => set('qr_enabled', e.target.checked)} /> QR</label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.allow_download} onChange={(e) => set('allow_download', e.target.checked)} /> Download</label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.allow_print} onChange={(e) => set('allow_print', e.target.checked)} /> Print</label>
          </div>
        </div>
        {error && (
          <div className="px-5 py-2 text-xs text-red-600 bg-red-50 border-t border-red-100">{error}</div>
        )}

        <div className="sticky bottom-0 bg-card flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !form.title.trim()}>{saving ? 'Saving…' : 'Create card'}</Button>
        </div>
      </div>
    </div>
  );
}