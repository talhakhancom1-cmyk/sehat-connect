import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import Layout from '@/components/Layout';
import { ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';

const actionStyles = {
  record_view: 'bg-blue-100 text-blue-700',
  record_upload: 'bg-teal-100 text-teal-700',
  prescription_view: 'bg-indigo-100 text-indigo-700',
  appointment_confirm: 'bg-green-100 text-green-700',
  appointment_cancel: 'bg-red-100 text-red-700',
  payment_marked_paid: 'bg-amber-100 text-amber-700',
  consent_grant: 'bg-green-100 text-green-700',
  consent_revoke: 'bg-red-100 text-red-700',
  doctor_verify: 'bg-green-100 text-green-700',
  doctor_suspend: 'bg-red-100 text-red-700',
};

export default function AdminAuditLog() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const data = await base44.entities.AuditEvent.list('-created_date', 100);
      setEvents(data);
    } catch { setEvents([]); }
    finally { setLoading(false); }
  };

  const fmt = (d) => d
    ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '—';

  return (
    <Layout role="admin" title="Audit Log">
      <div className="space-y-4 animate-fade-in">
        {loading ? (
          <div className="bg-card rounded-2xl shadow-card divide-y divide-border/60">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-3 p-3">
                <div className="w-8 h-8 rounded-full shimmer" />
                <div className="flex-1 h-4 shimmer rounded" />
              </div>
            ))}
          </div>
        ) : events.length > 0 ? (
          <div className="bg-card rounded-2xl shadow-card overflow-hidden">
            <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2.5 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              <div className="col-span-1">Role</div>
              <div className="col-span-2">Action</div>
              <div className="col-span-2">Target</div>
              <div className="col-span-2">Patient</div>
              <div className="col-span-3">Detail</div>
              <div className="col-span-2">When</div>
            </div>
            <div className="divide-y divide-border/60">
              {events.map((e, i) => (
                <div
                  key={e.id}
                  className="md:grid md:grid-cols-12 md:gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors animate-slide-up"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <div className="md:col-span-1">
                    <span className="text-[11px] font-medium capitalize px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{e.actor_role || '—'}</span>
                  </div>
                  <div className="md:col-span-2 mt-1 md:mt-0">
                    <span className={cn('inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full', actionStyles[e.action] || 'bg-secondary text-muted-foreground')}>
                      {(e.action || '—').replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="md:col-span-2 text-xs text-muted-foreground mt-1 md:mt-0 md:truncate">
                    <span className="md:hidden font-medium text-foreground/70">Target: </span>{e.target_type || '—'}
                  </div>
                  <div className="md:col-span-2 text-xs text-muted-foreground mt-1 md:mt-0 md:truncate">
                    {e.patient_id ? `…${e.patient_id.slice(-6)}` : '—'}
                  </div>
                  <div className="md:col-span-3 text-xs text-muted-foreground mt-1 md:mt-0 md:truncate">
                    {e.detail || '—'}
                  </div>
                  <div className="md:col-span-2 text-[11px] text-muted-foreground mt-1 md:mt-0">
                    {fmt(e.created_date)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-card rounded-2xl shadow-card p-8 text-center">
            <ClipboardList className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No audit events recorded yet</p>
          </div>
        )}
      </div>
    </Layout>
  );
}