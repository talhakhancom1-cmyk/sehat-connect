import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useRole } from '@/lib/useRole';
import Layout from '@/components/Layout';
import DoctorAvatar from '@/components/DoctorAvatar';
import VoiceRecorder from '@/components/chat/VoiceRecorder';
import VoiceMessage from '@/components/chat/VoiceMessage';
import AudioCall from '@/components/chat/AudioCall';
import IncomingCallOverlay from '@/components/chat/IncomingCallOverlay';
import { otherParty, listMessages, sendMessage, markConversationRead } from '@/lib/conversations';
import { createNotification } from '@/lib/notifications';
import { joinConversation, leaveConversation } from '@/lib/socketClient';
import { buildCallRoomName } from '@/components/chat/AudioCall';
import { ChevronLeft, Send, Check, CheckCheck, Phone, PhoneIncoming } from 'lucide-react';
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

  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const [callRoom, setCallRoom] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null); // { room, callerName } when receiving
  const messagesEndRef = useRef(null);
  const initiatingCallRef = useRef(false);
  // Refs mirror the call state so the message-subscription callback (which captures
  // values at effect-setup time) always reads the current values.
  const showCallRef = useRef(false);
  const incomingCallRef = useRef(null);https://www.youtube.com/watch?v=saOHY9ZHyiI&list=RDsaOHY9ZHyiI&start_radio=1&pp=oAcB
  useEffect(() => { showCallRef.current = showCall; }, [showCall]);
  useEffect(() => { incomingCallRef.current = incomingCall; }, [incomingCall]);

  const closeCall = () => {
    setShowCall(false);
    setCallRoom(null);
    initiatingCallRef.current = false;
  };

  const { role } = useRole();

  useEffect(() => {
    if (!user?.id || !conversationId) return;
    let alive = true;
    const load = async () => {
      try {
        const convo = await base44.entities.Conversation.get(conversationId).catch(() => null);
        if (!alive) return;
        setConversation(convo);
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
          // Incoming voice call signal from the other party.
          if (msg.type === 'system' && msg.sender_id !== user.id) {
            if (msg.attachment_url && !initiatingCallRef.current && !showCallRef.current && !incomingCallRef.current) {
              // New call invitation → show the Accept / Decline overlay (do NOT auto-join).
              setIncomingCall({ room: msg.attachment_url, callerName: msg.sender_name || otherParty(conversation, user.id).name });
            } else if (msg.content === '📵 Call declined' && showCallRef.current) {
              // The other party declined our outgoing call → close it.
              closeCall();
            }
          }
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

  const handleSend = async () => {
    if (!input.trim() || !user?.id || !conversation) return;
    const content = input.trim();
    setInput('');
    setSending(true);
    try {
      const msg = await sendMessage(conversation, user, content);
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg].sort(byDate);
      });
      // Notify the other party of the new message
      const other = otherParty(conversation, user?.id);
      if (other?.id) {
        createNotification(other.id, 'chat', `New message from ${user?.full_name || 'User'}`, content.slice(0, 80), {
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
        createNotification(op.id, 'chat', `Voice note from ${user?.full_name || 'User'}`, 'Voice message', {
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

  const other = otherParty(conversation, user?.id);
  const otherImageUrl = other?.role === 'doctor' ? conversation?.doctor_image : conversation?.patient_image;

  const handleStartCall = async () => {
    if (!conversation || !user?.id) return;
    const room = buildCallRoomName(conversation.id);
    initiatingCallRef.current = true;
    setCallRoom(room);
    setShowCall(true);
    setIncomingCall(null);
    // Signal the other party with a system message + a notification so they can pick up.
    try {
      await sendMessage(conversation, user, '📞 Voice call started', { type: 'system', attachment_url: room });
      if (other?.id) {
        createNotification(other.id, 'chat', `📞 Incoming voice call from ${user?.full_name || 'User'}`, 'Tap to join the call', {
          priority: 'high',
          data: { conversation_id: conversation.id, appointment_id: conversation.appointment_id, call_room: room },
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const joinCall = (room) => {
    initiatingCallRef.current = false;
    setIncomingCall(null);
    setCallRoom(room);
    setShowCall(true);
  };

  const handleDeclineCall = async () => {
    const room = incomingCall?.room;
    setIncomingCall(null);
    if (!conversation || !user?.id || !room) return;
    try {
      await sendMessage(conversation, user, '📵 Call declined', { type: 'system', attachment_url: room });
    } catch (e) {
      console.error(e);
    }
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
            onClick={handleStartCall}
            className="p-2.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition-all"
            title="Voice call"
          >
            <Phone className="w-4 h-4" />
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
                      {msg.type === 'system' && msg.attachment_url ? (
                        <button
                          onClick={() => joinCall(msg.attachment_url)}
                          className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 transition-colors"
                        >
                          <PhoneIncoming className="w-3.5 h-3.5" />
                          {msg.content || 'Join voice call'}
                        </button>
                      ) : msg.type === 'audio' && msg.attachment_url ? (
                        <VoiceMessage url={msg.attachment_url} mine={isMe} />
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
      {incomingCall && (
        <IncomingCallOverlay
          callerName={incomingCall.callerName}
          onAccept={() => joinCall(incomingCall.room)}
          onDecline={handleDeclineCall}
        />
      )}
      {showCall && callRoom && (
        <AudioCall
          roomName={callRoom}
          displayName={user?.full_name || user?.email}
          otherName={other?.name}
          onClose={() => { setShowCall(false); initiatingCallRef.current = false; }}
        />
      )}
    </Layout>
  );
}