import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import Layout from '@/components/Layout';
import EmptyState from '@/components/EmptyState';
import DoseLogger from '@/components/DoseLogger';
import StatusBadge from '@/components/StatusBadge';
import { useAuth } from '@/lib/AuthContext';
import { recordAudit } from '@/lib/audit';
import { isPlanActive, computeAdherence } from '@/lib/medication';
import { Pill, Ban, Clock } from 'lucide-react';

const DISCONTINUE_REASONS = [
  { value: 'adverse_reaction', label: 'Adverse reaction' },
  { value: 'ineffective', label: 'Ineffective' },
  { value: 'completed_course', label: 'Completed course' },
  { value: 'patient_choice', label: 'My choice' },
  { value: 'doctor_instruction', label: 'Doctor instructed' },
  { value: 'contraindication', label: 'Contraindication' },
  { value: 'other', label: 'Other' },
];

export default function Medications() {
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [doseEvents, setDoseEvents] = useState({});
  const [loading, setLoading] = useState(true);
  const [discontinuing, setDiscontinuing] = useState(null);
  const [discontinuingId, setDiscontinuingId] = useState(null);
  const [reason, setReason] = useState('patient_choice');
  const [reasonDetail, setReasonDetail] = useState('');

  useEffect(() => { if (user?.id) load(); }, [user?.id]);

  const load = async () => {
    try {
      const myPlans = await base44.entities.MedicationPlan.filter({ patient_id: user.id }, '-start_date', 100);
      setPlans(myPlans);
      // Load dose events per plan in one query and group.
      const events = myPlans.length ? await base44.entities.DoseEvent.filter({ patient_id: user.id }, '-taken_at', 500) : [];
      const grouped = events.reduce((acc, e) => {
        (acc[e.medication_plan_id] ||= []).push(e);
        return acc;
      }, {});
      setDoseEvents(grouped);
    } catch { setPlans([]); }
    finally { setLoading(false); }
  };

  const active = plans.filter(isPlanActive);
  const completedOrDiscontinued = plans.filter(p => !isPlanActive(p));

  const discontinue = async () => {
    if (!discontinuing || discontinuingId) return;
    setDiscontinuingId(discontinuing.id);
    try {
      const now = new Date().toISOString();
      await base44.entities.Discontinuation.create({
        medication_plan_id: discontinuing.id,
        prescription_id: discontinuing.prescription_id,
        patient_id: discontinuing.patient_id,
        patient_name: discontinuing.patient_name,
        discontinued_by_id: user.id,
        discontinued_by_name: user.full_name,
        discontinued_by_role: 'patient',
        reason,
        reason_detail: reasonDetail || undefined,
        discontinued_at: now,
      });
      await base44.entities.MedicationPlan.update(discontinuing.id, { status: 'discontinued', discontinued_at: now, discontinuation_reason: reason });
      await recordAudit({ action: 'discontinuation', target_type: 'MedicationPlan', target_id: discontinuing.id, patient_id: discontinuing.patient_id, detail: `Patient stopped ${discontinuing.medication_name}: ${reason}` });
      setDiscontinuing(null);
      setReasonDetail('');
      load();
    } catch (e) {
      console.error(e);
    } finally {
      setDiscontinuingId(null);
    }
  };

  const overallAdherence = () => {
    const all = Object.values(doseEvents).flat();
    const a = computeAdherence(all);
    return a.rate;
  };

  const rate = overallAdherence();

  return (
    <Layout title="Medications">
      <div className="space-y-4 animate-fade-in">
        {rate !== null && (
          <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center"><Pill className="w-6 h-6 text-primary" /></div>
            <div>
              <p className="text-2xl font-bold">{rate}%</p>
              <p className="text-xs text-muted-foreground">Overall adherence across all medications</p>
            </div>
          </div>
        )}

        <section>
          <h2 className="text-sm font-bold mb-2">Active medications</h2>
          {loading ? (
            <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-32 rounded-2xl bg-card border border-border animate-pulse" />)}</div>
          ) : active.length > 0 ? (
            <div className="space-y-3">
              {active.map(plan => (
                <DoseLogger key={plan.id} plan={plan} doseEvents={doseEvents[plan.id] || []} onLogged={load} />
              ))}
            </div>
          ) : (
            <EmptyState icon={Pill} title="No active medications" description="Medication plans from your doctor will appear here for dose tracking." />
          )}
        </section>

        {completedOrDiscontinued.length > 0 && (
          <section>
            <h2 className="text-sm font-bold mb-2 mt-6">Completed / discontinued</h2>
            <div className="space-y-2">
              {completedOrDiscontinued.map(plan => (
                <div key={plan.id} className="bg-card rounded-xl border border-border p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{plan.medication_name} <span className="text-xs text-muted-foreground">{plan.dosage}</span></p>
                    <p className="text-[11px] text-muted-foreground">{plan.start_date} → {plan.end_date || '—'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {plan.status === 'discontinued' && plan.discontinuation_reason && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Ban className="w-3 h-3" /> {plan.discontinuation_reason.replace(/_/g, ' ')}</span>
                    )}
                    <StatusBadge status={plan.status} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Discontinue dialog */}
      {discontinuing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDiscontinuing(null)}>
          <div className="bg-card rounded-2xl w-full max-w-sm p-5 space-y-4 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-600" />
              <h3 className="font-bold">Stop {discontinuing.medication_name}?</h3>
            </div>
            <p className="text-xs text-muted-foreground">Tell your care team why. This does not delete your history.</p>
            <select value={reason} onChange={e => setReason(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-input bg-card text-sm">
              {DISCONTINUE_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <input value={reasonDetail} onChange={e => setReasonDetail(e.target.value)} placeholder="Optional detail" className="w-full px-3 py-2 rounded-xl border border-input bg-card text-sm" />
            <div className="flex gap-2">
              <button onClick={() => setDiscontinuing(null)} className="flex-1 py-2.5 rounded-xl bg-secondary text-sm font-semibold" disabled={!!discontinuingId}>Cancel</button>
              <button onClick={discontinue} disabled={!!discontinuingId} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-50">{discontinuingId ? 'Stopping…' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}

      {/* floating "stop" triggers: each active card has its own via DoseLogger? we add inline stop buttons below */}
      <ActiveStopBar plans={active} onStop={setDiscontinuing} />
    </Layout>
  );
}

// Inline stop buttons under each active plan (kept here so DoseLogger stays a pure logger).
function ActiveStopBar({ plans, onStop }) {
  if (!plans.length) return null;
  return (
    <div className="space-y-1 mt-2">
      {plans.map(p => (
        <button key={p.id} onClick={() => onStop(p)} className="w-full text-left text-[11px] text-muted-foreground hover:text-red-600 transition-colors">
          Stop {p.medication_name}…
        </button>
      ))}
    </div>
  );
}