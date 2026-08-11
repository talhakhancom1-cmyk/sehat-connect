import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import Layout from '@/components/Layout';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Video, Phone, MessageSquare, Building2, Home as HomeIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addMonths, subMonths } from 'date-fns';

const dayMap = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };
const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const typeIcons = { video: Video, audio: Phone, chat: MessageSquare, physical: Building2, home: HomeIcon };

function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function DoctorCalendar() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => { load(); }, [user]);

  const load = async () => {
    if (!user?.id) return;
    try {
      const myDoctors = await base44.entities.Doctor.filter({ email: user.email });
      if (!myDoctors.length) { setAppointments([]); return; }
      const doctorId = myDoctors[0].id;
      const [appts, schs] = await Promise.all([
        base44.entities.Appointment.filter({ doctor_id: doctorId }, '-appointment_date', 200).catch(() => []),
        base44.entities.Schedule.filter({ doctor_id: doctorId }).catch(() => []),
      ]);
      setAppointments(appts);
      setSchedule(schs[0] || null);
    } catch { setAppointments([]); }
    finally { setLoading(false); }
  };

  const appointmentsByDate = appointments.reduce((acc, appt) => {
    const date = appt.appointment_date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(appt);
    return acc;
  }, {});

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const selectedDateStr = formatLocalDate(selectedDate);
  const dayAppts = (appointmentsByDate[selectedDateStr] || []).sort((a, b) => (a.time_slot || '').localeCompare(b.time_slot || ''));

  const dayKey = dayMap[selectedDate.getDay()];
  const daySchedule = schedule?.days?.find(d => d.day === dayKey);
  const allSlots = daySchedule?.enabled ? (daySchedule.slots || []) : [];
  const bookedSlots = dayAppts.filter(a => !['cancelled', 'rejected'].includes(a.status)).map(a => a.time_slot);
  const openSlots = allSlots.filter(s => !bookedSlots.includes(s));

  return (
    <Layout role="doctor" title="Calendar" subtitle="View and manage your daily appointments">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 animate-fade-in">
        {/* Calendar Grid */}
        <div className="lg:col-span-3">
          <div className="bg-card rounded-2xl p-4 shadow-card">
            {/* Month Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">{format(currentMonth, 'MMMM yyyy')}</h2>
              <div className="flex items-center gap-1">
                <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 rounded-full hover:bg-secondary active:scale-95 transition-all">
                  <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                </button>
                <button onClick={() => { setCurrentMonth(new Date()); setSelectedDate(new Date()); }} className="px-3 py-1.5 rounded-full text-xs font-medium bg-secondary text-muted-foreground hover:bg-secondary/70 active:scale-95 transition-all">
                  Today
                </button>
                <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 rounded-full hover:bg-secondary active:scale-95 transition-all">
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Week Day Headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {weekDays.map(day => (
                <div key={day} className="text-center text-[10px] font-semibold text-muted-foreground uppercase py-1">{day}</div>
              ))}
            </div>

            {/* Calendar Days */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map(day => {
                const dateStr = formatLocalDate(day);
                const dayAppointments = appointmentsByDate[dateStr] || [];
                const apptCount = dayAppointments.filter(a => !['cancelled', 'rejected'].includes(a.status)).length;
                const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                const isToday = isSameDay(day, new Date());
                const isSelected = isSameDay(day, selectedDate);

                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelectedDate(day)}
                    className={cn(
                      'aspect-square rounded-xl flex flex-col items-center justify-center transition-all active:scale-95 min-h-[44px]',
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : isToday
                          ? 'bg-primary/10 text-primary border border-primary/20'
                          : isCurrentMonth
                            ? 'hover:bg-secondary'
                            : 'opacity-30 hover:bg-secondary'
                    )}
                  >
                    <span className="text-sm font-semibold">{day.getDate()}</span>
                    {apptCount > 0 && (
                      <span className={cn(
                        'mt-0.5 text-[9px] font-bold rounded-full px-1.5',
                        isSelected ? 'bg-white/20 text-white' : 'bg-primary/15 text-primary'
                      )}>
                        {apptCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 px-1">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span className="text-xs text-muted-foreground">Selected</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-primary/10 border border-primary/20" />
              <span className="text-xs text-muted-foreground">Today</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-primary/15" />
              <span className="text-xs text-muted-foreground">Has appointments</span>
            </div>
          </div>
        </div>

        {/* Day Detail Panel */}
        <div className="lg:col-span-2">
          <div className="bg-card rounded-2xl p-4 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold">{format(selectedDate, 'EEEE, MMM d')}</h3>
                <p className="text-xs text-muted-foreground">
                  {dayAppts.length} appointment{dayAppts.length !== 1 ? 's' : ''} · {openSlots.length} open slot{openSlots.length !== 1 ? 's' : ''}
                </p>
              </div>
              <CalendarIcon className="w-5 h-5 text-primary" />
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl shimmer" />)}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Appointments */}
                {dayAppts.length > 0 ? (
                  <div className="space-y-2">
                    {dayAppts.map((appt, i) => {
                      const Icon = typeIcons[appt.type] || Video;
                      const isCancelled = ['cancelled', 'rejected'].includes(appt.status);
                      return (
                        <div key={appt.id} className={cn(
                          'flex items-center gap-3 p-2.5 rounded-xl border transition-all animate-slide-up',
                          isCancelled ? 'bg-secondary/20 border-border opacity-50' : 'bg-secondary/30 border-border/60'
                        )} style={{ animationDelay: `${i * 40}ms` }}>
                          <div className="text-center shrink-0 min-w-[52px]">
                            <p className="text-[10px] font-mono font-bold text-primary">{appt.time_slot}</p>
                          </div>
                          <div className="w-px h-8 bg-border" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{appt.patient_name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Icon className="w-3 h-3 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground capitalize">{appt.type}</span>
                              <span className="text-[10px] text-muted-foreground">·</span>
                              <span className={cn(
                                'text-[10px] font-medium capitalize',
                                appt.status === 'confirmed' ? 'text-green-600' :
                                appt.status === 'pending' ? 'text-amber-600' :
                                appt.status === 'completed' ? 'text-blue-600' :
                                'text-red-600'
                              )}>{appt.status.replace('_', ' ')}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-6 text-center">
                    <CalendarIcon className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">No appointments on this day</p>
                  </div>
                )}

                {/* Open Slots */}
                {openSlots.length > 0 && (
                  <div className="pt-3 border-t border-border/60">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Clock className="w-3 h-3" /> Open Slots
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {openSlots.map(slot => (
                        <span key={slot} className="px-2.5 py-1.5 rounded-full bg-green-50 text-green-600 text-[11px] font-medium border border-green-100">
                          {slot}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* All slots booked */}
                {allSlots.length > 0 && openSlots.length === 0 && dayAppts.length > 0 && (
                  <div className="pt-3 border-t border-border/60">
                    <p className="text-xs text-muted-foreground text-center">All slots booked for this day</p>
                  </div>
                )}

                {/* Not working this day */}
                {allSlots.length === 0 && (
                  <div className="pt-3 border-t border-border/60">
                    <p className="text-xs text-muted-foreground text-center">Not available on this day</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Day Stats */}
          {!loading && dayAppts.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="bg-card rounded-xl p-3 shadow-card text-center animate-slide-up">
                <p className="text-lg font-bold text-green-600">{dayAppts.filter(a => ['confirmed', 'completed'].includes(a.status)).length}</p>
                <p className="text-[10px] text-muted-foreground">Confirmed</p>
              </div>
              <div className="bg-card rounded-xl p-3 shadow-card text-center animate-slide-up" style={{ animationDelay: '40ms' }}>
                <p className="text-lg font-bold text-amber-500">{dayAppts.filter(a => a.status === 'pending').length}</p>
                <p className="text-[10px] text-muted-foreground">Pending</p>
              </div>
              <div className="bg-card rounded-xl p-3 shadow-card text-center animate-slide-up" style={{ animationDelay: '80ms' }}>
                <p className="text-lg font-bold text-primary">{openSlots.length}</p>
                <p className="text-[10px] text-muted-foreground">Open</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}