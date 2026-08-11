import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import DoctorAvatar from '@/components/DoctorAvatar';
import BookingModal from '@/components/BookingModal';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { toUserError } from '@/lib/userError';
import { Send, AlertTriangle, Stethoscope, Clock, DollarSign, ArrowRight, Loader2 } from 'lucide-react';

export default function SymptomChecker() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [triageComplete, setTriageComplete] = useState(false);
  const [urgency, setUrgency] = useState(null);
  const [specialty, setSpecialty] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [prefillSlot, setPrefillSlot] = useState(null);
  const [prefillDate, setPrefillDate] = useState(null);
  const [booking, setBooking] = useState(false);
  const messagesEndRef = useRef(null);

  // Welcome message on load
  useEffect(() => {
    setMessages([{
      role: 'assistant',
      content: 'Hello! I\'m here to help you figure out what kind of doctor you might want to see. Please describe your symptoms — for example, "I\'ve had a headache for 3 days that won\'t go away." This is not a medical diagnosis. Please consult a doctor for proper evaluation.',
    }]);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const patientMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'patient', content: patientMessage }]);
    setLoading(true);

    try {
      const endpoint = sessionId ? `/symptom-checker/${sessionId}/message` : '/symptom-checker/start';
      const resp = await fetch(`${base44.apiUrl}${endpoint}`, {
        method: 'POST',
        headers: { ...base44.headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: patientMessage }),
      });

      if (resp.status === 429) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'You\'ve reached the daily limit of 10 symptom checks. Please try again tomorrow.' }]);
        return;
      }

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        setMessages(prev => [...prev, { role: 'assistant', content: toUserError(err) || 'Something went wrong. Please try again.' }]);
        return;
      }

      const data = await resp.json();
      setSessionId(data.session_id);
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);

      if (data.is_final) {
        setTriageComplete(true);
        setUrgency(data.urgency);
        setSpecialty(data.specialty);

        if (data.urgency === 'urgent') {
          // Don't fetch doctors — show emergency redirect
          return;
        }

        // Fetch matching doctors
        setLoadingDoctors(true);
        try {
          const docResp = await fetch(`${base44.apiUrl}/symptom-checker/${data.session_id}/doctors`, {
            headers: base44.headers(),
          });
          if (docResp.ok) {
            const docData = await docResp.json();
            setDoctors(docData.doctors || []);
            setFallback(docData.fallback || false);
          }
        } catch (e) {
          setFallback(true);
        } finally {
          setLoadingDoctors(false);
        }
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Network error. Please check your connection and try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleBookSlot = (doctor, date, slot) => {
    setSelectedDoctor(doctor);
    setPrefillDate(date);
    setPrefillSlot(slot);
  };

  const formatSlotDisplay = (date, slot) => {
    const d = new Date(date + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let dayLabel = '';
    if (d.toDateString() === today.toDateString()) dayLabel = 'today';
    else if (d.toDateString() === tomorrow.toDateString()) dayLabel = 'tomorrow';
    else dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    return `Available ${dayLabel} at ${slot}`;
  };

  const urgencyConfig = {
    urgent: { label: 'Urgent — Seek Immediate Care', color: 'bg-red-500', textColor: 'text-red-600', bg: 'bg-red-50' },
    soon: { label: 'Soon — Book within 24-48 hours', color: 'bg-orange-500', textColor: 'text-orange-600', bg: 'bg-orange-50' },
    routine: { label: 'Routine — Book when convenient', color: 'bg-green-500', textColor: 'text-green-600', bg: 'bg-green-50' },
  };

  const resetSession = () => {
    setMessages([{ role: 'assistant', content: 'Hello! Please describe your symptoms.' }]);
    setSessionId(null);
    setTriageComplete(false);
    setUrgency(null);
    setSpecialty(null);
    setDoctors([]);
    setFallback(false);
  };

  return (
    <Layout title="Symptom Checker">
      <div className="max-w-2xl mx-auto space-y-4 animate-fade-in">
        {/* Emergency Banner */}
        <div className="bg-red-50 border border-red-200 rounded-2xl p-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <p className="text-sm text-red-800 font-medium">If this is a medical emergency, call emergency services immediately.</p>
        </div>

        {/* Chat Area */}
        <div className="bg-white rounded-3xl shadow-warm overflow-hidden">
          <div className="flex items-center gap-2 p-4 border-b border-[#F0E8DC]">
            <Stethoscope className="w-5 h-5 text-[#D97757]" />
            <h2 className="font-bold text-sm text-[#1A1A1A]">AI Symptom Checker</h2>
          </div>

          <div className="p-4 space-y-3 min-h-[300px] max-h-[500px] overflow-y-auto">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'patient' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  msg.role === 'patient'
                    ? 'bg-[#D97757] text-white rounded-br-md'
                    : 'bg-[#F7F1EA] text-[#1A1A1A] rounded-bl-md'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-[#F7F1EA] rounded-2xl rounded-bl-md px-4 py-3">
                  <Loader2 className="w-4 h-4 text-[#D97757] animate-spin" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          {!triageComplete && (
            <div className="border-t border-[#F0E8DC] p-4">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  placeholder="Describe your symptoms…"
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-[#E7DDD2] bg-[#FDF6EE] text-sm outline-none focus:border-[#D97757] disabled:opacity-50"
                />
                <button
                  onClick={sendMessage}
                  disabled={loading || !input.trim()}
                  className="p-2.5 rounded-xl bg-[#D97757] text-white hover:bg-[#C9683F] disabled:opacity-50 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Triage Results */}
        {triageComplete && (
          <div className="space-y-4">
            {/* Urgency Badge */}
            {urgency && urgencyConfig[urgency] && (
              <div className={`rounded-2xl p-4 ${urgencyConfig[urgency].bg} border border-current/10`}>
                <p className={`text-sm font-bold ${urgencyConfig[urgency].textColor}`}>
                  {urgencyConfig[urgency].label}
                </p>
                {specialty && <p className="text-xs text-muted-foreground mt-1">Suggested specialty: {specialty}</p>}
              </div>
            )}

            {/* Urgent → Emergency redirect */}
            {urgency === 'urgent' && (
              <button
                onClick={() => navigate('/emergency')}
                className="w-full bg-red-500 text-white rounded-2xl p-4 font-bold text-sm hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
              >
                <AlertTriangle className="w-5 h-5" />
                Go to Emergency Page
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {/* Routine/Soon → Doctor matching */}
            {urgency !== 'urgent' && (
              <div className="space-y-3">
                <h3 className="font-bold text-sm text-[#1A1A1A]">
                  {loadingDoctors ? 'Finding available doctors…' : fallback ? 'No immediate slots found' : 'Available doctors'}
                </h3>

                {loadingDoctors && (
                  <div className="space-y-2">
                    {[1, 2].map(i => <div key={i} className="h-24 rounded-2xl bg-card animate-pulse" />)}
                  </div>
                )}

                {!loadingDoctors && doctors.length > 0 && doctors.map(doctor => (
                  <div key={doctor.id} className="bg-white rounded-2xl p-4 shadow-warm flex items-center gap-3">
                    <DoctorAvatar name={doctor.full_name} imageUrl={doctor.profile_pic_url} size="md" round />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-[#1A1A1A] truncate">{doctor.full_name}</p>
                      <p className="text-xs text-muted-foreground">{doctor.specialty}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatSlotDisplay(doctor.next_available_date, doctor.next_available_slot)}
                        </span>
                        {doctor.consultation_fee > 0 && (
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            {doctor.consultation_fee}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleBookSlot(doctor, doctor.next_available_date, doctor.next_available_slot)}
                      className="px-3 py-2 rounded-xl bg-[#D97757] text-white text-xs font-bold hover:bg-[#C9683F] transition-colors shrink-0"
                    >
                      Book
                    </button>
                  </div>
                ))}

                {!loadingDoctors && fallback && specialty && (
                  <button
                    onClick={() => navigate(`/doctors`)}
                    className="w-full bg-white rounded-2xl p-4 shadow-warm text-center text-sm font-medium text-[#D97757] hover:bg-[#FDF6EE] transition-colors"
                  >
                    Browse {specialty} doctors →
                  </button>
                )}

                {/* Start new session */}
                <button
                  onClick={resetSession}
                  className="w-full py-2.5 rounded-xl border border-[#E7DDD2] text-sm font-medium text-[#6B5B4F] hover:bg-[#F7F1EA] transition-colors"
                >
                  Start new symptom check
                </button>
              </div>
            )}
          </div>
        )}

        {/* Persistent Disclaimer */}
        <div className="bg-[#F7F1EA] rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">This is not a medical diagnosis. Please consult a doctor for proper evaluation.</p>
        </div>
      </div>

      {/* Booking Modal */}
      {selectedDoctor && (
        <BookingModal
          doctor={selectedDoctor}
          prefillDate={prefillDate}
          prefillSlot={prefillSlot}
          booking={booking}
          onClose={() => { setSelectedDoctor(null); setPrefillDate(null); setPrefillSlot(null); }}
          onConfirm={async (bookingDetails) => {
            setBooking(true);
            try {
              await base44.entities.Appointment.create({
                doctor_id: selectedDoctor.id,
                doctor_name: selectedDoctor.full_name,
                patient_id: user?.id,
                doctor_user_id: selectedDoctor.user_id,
                patient_name: user?.display_name || user?.full_name || 'Patient',
                appointment_date: bookingDetails.appointment_date,
                time_slot: bookingDetails.time_slot,
                type: bookingDetails.type,
                status: 'pending',
                consultation_fee: selectedDoctor.consultation_fee,
                payment_status: 'unpaid',
                reason: 'Symptom checker referral',
              });
              toast({ title: 'Appointment booked!', description: `Your appointment with ${selectedDoctor.full_name} is pending confirmation.` });
              setSelectedDoctor(null);
              setPrefillDate(null);
              setPrefillSlot(null);
              navigate('/appointments');
            } catch (e) {
              toast({ title: 'Booking failed', description: toUserError(e), variant: 'destructive' });
            } finally {
              setBooking(false);
            }
          }}
        />
      )}
    </Layout>
  );
}
