import React, { useEffect, useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import Layout from '@/components/Layout';
import StatusBadge from '@/components/StatusBadge';
import PatientOverviewDialog from '@/components/PatientOverviewDialog';
import { batchCheckAccess } from '@/lib/recordAccess';
import { formatAppointmentDate } from '@/lib/utils';
import { Users, Search, FileText, ShieldCheck, Clock, Lock } from 'lucide-react';

export default function DoctorPatients() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [doctorEntityId, setDoctorEntityId] = useState(null);

  useEffect(() => { load(); }, [user]);

  const load = async () => {
    if (!user?.id) return;
    try {
      const myDoctors = await base44.entities.Doctor.filter({ email: user.email });
      if (!myDoctors.length) { setAppointments([]); return; }
      setDoctorEntityId(myDoctors[0].id);
      const data = await base44.entities.Appointment.filter({ doctor_id: myDoctors[0].id }, '-appointment_date', 200);
      setAppointments(data);
    } catch { setAppointments([]); }
    finally { setLoading(false); }
  };

  // Compute access status for each patient from appointment data
  const accessMap = useMemo(() => batchCheckAccess(appointments), [appointments]);

  // Extract unique patients
  const patientMap = new Map();
  appointments.forEach(a => {
    if (!patientMap.has(a.patient_name)) {
      patientMap.set(a.patient_name, {
        name: a.patient_name,
        patient_id: a.patient_id,
        age: a.patient_age || 30,
        gender: a.patient_gender || 'male',
        visits: 1,
        lastVisit: a.appointment_date,
        status: a.status,
      });
    } else {
      const p = patientMap.get(a.patient_name);
      p.visits++;
      if (a.appointment_date > p.lastVisit) p.lastVisit = a.appointment_date;
    }
  });

  const patients = Array.from(patientMap.values()).filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout role="doctor" title="My Patients">
      <div className="space-y-4 animate-fade-in">
        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card border border-border max-w-md">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search patients…"
            className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground/60"
          />
        </div>

        {/* Patient List */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-28 rounded-2xl bg-card border border-border animate-pulse" />)}
          </div>
        ) : patients.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {patients.map(patient => {
              const access = accessMap.get(patient.name) || { hasAccess: false, hasExpired: false };
              return (
                <div key={patient.name} className="rounded-2xl border border-border bg-card p-4 hover:border-primary/30 transition-all shadow-card">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-primary">
                        {patient.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{patient.name}</p>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                        <span>{patient.age}y</span>
                        <span>·</span>
                        <span className="capitalize">{patient.gender}</span>
                        <span>·</span>
                        <span>{patient.visits} visits</span>
                      </div>
                    </div>
                    <StatusBadge status={patient.status} />
                  </div>

                  {/* Access Status */}
                  <div className="mt-3">
                    {access.hasAccess ? (
                      <div className="flex items-center gap-1.5 text-[11px] text-green-600 font-medium">
                        <ShieldCheck className="w-3 h-3" />
                        Record access active
                      </div>
                    ) : access.hasExpired ? (
                      <div className="flex items-center gap-1.5 text-[11px] text-amber-600 font-medium">
                        <Clock className="w-3 h-3" />
                        Record access expired — book a new appointment to view
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
                        <Lock className="w-3 h-3" />
                        No approved appointment — records locked
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                    <button
                      onClick={() => setSelectedPatient({ name: patient.name, id: patient.patient_id })}
                      disabled={!access.hasAccess}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                        access.hasAccess
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                          : 'bg-secondary text-muted-foreground cursor-not-allowed'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      View Records
                    </button>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      Last: {formatAppointmentDate(patient.lastVisit)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <Users className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No patients found</p>
          </div>
        )}
      </div>

      {/* Patient Records Dialog */}
      {selectedPatient && (
        <PatientOverviewDialog
          patientName={selectedPatient.name}
          patientId={selectedPatient.id}
          doctorId={doctorEntityId}
          appointments={appointments}
          open={!!selectedPatient}
          onClose={() => setSelectedPatient(null)}
        />
      )}
    </Layout>
  );
}