import { useCallback } from 'react';
import { useCall } from '@/lib/CallContext';
import { getOrCreateForAppointment } from '@/lib/conversations';

/**
 * Reusable hook for initiating a video (or audio) call from an appointment
 * context. Used by Home, Appointments, and DoctorAppointments pages.
 *
 * Delegates the actual call lifecycle to the global CallContext so that
 * incoming calls are handled consistently across all pages.
 *
 * Returns:
 *   { activeCall, startCallFromAppointment, endCall }
 *
 * `activeCall` is null or { callId, role, remoteUserId, video }
 * The global <GlobalCallOverlay> renders the call UI — pages no longer
 * need to render <VideoCall> themselves.
 */
export function useCallInitiator() {
  const callCtx = useCall();

  const startCallFromAppointment = useCallback(async (appointment, user, { video = true } = {}) => {
    if (!callCtx) {
      alert('Call system not available. Please refresh the page.');
      return;
    }
    if (!appointment || !user?.id) return;

    // Determine the other party's user id.
    // The patient calls the doctor; the doctor calls the patient.
    const isDoctor = appointment.doctor_user_id === user.id;
    const remoteUserId = isDoctor ? appointment.patient_id : (appointment.doctor_user_id || appointment.created_by_id);
    if (!remoteUserId) {
      alert('Could not identify the other participant for this call.');
      return;
    }

    // Ensure a conversation exists for this appointment (so the call is
    // associated with a chat thread). This is best-effort — if it fails
    // we still initiate the call without a conversation_id.
    let conversation = null;
    try {
      conversation = await getOrCreateForAppointment(appointment, user);
    } catch { /* best-effort */ }

    const otherUser = {
      id: remoteUserId,
      name: isDoctor ? appointment.patient_name : appointment.doctor_name,
      role: isDoctor ? 'patient' : 'doctor',
    };

    await callCtx.startCall(conversation, otherUser, user, { video });
  }, [callCtx]);

  const endCall = useCallback(async () => {
    if (callCtx) await callCtx.endCall();
  }, [callCtx]);

  // Expose activeCall from the global context so pages can check if a call
  // is in progress (e.g. to disable a "Start call" button).
  const activeCall = callCtx?.activeCall || null;

  return { activeCall, startCallFromAppointment, endCall };
}
