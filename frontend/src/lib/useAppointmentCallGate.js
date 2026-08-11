import { useState, useCallback, useRef } from 'react';
import { useCallInitiator } from '@/lib/useCallInitiator';
import { useAuth } from '@/lib/AuthContext';
import { useRole } from '@/lib/useRole';

/**
 * Shared appointment-time gate for ALL patient call entry points.
 *
 * Used by: Home, Appointments, AppointmentCard, ChatThread — so every place
 * a patient can start a call goes through the same 10-minute waiting-room rule.
 *
 * Doctors bypass the gate entirely (they can call at any time).
 *
 * Returns:
 *   - startGatedCall(appointment, { video }) — call this from any button
 *   - waitingRoom: { appointment, callType } | null — render <WaitingRoom> when set
 *   - closeWaitingRoom() — dismiss the waiting room
 *   - getCallGateState(appointment) — { status, apptStart, msUntilStart, canJoin, tooEarly } for UI
 *   - activeCall, endCall — passthrough from useCallInitiator
 */
export function useAppointmentCallGate() {
  const { user } = useAuth();
  const { role } = useRole();
  const { activeCall, startCallFromAppointment, endCall } = useCallInitiator();
  const [waitingRoom, setWaitingRoom] = useState(null);
  const gateLockRef = useRef(false);

  const isDoctor = user?.role === 'doctor' || user?.app_role === 'doctor' || role === 'doctor';

  /**
   * Parse an appointment's start time into a Date object.
   * appointment_date can be "2026-08-10" or a Date string.
   * time_slot is "02:30 PM" format.
   */
  const parseAppointmentStart = (appointment) => {
    const rawDate = appointment?.appointment_date;
    if (!rawDate) return null;
    const apptDate = new Date(rawDate);
    if (isNaN(apptDate.getTime())) return null;
    const timeSlot = appointment.time_slot || '';
    const m = timeSlot.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (m) {
      let h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      const ap = m[3].toUpperCase();
      if (ap === 'PM' && h !== 12) h += 12;
      if (ap === 'AM' && h === 12) h = 0;
      apptDate.setHours(h, min, 0, 0);
    }
    return apptDate;
  };

  /**
   * Returns the gate state for an appointment — used by UI to show
   * disabled buttons, countdowns, etc. without opening the waiting room.
   */
  const getCallGateState = useCallback((appointment) => {
    if (!appointment) return { status: 'no_appointment', canJoin: false, tooEarly: false, apptStart: null, msUntilStart: null };
    if (isDoctor) return { status: 'doctor', canJoin: true, tooEarly: false, apptStart: null, msUntilStart: null };

    const apptStart = parseAppointmentStart(appointment);
    if (!apptStart) return { status: 'invalid_date', canJoin: false, tooEarly: false, apptStart: null, msUntilStart: null };

    const now = Date.now();
    const EARLY_BUFFER_MS = 10 * 60 * 1000;
    const earlyEntryTime = apptStart.getTime() - EARLY_BUFFER_MS;
    const isActive = ['confirmed', 'in_progress', 'pending'].includes(appointment.status);

    if (!isActive) return { status: 'ended', canJoin: false, tooEarly: false, apptStart, msUntilStart: 0 };
    if (now < earlyEntryTime) return { status: 'too_early', canJoin: false, tooEarly: true, apptStart, msUntilStart: apptStart.getTime() - now };
    if (now < apptStart.getTime()) return { status: 'waiting', canJoin: false, tooEarly: false, apptStart, msUntilStart: apptStart.getTime() - now };
    return { status: 'can_join', canJoin: true, tooEarly: false, apptStart, msUntilStart: 0 };
  }, [isDoctor]);

  /**
   * Start a gated call — checks appointment time first.
   * If the patient is too early or within the 10-min window, shows the waiting room.
   * If the time has arrived (or the user is a doctor), starts the call directly.
   */
  const startGatedCall = useCallback(async (appointment, opts = {}) => {
    const video = opts.video !== false;
    console.log('[AppointmentCallGate] startGatedCall', { appointmentId: appointment?.id, video, isDoctor });

    if (!appointment || !user?.id) {
      console.warn('[AppointmentCallGate] missing appointment or user');
      return;
    }
    if (gateLockRef.current) {
      console.warn('[AppointmentCallGate] already gating a call, ignoring');
      return;
    }

    // Doctors bypass the gate entirely
    if (isDoctor) {
      console.log('[AppointmentCallGate] doctor user — bypassing gate');
      await startCallFromAppointment(appointment, user, { video });
      return;
    }

    const gate = getCallGateState(appointment);
    console.log('[AppointmentCallGate] gate state:', gate);

    if (gate.status === 'no_appointment' || gate.status === 'invalid_date') {
      // Can't determine time — proceed without gate (best-effort)
      console.warn('[AppointmentCallGate] cannot parse appointment time — proceeding without gate');
      await startCallFromAppointment(appointment, user, { video });
      return;
    }

    if (gate.status === 'ended') {
      // Show waiting room with "ended" state
      setWaitingRoom({ appointment, callType: video ? 'video' : 'audio' });
      return;
    }

    if (gate.status === 'too_early' || gate.status === 'waiting') {
      // Show waiting room with countdown
      setWaitingRoom({ appointment, callType: video ? 'video' : 'audio' });
      return;
    }

    // can_join — proceed with the call
    console.log('[AppointmentCallGate] time arrived — starting call');
    await startCallFromAppointment(appointment, user, { video });
  }, [user, isDoctor, startCallFromAppointment, getCallGateState]);

  const closeWaitingRoom = useCallback(() => {
    setWaitingRoom(null);
    gateLockRef.current = false;
  }, []);

  const joinFromWaitingRoom = useCallback(async () => {
    if (!waitingRoom) return;
    const { appointment, callType } = waitingRoom;
    const video = callType === 'video';
    setWaitingRoom(null);
    console.log('[AppointmentCallGate] joining from waiting room');
    await startCallFromAppointment(appointment, user, { video });
  }, [waitingRoom, user, startCallFromAppointment]);

  return {
    startGatedCall,
    waitingRoom,
    closeWaitingRoom,
    joinFromWaitingRoom,
    getCallGateState,
    activeCall,
    endCall,
    isDoctor,
  };
}
