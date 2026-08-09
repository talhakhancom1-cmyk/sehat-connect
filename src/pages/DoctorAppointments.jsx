import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import Layout from '@/components/Layout';
import AppointmentCard from '@/components/AppointmentCard';
import { isAccessExpired } from '@/lib/recordAccess';
import { cn } from '@/lib/utils';
import { ShieldCheck, Clock, ClipboardList } from 'lucide-react';
import VideoCall from '@/components/VideoCall';
import PatientOverviewDialog from '@/components/PatientOverviewDialog';

const tabs = ['all', 'pending', 'confirmed', 'in_progress', 'completed', 'rejected'];

export default function DoctorAppointments() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [activeCall, setActiveCall] = useState(null);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [doctorEntityId, setDoctorEntityId] = useState(null);

  useEffect(() => { load(); }, [user]);

  const load = async () => {
    if (!user?.id) return;
    try {
      const myDoctors = await base44.entities.Doctor.filter({ email: user.email });
      if (!myDoctors.length) { setAppointments([]); return; }
      setDoctorEntityId(myDoctors[0].id);
      const data = await base44.entities.Appointment.filter({ doctor_id: myDoctors[0].id }, '-appointment_date', 100);
      setAppointments(data);
    } catch { setAppointments([]); }
    finally { setLoading(false); }
  };

  const handleAction = async (appt, action) => {
    if (action === 'confirmed' && appt.payment_status !== 'paid') {
      alert('This appointment cannot be confirmed until the patient has paid. Ask the patient to complete payment first.');
      return;
    }
    await base44.entities.Appointment.update(appt.id, { status: action });
    try {
      await base44.entities.AuditEvent.create({
        actor_user_id: user?.id,
        actor_role: 'doctor',
        action: (action === 'cancelled' || action === 'rejected') ? 'appointment_cancel' : 'appointment_confirm',
        target_type: 'Appointment',
        target_id: appt.id,
        patient_id: appt.patient_id,
        detail: `Status changed to ${action}`,
      });
    } catch (e) { console.error('Audit log failed', e); }
    load();
  };

  const filtered = tab === 'all' ? appointments : appointments.filter(a => a.status === tab);

  const renderAccessBadge = (appt) => {
    if (!['confirmed', 'completed'].includes(appt.status)) return null;
    const expired = isAccessExpired(appt.appointment_date);
    if (expired) {
      return (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 text-[11px] font-medium mb-1.5 border border-amber-200">
          <Clock className="w-3 h-3 shrink-0" />
          Record access expired — book a new appointment to view patient records
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-50 text-green-700 text-[11px] font-medium mb-1.5 border border-green-200">
        <ShieldCheck className="w-3 h-3 shrink-0" />
        Record access active
      </div>
    );
  };

  return (
    <Layout role="doctor" title="Appointments">
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
          {tabs.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium capitalize whitespace-nowrap transition-colors',
                tab === t
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground border border-border hover:bg-secondary'
              )}
            >
              {t.replace('_', ' ')}
              <span className="ml-1.5 text-[10px] opacity-70">
                {t === 'all' ? appointments.length : appointments.filter(a => a.status === t).length}
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-28 rounded-2xl bg-card border border-border animate-pulse" />)}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map(appt => (
              <div key={appt.id}>
                {renderAccessBadge(appt)}
                <AppointmentCard
                  appointment={appt}
                  role="doctor"
                  onJoin={handleAction}
                  onCancel={handleAction}
                  onVideoCall={(a) => setActiveCall({
                    roomName: `sehatconnect-${a.id}`,
                    displayName: user?.full_name || 'Doctor',
                    doctorName: a.patient_name,
                  })}
                />
                {['confirmed', 'completed', 'in_progress'].includes(appt.status) && (
                  <button
                    onClick={() => setSelectedPatient(appt.patient_name)}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-primary/5 text-primary text-xs font-semibold hover:bg-primary/10 transition-all active:scale-95"
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                    View Patient History
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <p className="text-sm text-muted-foreground">No {tab !== 'all' ? tab.replace('_', ' ') : ''} appointments</p>
          </div>
        )}
      </div>

      {activeCall && (
        <VideoCall
          roomName={activeCall.roomName}
          displayName={activeCall.displayName}
          doctorName={activeCall.doctorName}
          onClose={() => setActiveCall(null)}
        />
      )}

      {selectedPatient && (
        <PatientOverviewDialog
          patientName={selectedPatient}
          doctorId={doctorEntityId}
          appointments={appointments}
          open={!!selectedPatient}
          onClose={() => setSelectedPatient(null)}
        />
      )}
    </Layout>
  );
}