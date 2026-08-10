import { useState, useCallback, useRef } from 'react';
import { getCallSocket, initiateCall, cancelCall } from '@/lib/callSocket';
import { getOrCreateForAppointment } from '@/lib/conversations';

/**
 * Reusable hook for initiating a video (or audio) call from an appointment
 * context. Used by Home, Appointments, and DoctorAppointments pages.
 *
 * Returns:
 *   { activeCall, startCallFromAppointment, endCall }
 *
 * `activeCall` is null or { callId, role, remoteUserId, displayName, otherName }
 * Render <VideoCall {...activeCall} onClose={endCall} /> when activeCall is set.
 */
export function useCallInitiator() {
  const [activeCall, setActiveCall] = useState(null);
  const startingRef = useRef(false);

  const startCallFromAppointment = useCallback(async (appointment, user, { video = true } = {}) => {
    if (startingRef.current || activeCall) return;
    if (!appointment || !user?.id) return;
    startingRef.current = true;

    try {
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
      let conversationId = null;
      try {
        const convo = await getOrCreateForAppointment(appointment, user);
        conversationId = convo?.id || null;
      } catch { /* best-effort */ }

      const socket = getCallSocket();
      const res = await initiateCall(socket, {
        to_user_id: remoteUserId,
        call_type: video ? 'video' : 'audio',
        conversation_id: conversationId,
        appointment_id: appointment.id,
      });

      const otherName = isDoctor ? appointment.patient_name : appointment.doctor_name;
      setActiveCall({
        callId: res.call_id,
        role: 'caller',
        remoteUserId,
        displayName: user?.full_name || user?.email,
        doctorName: otherName, // VideoCall uses doctorName for the title
        otherName,
      });
    } catch (e) {
      console.error('Failed to start call:', e);
      alert(e.message || 'Could not start the call. Please try again.');
    } finally {
      startingRef.current = false;
    }
  }, [activeCall]);

  const endCall = useCallback(async () => {
    if (activeCall?.callId) {
      try {
        const socket = getCallSocket();
        await cancelCall(socket, activeCall.callId);
      } catch { /* best-effort */ }
    }
    setActiveCall(null);
  }, [activeCall]);

  return { activeCall, startCallFromAppointment, endCall };
}
