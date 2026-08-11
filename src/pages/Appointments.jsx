import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import Layout from '@/components/Layout';
import AppointmentCard from '@/components/AppointmentCard';
import EmptyState from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import { SlidersHorizontal, Calendar } from 'lucide-react';
import PaymentDialog from '@/components/PaymentDialog';
import { useToast } from '@/components/ui/use-toast';
import { useCallInitiator } from '@/lib/useCallInitiator';
import { useAppointmentCallGate } from '@/lib/useAppointmentCallGate';
import WaitingRoom from '@/components/WaitingRoom';

const tabs = ['all', 'pending', 'confirmed', 'completed', 'cancelled'];

export default function Appointments() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const { activeCall, startCallFromAppointment, endCall } = useCallInitiator();
  const gate = useAppointmentCallGate();
  const [payAppt, setPayAppt] = useState(null);
  const [sortDesc, setSortDesc] = useState(true);
  const [cancellingId, setCancellingId] = useState(null);

  useEffect(() => { if (user?.id) load(); }, [sortDesc, user?.id]);

  const load = async () => {
    try {
      const data = await base44.entities.Appointment.filter({ patient_id: user?.id }, sortDesc ? '-appointment_date' : 'appointment_date', 50);
      setAppointments(data);
    } catch { setAppointments([]); }
    finally { setLoading(false); }
  };

  const handleCancel = async (appt) => {
    if (cancellingId) return;
    if (!window.confirm('Cancel this appointment? This action cannot be undone.')) return;
    setCancellingId(appt.id);
    try {
      await base44.entities.Appointment.update(appt.id, { status: 'cancelled' });
      toast({ title: 'Appointment cancelled', description: `Your appointment with ${appt.doctor_name} has been cancelled.` });
      load();
    } catch (e) {
      console.error(e);
      toast({ title: 'Could not cancel appointment', variant: 'destructive' });
    } finally {
      setCancellingId(null);
    }
  };

  const filtered = tab === 'all' ? appointments : appointments.filter(a => a.status === tab);

  return (
    <Layout>
      <div className="space-y-4 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">My Appointments</h1>
          <button onClick={() => setSortDesc(!sortDesc)} className="p-2 rounded-full bg-card border border-border hover:bg-secondary active:scale-95 transition-all" title={sortDesc ? 'Sort oldest first' : 'Sort newest first'}>
            <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin">
          {tabs.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium capitalize whitespace-nowrap transition-all active:scale-95',
                tab === t
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground border border-border hover:bg-secondary'
              )}
            >
              {t}
              <span className="ml-1.5 text-[10px] opacity-70">
                {t === 'all' ? appointments.length : appointments.filter(a => a.status === t).length}
              </span>
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-32 rounded-2xl shimmer" />)}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((appt, i) => (
              <AppointmentCard
                key={appt.id}
                appointment={appt}
                onCancel={handleCancel}
                cancellingId={cancellingId}
                onPay={(a) => setPayAppt(a)}
                onVideoCall={(a) => gate.startGatedCall(a, { video: true })}
              />
            ))}
          </div>
        ) : (
          <div className="bg-card rounded-2xl shadow-card">
            <EmptyState
              icon={Calendar}
              title={`No ${tab !== 'all' ? tab : ''} appointments`}
              description="Book a consultation with a doctor to get started"
              actionLabel="Find a Doctor"
              onAction={() => window.location.href = '/doctors'}
            />
          </div>
        )}
      </div>

      {payAppt && (
        <PaymentDialog
          appointment={payAppt}
          open={!!payAppt}
          onClose={() => setPayAppt(null)}
          onPaid={load}
        />
      )}

      {gate.waitingRoom && (
        <WaitingRoom
          appointment={gate.waitingRoom.appointment}
          callType={gate.waitingRoom.callType}
          onJoin={gate.joinFromWaitingRoom}
          onClose={gate.closeWaitingRoom}
        />
      )}
    </Layout>
  );
}