import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import Layout from '@/components/Layout';
import StatusBadge from '@/components/StatusBadge';
import { Pill, Download, Clock, FileText } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { generatePrescriptionPdf } from '@/lib/prescriptionPdf';

export default function Prescriptions() {
  const { user } = useAuth();
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => { if (user?.id) load(); }, [user?.id]);

  const load = async () => {
    try {
      const data = await base44.entities.Prescription.filter({ patient_id: user?.id }, '-date', 50);
      setPrescriptions(data);
    } catch { setPrescriptions([]); }
    finally { setLoading(false); }
  };

  return (
    <Layout title="Prescriptions" subtitle={`${prescriptions.length} total prescriptions`}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-fade-in">
        {/* List */}
        <div className="lg:col-span-1 space-y-2">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-lg bg-card border border-border animate-pulse" />)}
            </div>
          ) : prescriptions.length > 0 ? (
            prescriptions.map(presc => (
              <button
                key={presc.id}
                onClick={() => setSelected(presc)}
                className={`w-full text-left rounded-lg border p-3 transition-all ${selected?.id === presc.id ? 'border-primary/30 bg-primary/5 glow-sm' : 'border-border bg-card hover:border-primary/20'}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold truncate">Dr. {presc.doctor_name}</p>
                  <StatusBadge status={presc.status} />
                </div>
                <p className="text-[11px] text-muted-foreground font-mono">{presc.date}</p>
                <p className="text-xs text-muted-foreground mt-1 truncate">{presc.diagnosis || 'General consultation'}</p>
                <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground">
                  <Pill className="w-3 h-3" />
                  {(presc.medications || []).length} medications
                </div>
              </button>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <Pill className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No prescriptions yet</p>
            </div>
          )}
        </div>

        {/* Detail View */}
        <div className="lg:col-span-2">
          {selected ? (
            <div className="rounded-lg border border-border bg-card p-6 animate-fade-in">
              {/* Header */}
              <div className="flex items-start justify-between pb-4 border-b border-border">
                <div>
                  <h2 className="text-lg font-semibold">Dr. {selected.doctor_name}</h2>
                  <p className="text-sm text-primary">{selected.doctor_specialty || 'General Physician'}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground font-mono">{selected.date}</p>
                  <StatusBadge status={selected.status} className="mt-1" />
                </div>
              </div>

              {/* Diagnosis */}
              {selected.diagnosis && (
                <div className="mt-4 p-3 rounded-md bg-secondary/30">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Diagnosis</p>
                  <p className="text-sm">{selected.diagnosis}</p>
                </div>
              )}

              {/* Medications */}
              <div className="mt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Medications</p>
                <div className="space-y-2">
                  {(selected.medications || []).map((med, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-md bg-secondary/20 border border-border">
                      <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <Pill className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{med.name}</p>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground font-mono">
                          <span>{med.dosage}</span>
                          <span>·</span>
                          <span>{med.frequency}</span>
                          <span>·</span>
                          <span>{med.duration}</span>
                        </div>
                        {med.instructions && (
                          <p className="text-[11px] text-muted-foreground mt-1 italic">"{med.instructions}"</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              {selected.notes && (
                <div className="mt-4 p-3 rounded-md bg-secondary/30">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Doctor's Notes</p>
                  <p className="text-sm text-muted-foreground">{selected.notes}</p>
                </div>
              )}

              {/* Follow Up */}
              {selected.follow_up && (
                <div className="mt-4 flex items-center gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <p className="text-sm text-amber-400">Follow up: {selected.follow_up}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 mt-6 pt-4 border-t border-border">
                <button onClick={() => generatePrescriptionPdf(selected)} className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary/10 text-primary border border-primary/20 text-sm font-medium hover:bg-primary/20 transition-all">
                  <Download className="w-4 h-4" />
                  Download PDF
                </button>
                <button className="flex items-center gap-2 px-4 py-2 rounded-md bg-secondary/50 text-foreground border border-border text-sm font-medium hover:bg-secondary transition-all">
                  <FileText className="w-4 h-4" />
                  Share with Lab
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-16 text-center h-full flex flex-col items-center justify-center">
              <FileText className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Select a prescription to view details</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}