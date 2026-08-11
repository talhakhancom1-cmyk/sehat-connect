import React, { useEffect, useState } from 'react';
import { X, Loader2, Users, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { useNavigate } from 'react-router-dom';
import {
  getActiveHousehold, getHouseholdMembers, grantDelegation,
  RECORD_CATEGORIES, HEALTH_CARD_TYPES,
} from '@/lib/familyAccess';
import { cn } from '@/lib/utils';
import { toUserError } from '@/lib/userError';

export default function FamilyShareModal({ scope, onClose, onGranted }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isRecord = scope === 'record_view';

  const [household, setHousehold] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [memberId, setMemberId] = useState('');
  const [selected, setSelected] = useState([]);
  const [expiresHours, setExpiresHours] = useState(24);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const h = await getActiveHousehold(user.id);
        setHousehold(h);
        if (h) setMembers(await getHouseholdMembers(h.id, user.id));
      } catch { setHousehold(null); }
      finally { setLoading(false); }
    })();
  }, [user?.id]);

  const options = isRecord ? RECORD_CATEGORIES : HEALTH_CARD_TYPES.map((t) => t.value);
  const labelFor = (v) => (isRecord ? v : (HEALTH_CARD_TYPES.find((t) => t.value === v)?.label || v));

  const toggle = (v) => setSelected((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));

  const submit = async () => {
    if (!memberId || selected.length === 0) return;
    setSaving(true);
    try {
      const delegatee = members.find((m) => m.user_id === memberId);
      await grantDelegation({
        household,
        user,
        delegatee: { user_id: memberId, user_name: delegatee?.user_name || '' },
        scope,
        record_view_categories: isRecord ? selected : [],
        health_card_types: isRecord ? [] : selected,
        expiresHours: Number(expiresHours),
      });
      toast({ title: 'Access granted', description: `${delegatee?.user_name || 'Member'} can now view your ${isRecord ? 'records' : 'health cards'}.` });
      onGranted?.();
      onClose();
    } catch (e) {
      toast({ title: 'Could not grant access', description: toUserError(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="bg-card w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto scrollbar-thin">
        <div className="sticky top-0 bg-card flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-base">Share with family</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !household ? (
            <div className="text-center py-6 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <Users className="w-7 h-7 text-primary" />
              </div>
              <p className="text-sm font-semibold">Set up your household first</p>
              <p className="text-xs text-muted-foreground px-4">
                Create a household and add family members before sharing access to your {isRecord ? 'medical records' : 'health cards'}.
              </p>
              <Button onClick={() => navigate('/household')} className="mt-2">Go to Household</Button>
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-6 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <Users className="w-7 h-7 text-primary" />
              </div>
              <p className="text-sm font-semibold">No family members yet</p>
              <p className="text-xs text-muted-foreground px-4">Add a member to your household, then come back to share access.</p>
              <Button onClick={() => navigate('/household')} className="mt-2">Add a member</Button>
            </div>
          ) : (
            <>
              <div>
                <Label className="text-xs">Share with</Label>
                <select
                  value={memberId}
                  onChange={(e) => setMemberId(e.target.value)}
                  className="mt-1 w-full h-10 rounded-xl border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select a family member…</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.user_id}>{m.user_name || m.user_email || 'Member'}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs">{isRecord ? 'Record categories' : 'Health card types'}</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">Only the selected {isRecord ? 'categories' : 'card types'} will be visible to them.</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => toggle(opt)}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all',
                        selected.includes(opt)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card text-muted-foreground border-border'
                      )}
                    >
                      {labelFor(opt)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs">Expires in (hours)</Label>
                <input
                  type="number"
                  min={1}
                  value={expiresHours}
                  onChange={(e) => setExpiresHours(e.target.value)}
                  className="mt-1 w-full h-10 rounded-xl border border-input bg-background px-3 text-sm"
                />
              </div>
            </>
          )}
        </div>

        {!loading && household && members.length > 0 && (
          <div className="sticky bottom-0 bg-card flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} disabled={saving || !memberId || selected.length === 0}>
              {saving ? 'Granting…' : 'Grant access'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}