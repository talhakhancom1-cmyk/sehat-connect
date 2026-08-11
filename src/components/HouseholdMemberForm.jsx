import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toUserError } from '@/lib/userError';

const roles = [
  { value: 'member', label: 'Member' },
  { value: 'co_head', label: 'Co-head' },
  { value: 'dependent_minor', label: 'Dependent (minor)' },
];

export default function HouseholdMemberForm({ householdId, householdName, addedBy, onAdd, onClose }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('member');
  const [relationship, setRelationship] = useState('');
  const [isMinor, setIsMinor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    if (!email.trim() && !name.trim()) return;
    setSaving(true); setErr(null);
    try {
      await onAdd({ email: email.trim(), name: name.trim(), role, relationship, is_minor: isMinor || role === 'dependent_minor' });
    } catch (e) {
      setErr(toUserError(e, 'Could not add member'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="bg-card w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto scrollbar-thin">
        <div className="sticky top-0 bg-card flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-bold text-base">Add member</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {err && <p className="text-xs text-destructive bg-destructive/5 px-3 py-2 rounded-lg">{err}</p>}
          <div>
            <Label className="text-xs">Email (to invite)</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="member@example.com" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Display name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ayesha" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Role</Label>
              <select value={role} onChange={(e) => setRole(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-input bg-background px-3 text-sm">
                {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Relationship</Label>
              <Input value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="spouse / child" className="mt-1" />
            </div>
          </div>
          {role !== 'dependent_minor' && (
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={isMinor} onChange={(e) => setIsMinor(e.target.checked)} /> Is a minor</label>
          )}
        </div>
        <div className="sticky bottom-0 bg-card flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || (!email.trim() && !name.trim())}>{saving ? 'Adding…' : 'Add member'}</Button>
        </div>
      </div>
    </div>
  );
}