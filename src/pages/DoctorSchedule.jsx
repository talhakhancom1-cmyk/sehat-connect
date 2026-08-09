import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import Layout from '@/components/Layout';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import { Save, Loader2, RotateCcw, Plus, Trash2, CalendarClock } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import Skeleton from '@/components/Skeleton';

const days = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

const timeSlots = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
  '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM',
];

const defaultSchedule = {
  mon: { enabled: true, slots: ['09:00 AM', '10:00 AM', '11:00 AM', '02:00 PM', '03:00 PM'] },
  tue: { enabled: true, slots: ['09:00 AM', '10:00 AM', '11:00 AM', '02:00 PM', '03:00 PM'] },
  wed: { enabled: true, slots: ['09:00 AM', '10:00 AM', '02:00 PM', '03:00 PM'] },
  thu: { enabled: true, slots: ['09:00 AM', '10:00 AM', '11:00 AM', '02:00 PM', '03:00 PM', '04:00 PM'] },
  fri: { enabled: true, slots: ['02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM'] },
  sat: { enabled: false, slots: [] },
  sun: { enabled: false, slots: [] },
};

export default function DoctorSchedule() {
  const { user } = useAuth();
  const [schedule, setSchedule] = useState(defaultSchedule);
  const [maxPatients, setMaxPatients] = useState(20);
  const [breakTime, setBreakTime] = useState({ start: '01:00 PM', end: '02:00 PM' });
  const [dayBreaks, setDayBreaks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scheduleId, setScheduleId] = useState(null);
  const [doctorEntityId, setDoctorEntityId] = useState(null);

  useEffect(() => { load(); }, [user]);

  const load = async () => {
    if (!user?.id) return;
    try {
      // Try to find this doctor's entity by user_id, fall back to email match
      let myDoctors = await base44.entities.Doctor.filter({ user_id: user.id }, '-updated_at', 5).catch(() => []);
      if (!myDoctors || myDoctors.length === 0) {
        // Fallback: list all doctors and find by email
        const allDocs = await base44.entities.Doctor.filter({}, '-updated_at', 500).catch(() => []);
        myDoctors = (allDocs || []).filter(d => d.email === user.email);
      }
      const doctor = myDoctors[0];
      if (!doctor) {
        toast({ title: 'Profile not found', description: 'Complete onboarding before setting availability.', variant: 'destructive' });
        setLoading(false);
        return;
      }
      setDoctorEntityId(doctor.id);

      const existing = await base44.entities.Schedule.filter({ doctor_id: doctor.id }, '-updated_at', 1).catch(() => []);
      if (existing && existing.length > 0) {
        const s = existing[0];
        setScheduleId(s.id);
        setMaxPatients(s.max_patients_per_day || 20);
        setBreakTime({ start: s.break_start || '01:00 PM', end: s.break_end || '02:00 PM' });
        setDayBreaks(Array.isArray(s.day_breaks) ? s.day_breaks : []);
        if (s.days && Array.isArray(s.days)) {
          const newSchedule = { ...defaultSchedule };
          s.days.forEach(d => {
            if (newSchedule[d.day]) {
              newSchedule[d.day] = { enabled: d.enabled, slots: d.slots || [] };
            }
          });
          setSchedule(newSchedule);
        }
      }
    } catch { /* no existing schedule */ }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!doctorEntityId) {
      toast({ title: 'Cannot save', description: 'Doctor profile not found.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const daysArray = Object.entries(schedule).map(([day, data]) => ({
        day, enabled: data.enabled, slots: data.slots,
      }));
      const data = {
        doctor_id: doctorEntityId,
        doctor_name: user.display_name || user.full_name || user.email,
        max_patients_per_day: maxPatients,
        break_start: breakTime.start,
        break_end: breakTime.end,
        days: daysArray,
        day_breaks: dayBreaks,
      };
      if (scheduleId) {
        await base44.entities.Schedule.update(scheduleId, data);
      } else {
        const created = await base44.entities.Schedule.create(data);
        setScheduleId(created.id);
      }
      toast({ title: 'Schedule saved', description: 'Your availability has been updated.' });
    } catch (err) {
      toast({ title: 'Save failed', description: err.message || 'Could not save schedule', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSchedule(defaultSchedule);
    setMaxPatients(20);
    setBreakTime({ start: '01:00 PM', end: '02:00 PM' });
    setDayBreaks([]);
  };

  const toggleDay = (day) => {
    setSchedule({ ...schedule, [day]: { ...schedule[day], enabled: !schedule[day].enabled } });
  };

  const toggleSlot = (day, slot) => {
    const daySlots = schedule[day].slots;
    const newSlots = daySlots.includes(slot)
      ? daySlots.filter(s => s !== slot)
      : [...daySlots, slot].sort();
    setSchedule({ ...schedule, [day]: { ...schedule[day], slots: newSlots } });
  };

  const addDayBreak = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    setDayBreaks([...dayBreaks, { date: `${y}-${m}-${d}`, start: '01:00 PM', end: '02:00 PM', reason: '' }]);
  };

  const updateDayBreak = (i, field, value) => {
    setDayBreaks(breaks => breaks.map((b, idx) => idx === i ? { ...b, [field]: value } : b));
  };

  const removeDayBreak = (i) => {
    setDayBreaks(breaks => breaks.filter((_, idx) => idx !== i));
  };

  if (loading) {
    return (
      <Layout role="doctor" title="Schedule & Availability" subtitle="Set working hours and consultation slots">
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      </Layout>
    );
  }

  return (
    <Layout role="doctor" title="Schedule & Availability" subtitle="Set working hours and consultation slots">
      <div className="space-y-4 animate-fade-in">
        {/* Settings Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Max Patients / Day</label>
            <input
              type="number"
              value={maxPatients}
              onChange={e => setMaxPatients(parseInt(e.target.value) || 0)}
              className="w-full mt-1 bg-transparent text-xl font-mono font-bold outline-none"
            />
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Break Start</label>
            <select
              value={breakTime.start}
              onChange={e => setBreakTime({ ...breakTime, start: e.target.value })}
              className="w-full mt-1 bg-transparent text-xl font-mono font-bold outline-none"
            >
              {timeSlots.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Break End</label>
            <select
              value={breakTime.end}
              onChange={e => setBreakTime({ ...breakTime, end: e.target.value })}
              className="w-full mt-1 bg-transparent text-xl font-mono font-bold outline-none"
            >
              {timeSlots.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {/* Per-Day Breaks */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold">Day-Specific Breaks</p>
            </div>
            <button onClick={addDayBreak} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              <Plus className="w-3 h-3" /> Add Break
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3">Mark yourself "on break" for a specific date — those slots won't be bookable by patients.</p>
          {dayBreaks.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No day-specific breaks set.</p>
          ) : (
            <div className="space-y-2">
              {dayBreaks.map((b, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-border p-2">
                  <input
                    type="date"
                    value={b.date}
                    onChange={e => updateDayBreak(i, 'date', e.target.value)}
                    className="px-2 py-1 rounded border border-input bg-card text-xs font-mono"
                  />
                  <select value={b.start} onChange={e => updateDayBreak(i, 'start', e.target.value)} className="px-2 py-1 rounded border border-input bg-card text-xs font-mono">
                    {timeSlots.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <span className="text-xs text-muted-foreground">to</span>
                  <select value={b.end} onChange={e => updateDayBreak(i, 'end', e.target.value)} className="px-2 py-1 rounded border border-input bg-card text-xs font-mono">
                    {timeSlots.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input
                    type="text"
                    value={b.reason || ''}
                    onChange={e => updateDayBreak(i, 'reason', e.target.value)}
                    placeholder="Reason (optional)"
                    className="flex-1 px-2 py-1 rounded border border-input bg-card text-xs"
                  />
                  <button onClick={() => removeDayBreak(i)} className="p-1 text-muted-foreground hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Weekly Schedule */}
        <div className="space-y-3">
          {days.map(day => {
            const dayData = schedule[day.key];
            return (
              <div key={day.key} className={cn(
                'rounded-lg border bg-card p-4 transition-all',
                dayData.enabled ? 'border-border' : 'border-border opacity-50'
              )}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleDay(day.key)}
                      className={cn(
                        'w-10 h-5 rounded-full transition-colors relative',
                        dayData.enabled ? 'bg-primary' : 'bg-secondary'
                      )}
                    >
                      <span className={cn(
                        'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                        dayData.enabled ? 'translate-x-5' : 'translate-x-0.5'
                      )} />
                    </button>
                    <div>
                      <p className="text-sm font-semibold">{day.label}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {dayData.enabled ? `${dayData.slots.length} slots active` : 'Unavailable'}
                      </p>
                    </div>
                  </div>
                  {dayData.enabled && dayData.slots.length > 0 && (
                    <span className="text-xs text-primary font-mono">
                      {dayData.slots[0]} – {dayData.slots[dayData.slots.length - 1]}
                    </span>
                  )}
                </div>

                {dayData.enabled && (
                  <div className="grid grid-cols-4 md:grid-cols-8 gap-1.5">
                    {timeSlots.map(slot => {
                      const active = dayData.slots.includes(slot);
                      const isBreak = slot >= breakTime.start && slot < breakTime.end;
                      return (
                        <button
                          key={slot}
                          onClick={() => toggleSlot(day.key, slot)}
                          disabled={isBreak}
                          className={cn(
                            'px-2 py-2 min-h-[36px] rounded text-[10px] font-mono text-center transition-all',
                            isBreak
                              ? 'bg-amber-500/5 text-amber-500/30 cursor-not-allowed'
                              : active
                                ? 'bg-primary/15 text-primary border border-primary/20'
                                : 'bg-secondary/30 text-muted-foreground border border-transparent hover:bg-secondary/60'
                          )}
                        >
                          {slot}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Save / Reset */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg bg-secondary/50 text-sm font-medium hover:bg-secondary transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Schedule'}
          </button>
        </div>
      </div>
    </Layout>
  );
}