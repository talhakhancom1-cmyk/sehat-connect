import React, { useState } from 'react';
import { Video, MessageSquare, Home, Building2, Phone, Clock, Calendar, MessageCircle, ShieldCheck, CreditCard, CheckCircle2, PlayCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { getOrCreateForAppointment } from '@/lib/conversations';
import { useAppointmentCallGate } from '@/lib/useAppointmentCallGate';
import WaitingRoom from '@/components/WaitingRoom';
import DoctorAvatar from '@/components/DoctorAvatar';
import StatusBadge from '@/components/StatusBadge';
import { cn, formatAppointmentDate } from '@/lib/utils';

const typeConfig = {
  video: { icon: Video, label: 'Video' },
  audio: { icon: Phone, label: 'Audio' },
  chat: { icon: MessageSquare, label: 'Chat' },
  physical: { icon: Building2, label: 'In-person' },
  home: { icon: Home, label: 'Home visit' },
  emergency: { icon: Phone, label: 'Emergency' },
};

const typeBorder = {
  video: 'border-l-primary',
  audio: 'border-l-blue-400',
  chat: 'border-l-purple-400',
  physical: 'border-l-amber-400',
  home: 'border-l-green-400',
  emergency: 'border-l-red-400',
};

export default function AppointmentCard({ appointment, onJoin, onCancel, onVideoCall, onPay, role = 'patient' }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const gate = useAppointmentCallGate();
  const [openingChat, setOpeningChat] = useState(false);
  const type = typeConfig[appointment.type] || typeConfig.video;
  const name = role === 'doctor' ? appointment.patient_name : appointment.doctor_name;
  const subtitle = role === 'doctor' ? appointment.patient_age ? `${appointment.patient_age}y · ${type.label}` : type.label : type.label;
  const fee = appointment.consultation_fee;
  const canJoinCall = appointment.status === 'confirmed' && appointment.type === 'video';
  const callGate = role === 'patient' ? gate.getCallGateState(appointment) : null;

  const openChat = async () => {
    if (openingChat) return;
    setOpeningChat(true);
    try {
      const convo = await getOrCreateForAppointment(appointment, user);
      if (convo) navigate(`/chat/${convo.id}`);
    } catch (e) {
      console.error(e);
    } finally {
      setOpeningChat(false);
    }
  };

  return (
    <div className={cn(
      'rounded-2xl border border-border bg-card p-4 shadow-card hover:shadow-soft hover:-translate-y-0.5 transition-all duration-200 animate-slide-up border-l-[3px]',
      typeBorder[appointment.type] || 'border-l-primary'
    )}>
      <div className="flex items-start gap-3">
        {role === 'patient' && appointment.doctor_id ? (
          <Link to={`/doctors/${appointment.doctor_id}`}>
            <DoctorAvatar name={name} imageUrl={appointment.doctor_image} size="lg" />
          </Link>
        ) : (
          <DoctorAvatar name={name} imageUrl={role === 'doctor' ? appointment.patient_image : appointment.doctor_image} size="lg" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-bold text-sm truncate">{name}</p>
            <StatusBadge status={appointment.status} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 capitalize">{subtitle}</p>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
            <Calendar className="w-3.5 h-3.5" />
            <span>{formatAppointmentDate(appointment.appointment_date)}</span>
            <span className="mx-0.5">·</span>
            <Clock className="w-3.5 h-3.5" />
            <span>{appointment.time_slot}</span>
          </div>
        </div>

        <button
          onClick={openChat}
          disabled={openingChat}
          className="p-2 rounded-full bg-secondary hover:bg-secondary/70 transition-colors shrink-0 active:scale-95 disabled:opacity-40"
        >
          <MessageCircle className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {fee && (
        <div className="flex items-center gap-2 mt-2">
          <p className="text-xs font-bold text-foreground">Rs {fee.toLocaleString()}</p>
          {appointment.payment_status === 'paid' && (
            <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-semibold">
              <ShieldCheck className="w-3 h-3" /> Paid
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/60">
        {canJoinCall && role === 'patient' && callGate?.status === 'too_early' && (
          <button
            disabled
            className="flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl bg-gray-200 text-gray-500 text-xs font-semibold cursor-not-allowed"
          >
            <span className="flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5" />
              Join Call
            </span>
            <span className="text-[9px] font-normal">10 min before</span>
          </button>
        )}
        {canJoinCall && !(role === 'patient' && callGate?.status === 'too_early') && (
          <button
            onClick={() => {
              if (role === 'patient') {
                gate.startGatedCall(appointment, { video: true });
              } else {
                onVideoCall?.(appointment);
              }
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 active:scale-95 transition-all"
          >
            <Video className="w-3.5 h-3.5" />
            Join Call
          </button>
        )}
        {appointment.status === 'pending' && role === 'doctor' && (
          <>
            <button
              onClick={() => onJoin?.(appointment, 'confirmed')}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 active:scale-95 transition-all"
            >
              Accept
            </button>
            <button
              onClick={() => onCancel?.(appointment, 'rejected')}
              className="px-4 py-2 rounded-xl bg-red-50 text-red-600 border border-red-100 text-xs font-semibold hover:bg-red-100 active:scale-95 transition-all"
            >
              Reject
            </button>
          </>
        )}
        {appointment.status === 'confirmed' && role === 'doctor' && (
          <button
            onClick={() => onJoin?.(appointment, 'in_progress')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 active:scale-95 transition-all"
          >
            <PlayCircle className="w-3.5 h-3.5" />
            Start
          </button>
        )}
        {appointment.status === 'in_progress' && role === 'doctor' && (
          <button
            onClick={() => onJoin?.(appointment, 'completed')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-600 text-white text-xs font-semibold hover:bg-green-700 active:scale-95 transition-all"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Complete
          </button>
        )}
        {['pending', 'confirmed'].includes(appointment.status) && role === 'patient' && appointment.payment_status !== 'paid' && (
          <button
            onClick={() => onPay?.(appointment)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 active:scale-95 transition-all"
          >
            <CreditCard className="w-3.5 h-3.5" /> Pay now
          </button>
        )}
        {['pending', 'confirmed'].includes(appointment.status) && role === 'patient' && (
          <button
            onClick={() => onCancel?.(appointment)}
            className="ml-auto px-4 py-2 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:bg-secondary active:scale-95 transition-all"
          >
            Cancel
          </button>
        )}
        {appointment.status === 'completed' && (
          <button className="ml-auto px-4 py-2 rounded-xl text-xs font-medium text-primary hover:bg-primary/10 active:scale-95 transition-all">
            View Summary
          </button>
        )}
      </div>

      {gate.waitingRoom && (
        <WaitingRoom
          appointment={gate.waitingRoom.appointment}
          callType={gate.waitingRoom.callType}
          onJoin={gate.joinFromWaitingRoom}
          onClose={gate.closeWaitingRoom}
        />
      )}
    </div>
  );
}