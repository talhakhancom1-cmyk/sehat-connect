import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import Layout from '@/components/Layout';
import StatusBadge from '@/components/StatusBadge';
import EmptyState from '@/components/EmptyState';
import PrescriptionForm from '@/components/PrescriptionForm';
import { useDoctorProfile } from '@/lib/useRole';
import { recordAudit } from '@/lib/audit';
import { plansFromPrescription } from '@/lib/medication';
import { generatePrescriptionPdf } from '@/lib/prescriptionPdf';
import { Plus, FileText, ShieldCheck, Pill, Download, FileSignature, X } from 'lucide-react';

export default function DoctorPrescriptions() {
  const { doctor, isVerified, loading: docLoading } = useDoctorProfile();
  const [prescriptions, setPrescriptions] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (doctor?.id) load();
    else if (!docLoading) setLoading(false);
  }, [doctor?.id, docLoading]);

  const load = async () => {
    try {
      const [prescs, appts] = await Promise.all([
        base44.entities.Prescription.filter({ doctor_id: doctor.id }, '-date', 100),
        base44.entities.Appointment.filter({ doctor_id: doctor.id }, '-appointment_date', 100),
      ]);
      setPrescriptions(prescs);
      setAppointments(appts);
    } catch { setPrescriptions([]); }
    finally { setLoading(false); }
  };

  // De-duplicated patient list from appointments (for the form dropdown).
  const patients = appointments
    .filter(a => a.patient_id && a.patient_name)
    .reduce((acc, a) => acc.some(p => p.patient_id === a.patient_id) ? acc : [...acc, { patient_id: a.patient_id, patient_name: a.patient_name }], []);

  const createPrescription = async (data) => {
    setSaving(true);
    try {
      const created = await base44.entities.Prescription.create(data);
      await recordAudit({ action: 'prescription_create', target_type: 'Prescription', target_id: created.id, patient_id: data.patient_id, detail: 'Doctor created prescription' });
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  };

  const signPrescription = async (presc) => {
    await base44.entities.Prescription.update(presc.id, { is_signed: true, signed_at: new Date().toISOString() });
    await recordAudit({ action: 'prescription_sign', target_type: 'Prescription', target_id: presc.id, patient_id: presc.patient_id, detail: 'Doctor signed prescription' });
    load();
  };

  const generatePlans = async (presc) => {
    const plans = plansFromPrescription(presc, doctor);
    if (!plans.length) return;
    await base44.entities.MedicationPlan.bulkCreate(plans);
    await Promise.all(plans.map(p => recordAudit({ action: 'medication_plan_create', target_type: 'MedicationPlan', target_id: p.id || presc.id, patient_id: presc.patient_id, detail: `Plan for ${p.medication_name}` })));
    load();
  };

  return (
    <Layout role="doctor" title="Prescriptions">
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{prescriptions.length} prescription{prescriptions.length === 1 ? '' : 's'}</p>
          <button onClick={() => setShowForm(true)} disabled={!isVerified || !patients.length}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            <Plus className="w-4 h-4" /> New
          </button>
        </div>
        {!isVerified && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
            Prescribing is disabled until your verification is approved.
          </p>
        )}

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-24 rounded-2xl bg-card border border-border animate-pulse" />)}</div>
        ) : prescriptions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {prescriptions.map(presc => (
              <div key={presc.id} className="bg-card rounded-2xl shadow-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{presc.patient_name}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{presc.date}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {presc.is_signed ? (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 px-2 py-1 rounded-full"><FileSignature className="w-3 h-3" /> Signed</span>
                    ) : (
                      <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-1 rounded-full">Draft</span>
                    )}
                    <StatusBadge status={presc.status} />
                  </div>
                </div>
                {presc.diagnosis && <p className="text-xs text-muted-foreground">{presc.diagnosis}</p>}
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><Pill className="w-3 h-3" /> {(presc.medications || []).length} medications</div>
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <button onClick={() => setSelected(presc)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-xs font-semibold hover:bg-secondary/80 transition-all"><FileText className="w-3.5 h-3.5" /> View</button>
                  <button onClick={() => generatePrescriptionPdf(presc)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-xs font-semibold hover:bg-secondary/80 transition-all"><Download className="w-3.5 h-3.5" /> PDF</button>
                  {!presc.is_signed && (
                    <button onClick={() => signPrescription(presc)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-all ml-auto"><ShieldCheck className="w-3.5 h-3.5" /> Sign</button>
                  )}
                  {presc.is_signed && (
                    <button onClick={() => generatePlans(presc)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-all ml-auto"><Plus className="w-3.5 h-3.5" /> Plans</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={FileText} title="No prescriptions yet" description="Create a prescription from one of your appointments." actionLabel={!isVerified ? undefined : "New prescription"} onAction={!isVerified ? undefined : () => setShowForm(true)} />
        )}
      </div>

      {showForm && (
        <PrescriptionForm patients={patients} doctor={doctor} onClose={() => setShowForm(false)} onCreated={createPrescription} />
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-card rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto scrollbar-thin animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-card border-b border-border p-4 flex items-center justify-between">
              <h3 className="font-bold">Prescription</h3>
              <button onClick={() => setSelected(null)} className="p-2 rounded-full hover:bg-secondary"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div><p className="font-semibold text-sm">{selected.patient_name}</p><p className="text-xs text-primary">{selected.doctor_specialty}</p></div>
                <div className="text-right"><p className="text-xs text-muted-foreground font-mono">{selected.date}</p>{selected.is_signed && <span className="text-[10px] text-green-700 font-semibold">Signed {selected.signed_at?.slice(0, 10)}</span>}</div>
              </div>
              {selected.diagnosis && <div className="p-3 rounded-xl bg-secondary/30"><p className="text-[10px] uppercase text-muted-foreground">Diagnosis</p><p className="text-sm">{selected.diagnosis}</p></div>}
              <div className="space-y-2">
                {(selected.medications || []).map((m, i) => (
                  <div key={i} className="p-3 rounded-xl bg-secondary/20 border border-border">
                    <p className="text-sm font-semibold">{m.name} {m.dosage}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{m.frequency} · {m.duration}</p>
                    {m.instructions && <p className="text-[11px] text-muted-foreground mt-1 italic">{m.instructions}</p>}
                  </div>
                ))}
              </div>
              {selected.notes && <div className="p-3 rounded-xl bg-secondary/30"><p className="text-[10px] uppercase text-muted-foreground">Notes</p><p className="text-sm">{selected.notes}</p></div>}
              {selected.follow_up && <p className="text-xs text-amber-700">Follow up: {selected.follow_up}</p>}
            </div>
          </div>
        </div>
      )}

      {docLoading && !doctor && !loading && (
        <EmptyState icon={FileText} title="No doctor profile" description="Complete onboarding as a doctor to start prescribing." />
      )}
    </Layout>
  );
}