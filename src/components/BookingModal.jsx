import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import DoctorAvatar from '@/components/DoctorAvatar';
import { X, Users, Briefcase, MessageSquare, Star, Video, Phone, Building2, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

const dayMap = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };
const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const defaultSlots = ['09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM'];

// Convert a slot string like "01:30 PM" to minutes since midnight for comparison
function slotToMinutes(slot) {
  if (!slot) return -1;
  const m = slot.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return -1;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

// Check if a slot falls within a break window [breakStart, breakEnd)
function isSlotInBreak(slot, breakStart, breakEnd) {
  if (!breakStart || !breakEnd) return false;
  const s = slotToMinutes(slot);
  const bs = slotToMinutes(breakStart);
  const be = slotToMinutes(breakEnd);
  if (s < 0 || bs < 0 || be < 0) return false;
  return s >= bs && s < be;
}

const typeIcons = {
  video: Video, audio: Phone, chat: MessageSquare, physical: Building2, home: Home,
};

function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function BookingModal({ doctor, onClose, onConfirm }) {
  const modes = doctor.availability_modes || ['video'];
  const [selectedDate, setSelectedDate] = useState(() => formatLocalDate(new Date()));
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [selectedType, setSelectedType] = useState(modes[0] || 'video');
  const [schedule, setSchedule] = useState(null);
  const [bookedSlots, setBookedSlots] = useState([]);
  const [loading, setLoading] = useState(true);

  const dates = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });

  useEffect(() => {
    if (!selectedDate || !doctor?.id) return;
    const loadAvailability = async () => {
      setLoading(true);
      try {
        // Match the schedule by the doctor's entity id, falling back to the
        // legacy user_id-keyed records created before the DoctorSchedule
        // refactor moved doctor_id to the Doctor entity id.
        const scheduleQuery = doctor.user_id
          ? { $or: [{ doctor_id: doctor.id }, { doctor_id: doctor.user_id }] }
          : { doctor_id: doctor.id };
        const apptQuery = doctor.user_id
          ? { $or: [{ doctor_id: doctor.id }, { doctor_id: doctor.user_id }], appointment_date: selectedDate }
          : { doctor_id: doctor.id, appointment_date: selectedDate };
        const [schedules, appts] = await Promise.all([
          base44.entities.Schedule.filter(scheduleQuery).catch(() => []),
          base44.entities.Appointment.filter(apptQuery).catch(() => []),
        ]);
        setSchedule(schedules[0] || null);
        setBookedSlots(appts.filter(a => !['cancelled', 'rejected'].includes(a.status)).map(a => a.time_slot));
      } catch {
        setSchedule(null);
        setBookedSlots([]);
      } finally {
        setLoading(false);
      }
    };
    loadAvailability();
  }, [selectedDate, doctor?.id]);

  const getSlots = () => {
    if (!selectedDate) return [];
    // If the doctor has never configured a Schedule, do not silently fall back
    // to a generic slot list — that allowed bookings with zero real availability
    // checking. Surface it as "no slots" instead so booking is blocked until the
    // doctor sets up a real schedule.
    if (!schedule) return [];
    const date = new Date(selectedDate + 'T00:00:00');
    const dayKey = dayMap[date.getDay()];
    const daySchedule = schedule.days?.find(d => d.day === dayKey);
    if (!daySchedule || !daySchedule.enabled) return [];
    const slots = daySchedule.slots || [];
    // Filter out slots that fall within the doctor's break window.
    // Supports both the recurring break (schedule.break_start/break_end) and
    // per-day breaks (schedule.day_breaks = [{ date, start, end }]).
    const breakStart = schedule.break_start;
    const breakEnd = schedule.break_end;
    const dayBreaks = Array.isArray(schedule.day_breaks) ? schedule.day_breaks : [];
    const matchingDayBreak = dayBreaks.find(db => db.date === selectedDate);
    const dayBreakStart = matchingDayBreak?.start;
    const dayBreakEnd = matchingDayBreak?.end;
    return slots.filter(slot => {
      if (isSlotInBreak(slot, breakStart, breakEnd)) return false;
      if (isSlotInBreak(slot, dayBreakStart, dayBreakEnd)) return false;
      return true;
    });
  };

  const availableSlots = getSlots();

  const stats = [
    { icon: Users, value: doctor.total_patients || 0, label: 'Patients' },
    { icon: Briefcase, value: `${doctor.experience_years || 0} yrs`, label: 'Experience' },
    { icon: MessageSquare, value: doctor.total_reviews || 0, label: 'Reviews' },
    { icon: Star, value: Number(doctor.rating || 0).toFixed(1), label: 'Rating' },
  ];

  const handleConfirm = () => {
    if (!selectedDate || !selectedSlot) return;
    onConfirm({
      appointment_date: selectedDate,
      time_slot: selectedSlot,
      type: selectedType,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-card w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto scrollbar-thin animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card z-10 p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-bold">Book Appointment</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary active:scale-95 transition-all">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Doctor Header */}
          <div className="flex items-center gap-3">
            <DoctorAvatar name={doctor.full_name} imageUrl={doctor.image_url} size="xl" />
            <div>
              <h3 className="font-bold text-base">{doctor.full_name}</h3>
              <p className="text-sm text-primary">{doctor.specialty}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{doctor.hospital || doctor.city}</p>
            </div>
          </div>

          {/* Stat Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {stats.map((stat, i) => {
              const Icon = stat.icon;
              return (
                <div key={i} className="flex flex-col items-center text-center p-2 rounded-xl bg-primary/5 animate-slide-up" style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mb-1">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-sm font-bold">{stat.value}</p>
                  <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                </div>
              );
            })}
          </div>

          {/* Bio */}
          {doctor.bio && (
            <p className="text-xs text-muted-foreground leading-relaxed">{doctor.bio}</p>
          )}

          {/* Choose Date */}
          <div>
            <p className="text-sm font-semibold mb-2">Choose Date</p>
            <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
              {dates.map((d, i) => {
                const dateStr = formatLocalDate(d);
                const isSelected = selectedDate === dateStr;
                return (
                  <button
                    key={i}
                    onClick={() => { setSelectedDate(dateStr); setSelectedSlot(null); }}
                    className={cn(
                      'flex flex-col items-center justify-center px-3 py-2 rounded-full whitespace-nowrap transition-all active:scale-95 min-w-[56px]',
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground hover:bg-secondary/70'
                    )}
                  >
                    <span className="text-[10px] font-medium">{dayLabels[d.getDay()]}</span>
                    <span className="text-base font-bold">{d.getDate()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Choose Time */}
          <div>
            <p className="text-sm font-semibold mb-2">Choose Time</p>
            {loading ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {[1, 2, 3, 4].map(i => <div key={i} className="h-10 rounded-full shimmer" />)}
              </div>
            ) : availableSlots.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {availableSlots.map(slot => {
                  const isBooked = bookedSlots.includes(slot);
                  const isSelected = selectedSlot === slot;
                  return (
                    <button
                      key={slot}
                      disabled={isBooked}
                      onClick={() => setSelectedSlot(slot)}
                      className={cn(
                        'py-2 rounded-full text-xs font-medium transition-all',
                        isBooked
                          ? 'bg-secondary/30 text-muted-foreground/40 cursor-not-allowed line-through'
                          : isSelected
                            ? 'bg-primary text-primary-foreground active:scale-95'
                            : 'bg-secondary text-foreground hover:bg-secondary/70 active:scale-95'
                      )}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">No available slots for this day</p>
            )}
          </div>

          {/* Choose Type */}
          <div>
            <p className="text-sm font-semibold mb-2">Consultation Type</p>
            <div className="flex flex-wrap gap-2">
              {modes.map(mode => {
                const Icon = typeIcons[mode] || Video;
                const isSelected = selectedType === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => setSelectedType(mode)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium capitalize transition-all active:scale-95',
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground hover:bg-secondary/70'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {mode}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-card border-t border-border p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] text-muted-foreground">Consultation Fee</p>
            <p className="text-lg font-bold">Rs {Number(doctor.consultation_fee || 0).toLocaleString()}</p>
          </div>
          <button
            onClick={handleConfirm}
            disabled={!selectedDate || !selectedSlot}
            className="flex-1 max-w-[200px] py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Confirm Booking
          </button>
        </div>
      </div>
    </div>
  );
}