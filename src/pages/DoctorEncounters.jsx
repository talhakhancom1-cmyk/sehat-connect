import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import Layout from '@/components/Layout';
import EmptyState from '@/components/EmptyState';
import EncounterForm from '@/components/EncounterForm';
import { useDoctorProfile } from '@/lib/useRole';
import { Stethoscope, ClipboardList, CheckCircle2, ChevronRight, X } from 'lucide-react';

export default function DoctorEncounters() {
  const { doctor, isVerified } = useDoctorProfile();
  const [appointments, setAppointments] = useState([]);
  const [encounters, setEncounters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);   // appointment being written into an encounter
  const [viewing, setViewing] = useState(null);    // encounter detail

  useEffect(() => {
    if (doctor?.id) load();
    else setLoading(false);
  }, [doctor?.id]);

  const load = async () => {
    try {
      const [appts, encs] = await Promise.all([
        base44.entities.Appointment.filter({ doctor_id: doctor.id }, '-appointment_date', 200),
        base44.entities.Encounter.filter({ doctor_id: doctor.id }, '-encounter_date', 200),
      ]);
      setAppointments(appts);
      setEncounters(encs);
    } catch { setAppointments([]); }
    finally { setLoading(false); }
  };

  const encounterForAppt = (apptId) => encounters.find(e => e.appointment_id === apptId);

  // Active = in progress (doctor can complete + write encounter now)
  const inProgress = appointments.filter(a => a.status === 'in_progress');
  // Completed appointments without an encounter yet
  const needsEncounter = appointments.filter(a => a.status === 'completed' && !encounterForAppt(a.id));

  if (!isVerified && !loading) {
    return (
      <Layout role="doctor" title="Encounters">
        <EmptyState icon={Stethoscope} title="Verification required" description="Complete verification to record clinical encounters." />
      </Layout>
    );
  }

  return (
    <Layout role="doctor" title="Encounters">
      <div className="space-y-6 animate-fade-in">
        {/* In progress — finish now */}
        <Section icon={ClipboardList} title="In progress" count={inProgress.length}>
          {inProgress.length ? inProgress.map(a => (
            <Row key={a.id} appt={a} actionLabel="Complete & write" onAction={() => setEditing(a)} />
          )) : <Muted>None in progress.</Muted>}
        </Section>

        {/* Completed but no encounter summary */}
        <Section icon={CheckCircle2} title="Awaiting encounter summary" count={needsEncounter.length}>
          {needsEncounter.length ? needsEncounter.map(a => (
            <Row key={a.id} appt={a} actionLabel="Write encounter" onAction={() => setEditing(a)} />
          )) : <Muted>All completed visits are documented.</Muted>}
        </Section>

        {/* Recorded encounters */}
        <Section icon={Stethoscope} title="Recorded encounters" count={encounters.length}>
          {encounters.length ? encounters.map(e => (
            <button key={e.id} onClick={() => setViewing(e)}
              className="w-full text-left rounded-xl border border-border bg-card p-3 flex items-center justify-between hover:border-primary/20 transition-all">
              <div>
                <p className="text-sm font-semibold">{e.patient_name} <span className="text-xs text-muted-foreground">· {e.encounter_type}</span></p>
                <p className="text-[11px] text-muted-foreground font-mono">{e.encounter_date} · {e.diagnosis || 'No diagnosis'}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          )) : <Muted>No encounters recorded yet.</Muted>}
        </Section>
      </div>

      {editing && (
        <EncounterForm appointment={editing} doctor={doctor} onClose={() => setEditing(null)} onSaved={load} />
      )}

      {viewing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setViewing(null)}>
          <div className="bg-card rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto scrollbar-thin animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-card border-b border-border p-4 flex items-center justify-between">
              <h3 className="font-bold">Encounter · {viewing.patient_name}</h3>
              <button onClick={() => setViewing(null)} className="p-2 rounded-full hover:bg-secondary"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <Block label="Date">{viewing.encounter_date} · {viewing.encounter_type}</Block>
              <Block label="Chief complaint">{viewing.chief_complaint}</Block>
              <Block label="Examination">{viewing.examination}</Block>
              <Block label="Diagnosis">{viewing.diagnosis}</Block>
              {viewing.differential_diagnosis && <Block label="Differential">{viewing.differential_diagnosis}</Block>}
              <Block label="Clinical notes">{viewing.clinical_notes}</Block>
              <Block label="Advice">{viewing.advice}</Block>
              {viewing.follow_up && <Block label="Follow up">{viewing.follow_up}</Block>}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function Section({ icon: Icon, title, count, children }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-bold">{title}</h2>
        <span className="text-[11px] text-muted-foreground">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({ appt, actionLabel, onAction }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 flex items-center justify-between">
      <div>
        <p className="text-sm font-semibold">{appt.patient_name}</p>
        <p className="text-[11px] text-muted-foreground font-mono">{appt.appointment_date} · {appt.time_slot} · {appt.type}</p>
      </div>
      <button onClick={onAction} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 active:scale-95 transition-all">{actionLabel}</button>
    </div>
  );
}

function Muted({ children }) {
  return <p className="text-xs text-muted-foreground px-1 py-2">{children}</p>;
}

function Block({ label, children }) {
  if (!children) return null;
  return (
    <div className="p-3 rounded-xl bg-secondary/30">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p>{children}</p>
    </div>
  );
}