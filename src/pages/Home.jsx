import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import Layout from '@/components/Layout';
import DoctorAvatar from '@/components/DoctorAvatar';
import EmptyState from '@/components/EmptyState';
import { useToast } from '@/components/ui/use-toast';
import { Calendar, Clock, HeartPulse, MessageCircle, Stethoscope, Baby, Brain, Eye, Star, Video, BadgeCheck, FileText, Pill, QrCode } from 'lucide-react';
import { cn, formatAppointmentDate } from '@/lib/utils';
import { getOrCreateForAppointment } from '@/lib/conversations';
import { useCallInitiator } from '@/lib/useCallInitiator';
import { useAppointmentCallGate } from '@/lib/useAppointmentCallGate';
import WaitingRoom from '@/components/WaitingRoom';

const specialties = [
  { name: 'Cardiology', icon: HeartPulse, color: 'bg-rose-50 text-rose-500' },
  { name: 'Pediatrics', icon: Baby, color: 'bg-amber-50 text-amber-500' },
  { name: 'Neurology', icon: Brain, color: 'bg-purple-50 text-purple-600' },
  { name: 'Ophthalmology', icon: Eye, color: 'bg-teal-50 text-teal-600' },
];

export default function Home() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const { activeCall, startCallFromAppointment, endCall } = useCallInitiator();
  const gate = useAppointmentCallGate();
  const [openingChat, setOpeningChat] = useState(false);

  useEffect(() => { if (user?.id) loadData(); }, [user?.id]);

  const openChat = async () => {
    if (!nextAppt || openingChat) return;
    setOpeningChat(true);
    try {
      const convo = await getOrCreateForAppointment(nextAppt, user);
      if (convo) navigate(`/chat/${convo.id}`);
    } catch (e) {
      console.error(e);
      toast({ title: 'Could not open chat', description: 'Please try again.' });
    } finally {
      setOpeningChat(false);
    }
  };

  const loadData = async () => {
    try {
      const [appts, docs] = await Promise.all([
        base44.entities.Appointment.filter({ patient_id: user?.id }, '-appointment_date', 10).catch(() => []),
        base44.entities.Doctor.filter({ verification_status: 'verified' }, '-rating', 5).catch(() => []),
      ]);
      setAppointments(appts);
      setDoctors(docs);
    } finally { setLoading(false); }
  };

  const upcomingAppts = appointments.filter(a => ['pending', 'confirmed'].includes(a.status));
  const nextAppt = upcomingAppts[0];
  const name = user?.display_name?.split(' ')[0] || user?.full_name?.split(' ')[0] || 'there';
  const canJoinCall = nextAppt?.status === 'confirmed' && nextAppt?.type === 'video';
  const callGate = nextAppt ? gate.getCallGateState(nextAppt) : null;

  return (
    <Layout>
      <div className="space-y-5 animate-fade-in">
        {/* Next Appointment Hero Card */}
        {loading ? (
          <div className="bg-white rounded-3xl h-36 shimmer" />
        ) : nextAppt ? (
          <div className="bg-white rounded-3xl p-5 shadow-warm animate-slide-up">
            <div className="flex items-center gap-4">
              <DoctorAvatar name={nextAppt.doctor_name} imageUrl={nextAppt.doctor_image} size="lg" round className="ring-2 ring-[#D97757]/20" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-base text-[#1A1A1A] truncate">{nextAppt.doctor_name}</p>
                <p className="text-xs text-muted-foreground">Doctor</p>
                <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{formatAppointmentDate(nextAppt.appointment_date)}</span>
                  <span className="mx-0.5">·</span>
                  <Clock className="w-3.5 h-3.5" />
                  <span>{nextAppt.time_slot}</span>
                </div>
              </div>
              <button
                onClick={openChat}
                disabled={openingChat}
                className="p-2.5 rounded-full bg-[#F7F1EA] hover:bg-[#D97757]/10 transition-colors shrink-0 active:scale-95 disabled:opacity-50"
              >
                <MessageCircle className="w-4 h-4 text-[#D97757]" />
              </button>
            </div>
            <div className="flex gap-2.5 mt-4">
              <button
                onClick={async () => {
                  if (!window.confirm('Cancel this appointment? This action cannot be undone.')) return;
                  await base44.entities.Appointment.update(nextAppt.id, { status: 'cancelled' });
                  toast({ title: 'Appointment cancelled', description: `Your appointment with ${nextAppt.doctor_name} has been cancelled.` });
                  loadData();
                }}
                className="flex-1 py-2.5 rounded-2xl border border-[#E7DDD2] text-sm font-medium text-[#6B5B4F] hover:bg-[#F7F1EA] active:scale-95 transition-all"
              >
                Cancel
              </button>
              {canJoinCall ? (
                <>
                  {callGate?.status === 'too_early' ? (
                    <button
                      disabled
                      className="flex-1 py-2.5 rounded-2xl bg-gray-300 text-gray-500 text-sm font-semibold cursor-not-allowed flex flex-col items-center justify-center gap-0.5"
                    >
                      <span className="flex items-center gap-1.5">
                        <Video className="w-4 h-4" />
                        Join Call
                      </span>
                      <span className="text-[10px] font-normal">Available 10 min before</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => gate.startGatedCall(nextAppt, { video: true })}
                      className="flex-1 py-2.5 rounded-2xl bg-[#D97757] text-white text-sm font-semibold hover:bg-[#C9683F] active:scale-95 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Video className="w-4 h-4" />
                      Join Call
                    </button>
                  )}
                </>
              ) : (
                <Link
                  to="/appointments"
                  className="flex-1 py-2.5 rounded-2xl bg-[#D97757] text-white text-sm font-semibold text-center hover:bg-[#C9683F] active:scale-95 transition-all"
                >
                  Appointment Details
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-5 shadow-warm animate-slide-up">
            <EmptyState
              icon={Calendar}
              title="No upcoming appointments"
              description="Find a doctor and book your next consultation"
              actionLabel="Find a Doctor"
              onAction={() => navigate('/doctors')}
            />
          </div>
        )}

        {/* Emergency Banner */}
        <div className="bg-[#D62846] rounded-3xl p-4 flex items-center justify-between animate-slide-up" style={{ animationDelay: '60ms' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <HeartPulse className="w-5 h-5 text-white animate-heartbeat" />
            </div>
            <div>
              <p className="text-white font-bold text-sm">Emergency Doctor</p>
              <p className="text-white/80 text-xs">Available 24/7 for you</p>
            </div>
          </div>
          <Link
            to="/doctors"
            className="bg-white text-[#D62846] px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-white/90 active:scale-95 transition-all"
          >
            Search Doctor
          </Link>
        </div>

        {/* Medical Specialities */}
        <div className="animate-slide-up" style={{ animationDelay: '120ms' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-base text-[#1A1A1A]">Medical Specialities</h2>
            <Link to="/doctors" className="text-[#D97757] text-sm font-medium">See All</Link>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {specialties.map(spec => (
              <button
                key={spec.name}
                onClick={() => navigate('/doctors')}
                className="flex flex-col items-center gap-2 active:scale-95 transition-transform"
              >
                <div className={cn('w-14 h-14 rounded-full flex items-center justify-center shadow-warm', spec.color)}>
                  <spec.icon className="w-6 h-6" strokeWidth={2} />
                </div>
                <span className="text-[11px] font-medium text-[#1A1A1A] text-center leading-tight">{spec.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Top Doctor */}
        <div className="animate-slide-up" style={{ animationDelay: '180ms' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-base text-[#1A1A1A]">Top Doctor</h2>
            <Link to="/doctors" className="text-[#D97757] text-sm font-medium">See All</Link>
          </div>
          {loading ? (
            <div className="bg-white rounded-3xl shadow-warm divide-y divide-[#F0E8DC]">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3 p-3.5">
                  <div className="w-10 h-10 rounded-full shimmer" />
                  <div className="flex-1 h-4 shimmer rounded" />
                </div>
              ))}
            </div>
          ) : doctors.length > 0 ? (
            <div className="bg-white rounded-3xl divide-y divide-[#F0E8DC] shadow-warm overflow-hidden">
              {doctors.map((doc, i) => (
                <Link
                  key={doc.id}
                  to={`/doctors/${doc.id}`}
                  className="flex items-center gap-3 p-3.5 hover:bg-[#FDF6EE] transition-colors animate-slide-up"
                  style={{ animationDelay: `${200 + i * 50}ms` }}
                >
                  <DoctorAvatar name={doc.full_name} imageUrl={doc.image_url} size="md" round isOnline={doc.is_online} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="font-semibold text-sm truncate text-[#1A1A1A]">{doc.full_name}</p>
                      {doc.verification_status === 'verified' && (
                        <BadgeCheck className="w-3.5 h-3.5 text-[#D97757] shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs text-muted-foreground">{doc.specialty}</p>
                      {Number(doc.rating || 0) >= 4.5 && Number(doc.total_reviews || 0) >= 10 && (
                        <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-600">
                          <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" /> Top Rated
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 bg-[#D97757] px-2 py-1 rounded-lg animate-pop-in">
                    <Star className="w-3 h-3 fill-white text-white" />
                    <span className="text-xs font-bold text-white">{Number(doc.rating || 0).toFixed(1)}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-3xl shadow-warm">
              <EmptyState icon={Stethoscope} title="No doctors available" description="Check back later" />
            </div>
          )}
        </div>

        {/* Quick Links */}
        <div className="animate-slide-up" style={{ animationDelay: '240ms' }}>
          <h2 className="font-bold text-base text-[#1A1A1A] mb-3">Quick Links</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link to="/prescriptions" className="bg-white rounded-3xl p-4 shadow-warm flex items-center gap-3 hover:shadow-warm-lg hover:-translate-y-0.5 transition-all active:scale-95">
              <div className="w-10 h-10 rounded-2xl bg-red-50 flex items-center justify-center">
                <HeartPulse className="w-5 h-5 text-red-500" />
              </div>
              <span className="text-sm font-medium text-[#1A1A1A]">Prescriptions</span>
            </Link>
            <Link to="/history" className="bg-white rounded-3xl p-4 shadow-warm flex items-center gap-3 hover:shadow-warm-lg hover:-translate-y-0.5 transition-all active:scale-95">
              <div className="w-10 h-10 rounded-2xl bg-teal-50 flex items-center justify-center">
                <Stethoscope className="w-5 h-5 text-teal-600" />
              </div>
              <span className="text-sm font-medium text-[#1A1A1A]">History</span>
            </Link>
            <Link to="/records" className="bg-white rounded-3xl p-4 shadow-warm flex items-center gap-3 hover:shadow-warm-lg hover:-translate-y-0.5 transition-all active:scale-95">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center">
                <FileText className="w-5 h-5 text-indigo-600" />
              </div>
              <span className="text-sm font-medium text-[#1A1A1A]">Records</span>
            </Link>
            <Link to="/medications" className="bg-white rounded-3xl p-4 shadow-warm flex items-center gap-3 hover:shadow-warm-lg hover:-translate-y-0.5 transition-all active:scale-95">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center">
                <Pill className="w-5 h-5 text-emerald-600" />
              </div>
              <span className="text-sm font-medium text-[#1A1A1A]">Medications</span>
            </Link>
            <Link to="/cards" className="bg-white rounded-3xl p-4 shadow-warm flex items-center gap-3 hover:shadow-warm-lg hover:-translate-y-0.5 transition-all active:scale-95">
              <div className="w-10 h-10 rounded-2xl bg-violet-50 flex items-center justify-center">
                <QrCode className="w-5 h-5 text-violet-600" />
              </div>
              <span className="text-sm font-medium text-[#1A1A1A]">Health Cards</span>
            </Link>
          </div>
        </div>
      </div>

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