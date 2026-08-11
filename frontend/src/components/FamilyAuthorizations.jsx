import React, { useEffect, useState } from 'react';
import { ShieldCheck, Ban } from 'lucide-react';
import { getOutgoingDelegations, revokeDelegation } from '@/lib/familyAccess';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { toUserError } from '@/lib/userError';

export default function FamilyAuthorizations({ scope }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setItems(await getOutgoingDelegations(user.id, scope));
    } catch { setItems([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (user?.id) load(); }, [user?.id, scope]);

  const revoke = async (d) => {
    if (!confirm(`Revoke ${d.delegatee_name || 'this member'}'s access?`)) return;
    try {
      await revokeDelegation(d.id, user.id, scope);
      toast({ title: 'Access revoked' });
      load();
    } catch (e) {
      toast({ title: 'Could not revoke', description: toUserError(e), variant: 'destructive' });
    }
  };

  if (loading || items.length === 0) return null;

  return (
    <div className="bg-card rounded-2xl shadow-card overflow-hidden animate-slide-up">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <ShieldCheck className="w-4 h-4 text-primary" />
        <p className="font-semibold text-sm">Family members with access</p>
      </div>
      <div className="divide-y divide-border/60">
        {items.map((d) => (
          <div key={d.id} className="flex items-center gap-3 p-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{d.delegatee_name || 'Member'}</p>
              <p className="text-[11px] text-muted-foreground">
                expires {d.expires_at ? new Date(d.expires_at).toLocaleDateString() : '—'}
                {scope === 'record_view' && d.record_view_categories?.length ? ` · ${d.record_view_categories.length} categories` : ''}
                {scope === 'health_card_view' && d.health_card_types?.length ? ` · ${d.health_card_types.length} card types` : ''}
              </p>
            </div>
            <button
              onClick={() => revoke(d)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors shrink-0"
              aria-label="Revoke access"
            >
              <Ban className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}