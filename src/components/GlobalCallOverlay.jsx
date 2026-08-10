/**
 * Global call overlay — renders the incoming-call popup and the active
 * call UI at the app root level, so calls work from any page.
 *
 * Must be rendered inside <CallProvider> and <AuthProvider>.
 */
import React from 'react';
import { useCall } from '@/lib/CallContext';
import IncomingCallOverlay from '@/components/chat/IncomingCallOverlay';
import AudioCall from '@/components/chat/AudioCall';
import VideoCall from '@/components/VideoCall';

export default function GlobalCallOverlay() {
  const call = useCall();
  if (!call) return null;

  const { incomingCall, activeCall, callError, acceptCall, declineCall, endCall, cancelOutgoing, clearError } = call;

  // Active call takes priority — show the in-call UI.
  if (activeCall) {
    const callProps = {
      callId: activeCall.callId,
      role: activeCall.role,
      remoteUserId: activeCall.remoteUserId,
      otherName: activeCall.otherName || 'User',
      onClose: activeCall.role === 'caller' ? cancelOutgoing : endCall,
    };
    return activeCall.video
      ? <VideoCall {...callProps} />
      : <AudioCall {...callProps} />;
  }

  // Incoming call popup.
  if (incomingCall) {
    return (
      <IncomingCallOverlay
        callerName={incomingCall.callerName}
        callerImageUrl={incomingCall.callerImageUrl}
        callType={incomingCall.call_type}
        onAccept={acceptCall}
        onDecline={declineCall}
      />
    );
  }

  // Call error toast (auto-dismiss after 5s).
  if (callError) {
    return (
      <div className="fixed bottom-4 right-4 z-[70] bg-red-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-fade-in flex items-center gap-3">
        <span>{callError}</span>
        <button onClick={clearError} className="text-white/70 hover:text-white">✕</button>
      </div>
    );
  }

  return null;
}
