import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useRole } from '@/lib/useRole';
import { useCall } from '@/lib/CallContext';
import Layout from '@/components/Layout';
import DoctorAvatar from '@/components/DoctorAvatar';
import VoiceRecorder from '@/components/chat/VoiceRecorder';
import VoiceMessage from '@/components/chat/VoiceMessage';
import WaitingRoom from '@/components/WaitingRoom';
import { otherParty, listMessages, sendMessage, markConversationRead } from '@/lib/conversations';
import { createNotification } from '@/lib/notifications';
import { joinConversation, leaveConversation } from '@/lib/socketClient';
import { ChevronLeft, Send, Check, CheckCheck, Phone, PhoneMissed, PhoneIncoming, PhoneOutgoing, Video } from 'lucide-react';
import { cn } from '@/lib/utils';

// Stable chronological sort by created_date only.
// Array.prototype.sort is stable (Timsort), so messages with the same timestamp
// keep their insertion order — which preserves the correct send sequence even
// when several messages land in the same second.
const byDate = (a, b) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime();

export default function ChatThread() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const callCtx = useCall();

  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [waitingRoom, setWaitingRoom] = useState(null); // { callType: 'video'|'audio' }
  const [appointment, setAppointment] = useState(null);
  const messagesEndRef = useRef(null);

  const { role } = useRole();

  useEffect(() => {
    if (!user?.id || !conversationId) return;
    let alive = true;
    const load = async () => {
      try {
        const convo = await base44.entities.Conversation.get(conversationId).catch(() => null);
        if (!alive) return;
        setConversation(convo);
        // Fetch the appointment linked to this conversation (for waiting room)
        if (convo?.appointment_id) {
          const appt = await base44.entities.Appointment.get(convo.appointment_id).catch(() => null);
          if (alive && appt) setAppointment(appt);
        }
        const msgs = await listMessages(conversationId);
        if (!alive) return;
        setMessages([...msgs].sort(byDate));
        await markConversationRead(conversationId, user.id);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();

    // Join the Socket.IO room for this conversation so message:new events for it
    // reach this client in real time (falls back to the poll below if unavailable).
    joinConversation(conversationId);

    const unsubscribe = base44.entities.Message.subscribe((event) => {
      if (event.type === 'create') {
        const msg = event.data;
        if (msg.conversation_id === conversationId) {
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg].sort(byDate);
          });
          // Call signaling is now handled via the WebSocket signaling server
          // (see the call:ringing listener effect above). We still mark
          // incoming messages as read here.
          if (msg.receiver_id === user.id && !msg.read) {
            base44.entities.Message.update(msg.id, { read: true }).catch(() => {});
          }
        }
      }
    });

    const pollInterval = setInterval(async () => {
      const msgs = await listMessages(conversationId);
      setMessages(prev => {
        const prevIds = new Set(prev.map(m => m.id));
        const fresh = msgs.filter(m => !prevIds.has(m.id));
        if (!fresh.length) return prev;
        for (const m of fresh.filter(x => x.receiver_id === user.id && !x.read)) {
          base44.entities.Message.update(m.id, { read: true }).catch(() => {});
        }
        return [...prev, ...fresh].sort(byDate);
      });
    }, 4000);

    return () => {
      alive = false;
      unsubscribe();
      leaveConversation(conversationId);
      clearInterval(pollInterval);
    };
  }, [user?.id, conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const other = otherParty(conversation, user?.id);
  const otherImageUrl = other?.role === 'doctor' ? conversation?.doctor_image : conversation?.patient_image;

  const handleSend = async () => {
    if (!input.trim() || !user?.id || !conversation) {
      console.warn('[ChatThread] handleSend skipped:', { hasInput: !!input.trim(), hasUser: !!user?.id, hasConversation: !!conversation });
      return;
    }
    const content = input.trim();
    setInput('');
    setSending(true);
    try {
      const msg = await sendMessage(conversation, user, content);
      if (!msg || !msg.id) {
        console.error('[ChatThread] sendMessage returned invalid response:', msg);
        return;
      }
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg].sort(byDate);
      });
      // Notify the other party of the new message
      const other = otherParty(conversation, user?.id);
      if (other?.id) {
        createNotification(other.id, 'chat', `New message from ${user?.display_name || user?.email || 'User'}`, content.slice(0, 80), {
          priority: 'normal',
          data: { conversation_id: conversation.id, appointment_id: conversation.appointment_id },
        });
      }
    } catch (e) {
      console.error('[ChatThread] handleSend error:', e);
      // Restore the input so the user doesn't lose their message
      setInput(content);
    } finally {
      setSending(false);
    }
  };

  const handleSendVoice = async (fileUrl, secs) => {
    if (!user?.id || !conversation) return;
    setSending(true);
    try {
      const msg = await sendMessage(conversation, user, `Voice note (${secs}s)`, { type: 'audio', attachment_url: fileUrl });
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg].sort(byDate);
      });
      const op = otherParty(conversation, user?.id);
      if (op?.id) {
        createNotification(op.id, 'chat', `Voice note from ${user?.display_name || user?.email || 'User'}`, 'Voice message', {
          priority: 'normal',
          data: { conversation_id: conversation.id, appointment_id: conversation.appointment_id },
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const handleStartCall = async (video = false) => {
    console.log('[ChatThread] handleStartCall clicked', { callCtx: !!callCtx, conversation: !!conversation, other, user: user?.id, video });
    if (!callCtx) {
      alert('Call system not available. Please refresh the page.');
      return;
    }

    // If the user is a patient and there's an appointment, check the waiting room logic
    const isDoctor = user?.role === 'doctor' || user?.app_role === 'doctor' || role === 'doctor';
    if (!isDoctor && appointment) {
      // Check if the appointment time has arrived
      const apptDate = new Date(appointment.appointment_date);
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

      const now = new Date();
      const EARLY_BUFFER_MS = 10 * 60 * 1000; // 10 minutes
      const earlyEntryTime = new Date(apptDate.getTime() - EARLY_BUFFER_MS);
      const isActive = ['confirmed', 'in_progress', 'pending'].includes(appointment.status);

      if (isActive && now.getTime() < apptDate.getTime()) {
        // Show waiting room (patient is within 10 min or too early)
        if (now.getTime() >= earlyEntryTime.getTime()) {
          // Within 10 min — show waiting room with countdown
          setWaitingRoom({ callType: video ? 'video' : 'audio' });
          return;
        } else {
          // Too early — show waiting room (it will show "too early" message)
          setWaitingRoom({ callType: video ? 'video' : 'audio' });
          return;
        }
      } else if (!isActive) {
        // Appointment not active — show waiting room (it will show "ended" message)
        setWaitingRoom({ callType: video ? 'video' : 'audio' });
        return;
      }
      // Appointment time has arrived and is active — proceed with call
    }

    await callCtx.startCall(conversation, other, user, { video });
  };

  const handleJoinFromWaitingRoom = async () => {
    const video = waitingRoom?.callType === 'video';
    setWaitingRoom(null);
    if (!callCtx) {
      alert('Call system not available. Please refresh the page.');
      return;
    }
    await callCtx.startCall(conversation, other, user, { video });
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateDivider = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString();
  };

  return (
    <Layout role={role}>
      <div className="flex flex-col h-[calc(100vh-200px)] lg:h-[calc(100vh-120px)] animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-3 pb-3 border-b border-border">
          <button onClick={() => navigate('/chat')} className="p-2 rounded-full hover:bg-secondary active:scale-95 transition-all">
            <ChevronLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <DoctorAvatar name={other.name} imageUrl={otherImageUrl} size="md" round />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{other.name}</p>
            <p className="text-[10px] text-muted-foreground">Conversation</p>
          </div>
          <button
            onClick={() => handleStartCall(false)}
            className="p-2.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition-all"
            title="Voice call"
          >
            <Phone className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleStartCall(true)}
            className="p-2.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition-all"
            title="Video call"
          >
            <Video className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto scrollbar-thin py-4 space-y-2">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-end' : 'justify-start')}>
                  <div className="h-12 w-48 rounded-2xl shimmer" />
                </div>
              ))}
            </div>
          ) : messages.length > 0 ? (
            messages.map((msg, i) => {
              const isMe = msg.sender_id === user?.id;
              const showDateDivider = i === 0 || formatDateDivider(messages[i - 1].created_date) !== formatDateDivider(msg.created_date);
              return (
                <React.Fragment key={msg.id}>
                  {showDateDivider && (
                    <div className="flex items-center justify-center my-3">
                      <span className="text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                        {formatDateDivider(msg.created_date)}
                      </span>
                    </div>
                  )}
                  <div className={cn('flex animate-slide-up', isMe ? 'justify-end' : 'justify-start')}>
                    <div className={cn(
                      'max-w-[75%] px-3 py-2 rounded-2xl text-sm',
                      isMe
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-secondary text-foreground rounded-bl-md'
                    )}>
                      {msg.type === 'audio' && msg.attachment_url ? (
                        <VoiceMessage url={msg.attachment_url} mine={isMe} />
                      ) : msg.type === 'call' ? (
                        <CallLogBubble msg={msg} isMe={isMe} />
                      ) : msg.type === 'system' ? (
                        // Legacy system messages (e.g. old call signals) are shown
                        // as plain text — call signaling now uses WebSockets.
                        <p className="italic opacity-80">{msg.content}</p>
                      ) : (
                        <p>{msg.content}</p>
                      )}
                      <div className={cn(
                        'flex items-center gap-1 mt-1',
                        isMe ? 'justify-end' : 'justify-start'
                      )}>
                        <span className={cn('text-[10px] font-medium', isMe ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                          {formatTime(msg.created_date)}
                        </span>
                        {isMe && (
                          <span className={cn('flex items-center', msg.read ? 'text-primary-foreground/80' : 'text-primary-foreground/50')}>
                            {msg.read
                              ? <CheckCheck className="w-3 h-3" strokeWidth={2.5} />
                              : <Check className="w-3 h-3" strokeWidth={2.5} />
                            }
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">No messages yet. Say hello!</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="flex items-center gap-2 pt-3 border-t border-border">
          <VoiceRecorder onSend={handleSendVoice} disabled={sending || !conversation} />
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Type a message…"
            className="flex-1 px-4 py-2.5 rounded-xl bg-card border border-border text-sm outline-none focus:border-primary/30"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending || !conversation}
            className="p-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Virtual Waiting Room — shown when patient tries to call before appointment time */}
      {waitingRoom && appointment && (
        <WaitingRoom
          appointment={appointment}
          callType={waitingRoom.callType}
          onJoin={handleJoinFromWaitingRoom}
          onClose={() => setWaitingRoom(null)}
        />
      )}
    </Layout>
  );
}

function CallLogBubble({ msg, isMe }) {
  const status = msg.call_status || 'initiated';
  const direction = msg.call_direction || (isMe ? 'outgoing' : 'incoming');
  const callType = msg.call_type || 'audio';
  const duration = msg.call_duration || 0;

  const isVideo = callType === 'video';
  const isMissed = status === 'missed';
  const isDeclined = status === 'declined';
  const isEnded = status === 'ended' && duration > 0;
  const isInitiated = status === 'initiated' || status === 'connected';

  const Icon = isMissed ? PhoneMissed
    : isVideo ? Video
    : direction === 'outgoing' ? PhoneOutgoing
    : PhoneIncoming;

  const label = isMissed ? 'Missed call'
    : isDeclined ? 'Call declined'
    : isEnded ? `Call ended - ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`
    : isInitiated ? `${isVideo ? 'Video' : 'Voice'} call`
    : msg.content || 'Call';

  const color = isMissed || isDeclined
    ? 'text-red-500'
    : isMe ? 'text-primary-foreground' : 'text-primary';

  return (
    <div className="flex items-center gap-2 py-0.5">
      <Icon className={cn('w-4 h-4 shrink-0', color)} />
      <span className={cn('text-sm font-medium', color)}>{label}</span>
    </div>
  );
}