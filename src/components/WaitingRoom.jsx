import React, { useState, useEffect } from 'react';
import { Clock, Video, Phone, X, Calendar } from 'lucide-react';

/**
 * Virtual Waiting Room — shown when a patient tries to start a call before
 * the scheduled appointment time. Shows a countdown and allows joining
 * once the appointment time arrives.
 *
 * Props:
 * - appointment: the appointment object { appointment_date, time_slot, status, doctor_name }
 * - onJoin: callback when the patient is allowed to join the call
 * - onClose: callback to close the waiting room
 * - callType: 'video' | 'audio'
 */
export default function WaitingRoom({ appointment, onJoin, onClose, callType = 'video' }) {
  const [now, setNow] = useState(new Date());
  const [canJoin, setCanJoin] = useState(false);
  const [tooEarly, setTooEarly] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!appointment) return null;

  // Parse the appointment start time
  // appointment_date is a DATE (stored as "YYYY-MM-DD" or Date object)
  // time_slot is a string like "09:00 AM"
  const apptDate = new Date(appointment.appointment_date);
  const timeSlot = appointment.time_slot || '';

  // Parse time_slot "09:00 AM" → hours and minutes
  const m = timeSlot.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  let apptStart = new Date(apptDate);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ap = m[3].toUpperCase();
    if (ap === 'PM' && h !== 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    apptStart.setHours(h, min, 0, 0);
  }

  const EARLY_BUFFER_MS = 10 * 60 * 1000; // 10 minutes
  const earlyEntryTime = new Date(apptStart.getTime() - EARLY_BUFFER_MS);

  const msUntilStart = apptStart.getTime() - now.getTime();
  const isEarly = now.getTime() < earlyEntryTime.getTime();
  const canEnterWaitingRoom = now.getTime() >= earlyEntryTime.getTime();
  const isTimeToJoin = now.getTime() >= apptStart.getTime();

  // Check if appointment is still active
  const isActive = ['confirmed', 'in_progress', 'pending'].includes(appointment.status);

  useEffect(() => {
    setCanJoin(isTimeToJoin && isActive);
    setTooEarly(isEarly);
  }, [isTimeToJoin, isActive, isEarly]);

  // Format countdown
  const formatCountdown = (ms) => {
    if (ms <= 0) return 'Now';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  // If appointment is completed/cancelled
  if (!isActive) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
        <div className="bg-card rounded-2xl shadow-xl max-w-md w-full p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-muted/20 flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-bold mb-2">Appointment {appointment.status}</h2>
          <p className="text-sm text-muted-foreground mb-6">
            This appointment has been {appointment.status}. Please book a new appointment to continue.
          </p>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // If too early (>10 min before appointment)
  if (tooEarly) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
        <div className="bg-card rounded-2xl shadow-xl max-w-md w-full p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-lg font-bold mb-2">Too Early to Join</h2>
          <p className="text-sm text-muted-foreground mb-2">
            Your appointment with <strong>{appointment.doctor_name}</strong> is scheduled for:
          </p>
          <p className="text-base font-bold text-primary mb-4">
            {apptStart.toLocaleDateString()} at {apptStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            You can enter the waiting room 10 minutes before your appointment time. Please check back then.
          </p>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-secondary text-foreground font-semibold text-sm hover:bg-secondary/80 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Waiting room — within 10 min of appointment, or appointment time has arrived
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-xl max-w-md w-full p-6 text-center">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Virtual Waiting Room</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          {callType === 'video'
            ? <Video className="w-10 h-10 text-primary" />
            : <Phone className="w-10 h-10 text-primary" />}
        </div>

        <p className="text-sm text-muted-foreground mb-2">
          {callType === 'video' ? 'Video' : 'Voice'} call with <strong>{appointment.doctor_name}</strong>
        </p>

        <p className="text-base font-bold text-primary mb-4">
          {apptStart.toLocaleDateString()} at {apptStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>

        {canJoin ? (
          <>
            <div className="p-4 rounded-xl bg-green-50 border border-green-200 mb-4">
              <p className="text-sm font-semibold text-green-700">It's time for your appointment!</p>
              <p className="text-xs text-green-600 mt-1">You can now join the call.</p>
            </div>
            <button
              onClick={onJoin}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors active:scale-95"
            >
              {callType === 'video' ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
              Join {callType === 'video' ? 'Video' : 'Voice'} Call
            </button>
          </>
        ) : (
          <>
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 mb-4">
              <p className="text-xs text-amber-600 mb-1">Your appointment starts in</p>
              <p className="text-3xl font-bold text-amber-700 font-mono tabular-nums">
                {formatCountdown(msUntilStart)}
              </p>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              The call button will activate when your appointment time arrives. Please wait here.
            </p>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5 animate-pulse" />
              <span>Waiting...</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
