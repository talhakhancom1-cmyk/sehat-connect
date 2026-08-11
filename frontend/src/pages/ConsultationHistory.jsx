import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import Layout from '@/components/Layout';
import StatusBadge from '@/components/StatusBadge';
import { Search, FileText, ChevronRight, Video, Phone, MessageSquare, Building2, Home, Pill, Stethoscope, Calendar, Clock, ClipboardCheck } from 'lucide-react';
import { cn, formatAppointmentDate } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';

const typeIcons = {
  video: Video, audio: Phone, chat: MessageSquare, physical: Building2, home: Home, emergency: Phone,
};

export default function ConsultationHistory() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [encounters, setEncounters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => { if (user?.id) load(); }, [user?.id]);

  const load = async () => {
    try {
      const [appts, prescs, encs] = await Promise.all([
        base44.entities.Appointment.filter({ patient_id: user.id }, '-appointment_date', 100),
        base44.entities.Prescription.filter({ patient_id: user.id }, '-date', 50),
        base44.entities.Encounter.filter({ patient_id: user.id }, '-encounter_date', 100),
      ]);
      setAppointments(appts);
      setPrescriptions(prescs);
      setEncounters(encs);
      if (appts.length > 0) setSelected(appts[0]);
    } catch {
      setAppointments([]);
      setPrescriptions([]);
      setEncounters([]);
    } finally {
      setLoading(false);
    }
  };

  // Only show completed consultations
  const completedAppts = appointments.filter(a => a.status === 'completed');

  const filtered = completedAppts.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.doctor_name?.toLowerCase().includes(q) ||
      a.reason?.toLowerCase().includes(q) ||
      a.symptoms?.toLowerCase().includes(q)
    );
  });

  // Find prescription linked to an appointment
  const getPrescription = (appt) => {
    return prescriptions.find(p =>
      p.appointment_id === appt.id ||
      (p.doctor_name === appt.doctor_name && p.patient_name === appt.patient_name)
    );
  };

  const getEncounter = (appt) => encounters.find(e => e.appointment_id === appt.id);
  const selectedEncounter = selected ? getEncounter(selected) : null;
  const selectedPresc = selected ? getPrescription(selected) : null;

  return (
    <Layout title="Consultation History" subtitle={`${completedAppts.length} past consultations`}>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 animate-fade-in">
        {/* List Panel */}
        <div className="lg:col-span-2 space-y-2">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-card border border-border mb-3">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by doctor, reason, symptoms…"
              className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground/60"
            />
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-lg bg-card border border-border animate-pulse" />)}
            </div>
          ) : filtered.length > 0 ? (
            filtered.map(appt => {
              const Icon = typeIcons[appt.type] || Video;
              const isSel = selected?.id === appt.id;
              const presc = getPrescription(appt);
              return (
                <button
                  key={appt.id}
                  onClick={() => setSelected(appt)}
                  className={cn(
                    'w-full text-left rounded-lg border p-3 transition-all',
                    isSel ? 'border-primary/30 bg-primary/5 glow-sm' : 'border-border bg-card hover:border-primary/20'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-9 h-9 rounded-md flex items-center justify-center shrink-0',
                      isSel ? 'bg-primary/15' : 'bg-secondary/50'
                    )}>
                      <Icon className={cn('w-4 h-4', isSel ? 'text-primary' : 'text-muted-foreground')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{appt.doctor_name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {formatAppointmentDate(appt.appointment_date)} · {appt.time_slot}
                      </p>
                    </div>
                    <ChevronRight className={cn('w-4 h-4 shrink-0 transition-colors', isSel ? 'text-primary' : 'text-muted-foreground')} />
                  </div>
                  {appt.reason && (
                    <p className="text-xs text-muted-foreground mt-2 ml-12 truncate">{appt.reason}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 ml-12">
                    <StatusBadge status={appt.status} />
                    {presc && (
                      <span className="flex items-center gap-1 text-[10px] text-primary font-mono">
                        <Pill className="w-2.5 h-2.5" />
                        Rx
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          ) : (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No completed consultations found</p>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="lg:col-span-3">
          {selected ? (
            <div className="rounded-lg border border-border bg-card p-5 animate-fade-in space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between pb-4 border-b border-border">
                <div>
                  <h2 className="text-lg font-semibold">{selected.doctor_name}</h2>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground font-mono">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatAppointmentDate(selected.appointment_date)} · {selected.time_slot}
                    <span>·</span>
                    <Clock className="w-3.5 h-3.5" />
                    <span className="capitalize">{selected.type} consultation</span>
                  </div>
                </div>
                <StatusBadge status={selected.status} />
              </div>

              {/* Symptoms / Reason */}
              {selected.symptoms && (
                <div className="p-3 rounded-md bg-secondary/30">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <Stethoscope className="w-3 h-3" />
                    Patient Symptoms
                  </p>
                  <p className="text-sm">{selected.symptoms}</p>
                </div>
              )}

              {/* Reason for Visit */}
              {selected.reason && (
                <div className="p-3 rounded-md bg-secondary/30">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Reason for Visit</p>
                  <p className="text-sm">{selected.reason}</p>
                </div>
              )}

              {/* Clinical encounter (if recorded) */}
              {selectedEncounter ? (
                <div className="space-y-3">
                  {selectedEncounter.chief_complaint && <EncBlock label="Chief complaint">{selectedEncounter.chief_complaint}</EncBlock>}
                  {selectedEncounter.examination && <EncBlock label="Examination">{selectedEncounter.examination}</EncBlock>}
                  {selectedEncounter.diagnosis && <EncBlock label="Diagnosis">{selectedEncounter.diagnosis}</EncBlock>}
                  {selectedEncounter.clinical_notes && <EncBlock label="Clinical notes">{selectedEncounter.clinical_notes}</EncBlock>}
                  {selectedEncounter.advice && <EncBlock label="Advice">{selectedEncounter.advice}</EncBlock>}
                  {selectedEncounter.follow_up && (
                    <div className="flex items-center gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
                      <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                      <p className="text-sm text-amber-600"><span className="font-semibold">Follow-up:</span> {selectedEncounter.follow_up}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-md bg-secondary/20 border border-dashed border-border flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-muted-foreground shrink-0" />
                  <p className="text-xs text-muted-foreground">No clinical encounter recorded for this visit.</p>
                </div>
              )}

              {/* Prescription / Medications */}
              {selectedPresc ? (
                <>
                  {/* Diagnosis */}
                  {selectedPresc.diagnosis && (
                    <div className="p-3 rounded-md bg-primary/5 border border-primary/20">
                      <p className="text-xs text-primary uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <FileText className="w-3 h-3" />
                        Diagnosis
                      </p>
                      <p className="text-sm font-medium">{selectedPresc.diagnosis}</p>
                    </div>
                  )}

                  {/* Medications Prescribed */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Pill className="w-3 h-3" />
                      Medications Prescribed ({(selectedPresc.medications || []).length})
                    </p>
                    <div className="space-y-2">
                      {(selectedPresc.medications || []).map((med, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-md bg-secondary/20 border border-border">
                          <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                            <Pill className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold">{med.name}</p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[11px] text-muted-foreground font-mono">
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

                  {/* Doctor's Notes */}
                  {selectedPresc.notes && (
                    <div className="p-3 rounded-md bg-secondary/30">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Doctor's Notes</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">{selectedPresc.notes}</p>
                    </div>
                  )}

                  {/* Follow-up */}
                  {selectedPresc.follow_up && (
                    <div className="flex items-center gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
                      <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                      <p className="text-sm text-amber-400">
                        <span className="font-semibold">Follow-up:</span> {selectedPresc.follow_up}
                      </p>
                    </div>
                  )}

                  {/* Payment Info */}
                  <div className="grid grid-cols-3 gap-2 pt-4 border-t border-border">
                    <div className="p-2.5 rounded-md bg-secondary/20 text-center">
                      <p className="text-sm font-mono font-bold text-primary">Rs {selected.consultation_fee || 0}</p>
                      <p className="text-[10px] text-muted-foreground">Fee</p>
                    </div>
                    <div className="p-2.5 rounded-md bg-secondary/20 text-center">
                      <p className="text-sm font-mono font-bold capitalize">{selected.payment_method || 'N/A'}</p>
                      <p className="text-[10px] text-muted-foreground">Payment</p>
                    </div>
                    <div className="p-2.5 rounded-md bg-secondary/20 text-center">
                      <p className="text-sm font-mono font-bold text-primary capitalize">{selected.payment_status || 'N/A'}</p>
                      <p className="text-[10px] text-muted-foreground">Status</p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-6 rounded-md border border-dashed border-border text-center">
                  <FileText className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No prescription or clinical notes recorded for this consultation.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-16 text-center h-full flex flex-col items-center justify-center">
              <FileText className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Select a consultation to view full details</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function EncBlock({ label, children }) {
  return (
    <div className="p-3 rounded-md bg-primary/5 border border-primary/15">
      <p className="text-[10px] text-primary uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm">{children}</p>
    </div>
  );
}