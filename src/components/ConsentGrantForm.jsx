import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { recordAudit } from '@/lib/audit';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { X, ShieldCheck, Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  'Blood Report', 'X-Ray', 'MRI', 'CT Scan', 'ECG', 'Ultrasound', 'Vaccination',
  'Medical Certificate', 'Operation Report', 'Discharge Summary', 'Insurance',
  'Prescription', 'Mental Health', 'Reproductive Health', 'Infectious Disease', 'Genetics',
];

const PERMISSIONS = ['read', 'download', 'print', 'share'];
const EXPIRY_PRESETS = [
  { label: '24 hours', hours: 24 },
  { label: '7 days', hours: 24 * 7 },
  { label: '30 days', hours: 24 * 30 },
  { label: 'Custom', hours: null },
];

export default function ConsentGrantForm({ onClose, onGranted }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [doctors, setDoctors] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [query, setQuery] = useState('');
  const [doctorId, setDoctorId] = useState(null);
  const [categories, setCategories] = useState(['Blood Report']);
  const [permissions, setPermissions] = useState(['read']);
  const [expiryPreset, setExpiryPreset] = useState(24);
  const [customExpiry, setCustomExpiry] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.entities.Doctor.filter({ verification_status: 'verified' }, '-rating', 200)
      .then(setDoctors).catch(() => setDoctors([])).finally(() => setLoadingDocs(false));
  }, []);

  const selectedDoctor = doctors.find(d => d.id === doctorId);
  const filtered = doctors.filter(d => {
    if (!query) return true;
    const q = query.toLowerCase();
    return d.full_name?.toLowerCase().includes(q) || d.specialty?.toLowerCase().includes(q) || d.city?.toLowerCase().includes(q);
  });

  const toggle = (arr, setArr, val) => setArr(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);

  const computeExpiry = () => {
    if (expiryPreset == null) {
      return customExpiry ? new Date(customExpiry).toISOString() : null;
    }
    return new Date(Date.now() + expiryPreset * 3600 * 1000).toISOString();
  };

  const handleGrant = async () => {
    if (!selectedDoctor) { toast({ title: 'Select a doctor', variant: 'destructive' }); return; }
    if (!categories.length) { toast({ title: 'Pick at least one category', variant: 'destructive' }); return; }
    if (!permissions.length) { toast({ title: 'Pick at least one permission', variant: 'destructive' }); return; }
    if (expiryPreset == null && !customExpiry) { toast({ title: 'Set a custom expiry', variant: 'destructive' }); return; }

    setSaving(true);
    try {
      const consent = await base44.entities.Consent.create({
        patient_id: user.id,
        patient_name: user.full_name || 'Patient',
        recipient_user_id: selectedDoctor.user_id || selectedDoctor.id,
        recipient_name: selectedDoctor.full_name,
        categories,
        permission_set: permissions,
        date_range_start: dateRange.start || null,
        date_range_end: dateRange.end || null,
        granted_at: new Date().toISOString(),
        expires_at: computeExpiry(),
        status: 'active',
      });
      await recordAudit({
        action: 'consent_grant',
        target_type: 'Consent',
        target_id: consent.id,
        patient_id: user.id,
        detail: `Granted ${categories.length} categor${categories.length > 1 ? 'ies' : 'y'} to ${selectedDoctor.full_name}`,
      });
      toast({ title: 'Access granted', description: `${selectedDoctor.full_name} can now view the selected records.` });
      onGranted?.();
      onClose?.();
    } catch (err) {
      toast({ title: 'Grant failed', description: err.message || 'Could not grant access', variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto scrollbar-thin animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h3 className="font-bold">Grant record access</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Step 1: doctor */}
          <div>
            <Label className="text-xs">Choose a doctor</Label>
            <div className="flex items-center gap-2 px-3 py-2 mt-1 rounded-lg border border-border">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, specialty, city…" className="bg-transparent text-sm outline-none flex-1" />
            </div>
            <div className="mt-2 max-h-44 overflow-y-auto scrollbar-thin space-y-1.5">
              {loadingDocs ? (
                <p className="text-xs text-muted-foreground p-2">Loading doctors…</p>
              ) : filtered.length ? filtered.slice(0, 20).map(d => (
                <button key={d.id} onClick={() => setDoctorId(d.id)}
                  className={cn('w-full text-left rounded-lg border p-2.5 flex items-center gap-3 transition-all',
                    doctorId === d.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30')}>
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {d.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{d.full_name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{d.specialty}{d.city ? ` · ${d.city}` : ''}</p>
                  </div>
                  {doctorId === d.id && <ShieldCheck className="w-4 h-4 text-primary shrink-0" />}
                </button>
              )) : <p className="text-xs text-muted-foreground p-2">No verified doctors found.</p>}
            </div>
          </div>

          {/* Step 2: categories */}
          <div>
            <Label className="text-xs">Record categories</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => toggle(categories, setCategories, c)}
                  className={cn('px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all',
                    categories.includes(c) ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:bg-secondary')}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Step 3: permissions */}
          <div>
            <Label className="text-xs">Permissions</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {PERMISSIONS.map(p => (
                <button key={p} onClick={() => toggle(permissions, setPermissions, p)}
                  className={cn('px-2.5 py-1 rounded-full text-[11px] font-medium border capitalize transition-all',
                    permissions.includes(p) ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:bg-secondary')}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Step 4: expiry */}
          <div>
            <Label className="text-xs">Access expires</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {EXPIRY_PRESETS.map(p => (
                <button key={p.label} onClick={() => setExpiryPreset(p.hours)}
                  className={cn('px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all',
                    expiryPreset === p.hours ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:bg-secondary')}>
                  {p.label}
                </button>
              ))}
            </div>
            {expiryPreset == null && (
              <Input type="datetime-local" value={customExpiry} onChange={e => setCustomExpiry(e.target.value)} className="mt-2" />
            )}
          </div>

          {/* Date range (optional) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Record date range from (optional)</Label>
              <Input type="date" value={dateRange.start} onChange={e => setDateRange(r => ({ ...r, start: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">to (optional)</Label>
              <Input type="date" value={dateRange.end} onChange={e => setDateRange(r => ({ ...r, end: e.target.value }))} className="mt-1" />
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-card border-t border-border p-4 flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleGrant} disabled={saving} className="flex-1">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            {saving ? 'Granting…' : 'Grant access'}
          </Button>
        </div>
      </div>
    </div>
  );
}