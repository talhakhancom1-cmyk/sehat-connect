import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import Layout from '@/components/Layout';
import EmptyState from '@/components/EmptyState';
import { useToast } from '@/components/ui/use-toast';
import { ShieldCheck, Ban, Lock, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import ConsentGrantForm from '@/components/ConsentGrantForm';

const statusStyles = {
  active: 'bg-green-100 text-green-700 border-green-200',
  revoked: 'bg-red-100 text-red-700 border-red-200',
  expired: 'bg-gray-100 text-gray-600 border-gray-200',
};

export default function ManageAccess() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [consents, setConsents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState(null);
  const [showGrant, setShowGrant] = useState(false);

  useEffect(() => { if (user?.id) load(); }, [user?.id]);

  const load = async () => {
    try {
      const data = await base44.entities.Consent.filter({ patient_id: user.id }, '-granted_at', 200);
      setConsents(data);
    } catch { setConsents([]); }
    finally { setLoading(false); }
  };

  const handleRevoke = async (consent) => {
    setRevokingId(consent.id);
    try {
      await base44.entities.Consent.update(consent.id, {
        status: 'revoked',
        revoked_at: new Date().toISOString(),
      });
      await base44.entities.AuditEvent.create({
        actor_user_id: user.id,
        actor_role: 'patient',
        action: 'consent_revoke',
        target_type: 'Consent',
        target_id: consent.id,
        patient_id: user.id,
        detail: `Revoked record access for ${consent.recipient_name || 'recipient'}`,
      });
      toast({ title: 'Access revoked', description: `${consent.recipient_name || 'Recipient'} can no longer view your records.` });
      load();
    } catch (err) {
      toast({ title: 'Could not revoke', description: 'Please try again.', variant: 'destructive' });
      console.error(err);
    } finally {
      setRevokingId(null);
    }
  };

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  return (
    <Layout title="Manage Access">
      <div className="space-y-6 animate-fade-in">
        <div className="animate-slide-up">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-bold text-base">Shared Access</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Doctors and caregivers you've granted access to your records</p>
            </div>
            <button
              onClick={() => setShowGrant(true)}
              className="px-3 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1.5 hover:bg-primary/90 active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" /> Grant access
            </button>
          </div>

          {loading ? (
            <div className="bg-card rounded-2xl shadow-card divide-y divide-border/60">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3 p-4">
                  <div className="w-10 h-10 rounded-full shimmer" />
                  <div className="flex-1 h-4 shimmer rounded" />
                </div>
              ))}
            </div>
          ) : consents.length > 0 ? (
            <div className="bg-card rounded-2xl divide-y divide-border/60 shadow-card overflow-hidden">
              {consents.map((c, i) => {
                const isActive = c.status === 'active';
                return (
                  <div
                    key={c.id}
                    className="flex items-start gap-3 p-4 animate-slide-up"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-sm truncate">{c.recipient_name || 'Unknown recipient'}</p>
                        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border capitalize', statusStyles[c.status] || statusStyles.expired)}>
                          {c.status}
                        </span>
                      </div>
                      {c.categories?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {c.categories.slice(0, 4).map(cat => (
                            <span key={cat} className="px-1.5 py-0.5 rounded-md bg-secondary text-[10px] text-muted-foreground">{cat}</span>
                          ))}
                          {c.categories.length > 4 && <span className="px-1.5 py-0.5 text-[10px] text-muted-foreground">+{c.categories.length - 4}</span>}
                        </div>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        Granted {fmt(c.granted_at)}
                        {c.expires_at && ` · expires ${fmt(c.expires_at)}`}
                        {c.revoked_at && ` · revoked ${fmt(c.revoked_at)}`}
                      </p>
                    </div>
                    {isActive && (
                      <button
                        onClick={() => handleRevoke(c)}
                        disabled={revokingId === c.id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-50 text-red-600 border border-red-100 text-xs font-semibold hover:bg-red-100 active:scale-95 transition-all disabled:opacity-60 shrink-0"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        {revokingId === c.id ? 'Revoking…' : 'Revoke'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-card rounded-2xl shadow-card">
              <EmptyState
                icon={Lock}
                title="No access shared yet"
                description="When you grant a doctor access to your records, they'll appear here."
              />
            </div>
          )}
        </div>
      </div>

      {showGrant && <ConsentGrantForm onClose={() => setShowGrant(false)} onGranted={load} />}
    </Layout>
  );
}