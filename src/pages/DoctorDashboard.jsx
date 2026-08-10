import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import Layout from '@/components/Layout';
import StatCard from '@/components/StatCard';
import AppointmentCard from '@/components/AppointmentCard';
import EmptyState from '@/components/EmptyState';
import DoctorSummary from '@/components/DoctorSummary';
import { Calendar, DollarSign, Users, Clock, TrendingUp, Stethoscope, ArrowRight, ShieldAlert, BellOff, Bell } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar } from 'recharts';

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function DoctorDashboard() {
  const { user } = useAuth();
  const [dnd, setDnd] = useState(user?.do_not_disturb || false);
  const [togglingDnd, setTogglingDnd] = useState(false);

  const toggleDnd = async () => {
    setTogglingDnd(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
      const token = localStorage.getItem('ehc_token');
      const res = await fetch(`${API_BASE_URL}/auth/toggle-dnd`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setDnd(data.do_not_disturb);
    } catch (e) {
      console.error('Toggle DND failed:', e);
    } finally {
      setTogglingDnd(false);
    }
  };
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [doctorId, setDoctorId] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [doctorProfile, setDoctorProfile] = useState(null);

  useEffect(() => { load(); }, [user]);

  const load = async () => {
    if (!user?.id) return;
    try {
      const myDoctors = await base44.entities.Doctor.filter({ email: user.email });
      if (!myDoctors.length) { setAppointments([]); return; }
      setDoctorId(myDoctors[0].id);
      setDoctorName(myDoctors[0].full_name || '');
      setDoctorProfile(myDoctors[0]);
      const data = await base44.entities.Appointment.filter({ doctor_id: myDoctors[0].id }, '-appointment_date', 200);
      setAppointments(data);
      setLastUpdated(new Date());
    } catch { setAppointments([]); }
    finally { setLoading(false); }
  };

  const isVerified = doctorProfile?.verification_status === 'verified';

  const today = formatLocalDate(new Date());
  const todayAppts = appointments.filter(a => a.appointment_date === today);
  const pendingAppts = appointments.filter(a => a.status === 'pending');

  // Build last 7 days chart data from real appointments
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d;
  });

  const chartData = last7Days.map(d => {
    const dateStr = formatLocalDate(d);
    const dayAppts = appointments.filter(a => a.appointment_date === dateStr);
    return {
      day: dayLabels[d.getDay()],
      patients: dayAppts.length,
      revenue: dayAppts.reduce((sum, a) => sum + (a.consultation_fee || 0), 0),
    };
  });

  const totalRevenue = chartData.reduce((sum, d) => sum + d.revenue, 0);
  const totalPatients = chartData.reduce((sum, d) => sum + d.patients, 0);
  const uniquePatients = new Set(appointments.map(a => a.patient_name)).size;

  const handleAccept = async (appt, action) => {
    if (!isVerified) return;
    await base44.entities.Appointment.update(appt.id, { status: action });
    load();
  };

  return (
    <Layout role="doctor" title="Doctor Dashboard" subtitle={`Practice overview · Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}>
      <div className="space-y-6 animate-fade-in">
        {/* Verification banner — unverified doctors cannot accept appointments */}
        {!loading && doctorProfile && !isVerified && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3 animate-fade-in">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">
                {doctorProfile.verification_status === 'suspended' ? 'Verification suspended' : 'Verification pending'}
              </p>
              <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                Accepting appointments is disabled until an admin verifies your credentials.
              </p>
              <Link to="/doctor/verification" className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-amber-800 hover:underline">
                Submit verification documents <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        )}

        {/* Do Not Disturb toggle */}
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            {dnd ? <BellOff className="w-5 h-5 text-amber-500" /> : <Bell className="w-5 h-5 text-primary" />}
            <div>
              <p className="text-sm font-semibold">Do Not Disturb</p>
              <p className="text-xs text-muted-foreground">
                {dnd ? 'Incoming calls are blocked. Notification sounds are muted. Chat messages still arrive.' : 'Calls and notifications work normally.'}
              </p>
            </div>
          </div>
          <button
            onClick={toggleDnd}
            disabled={togglingDnd}
            className={`relative w-12 h-6 rounded-full transition-colors ${dnd ? 'bg-amber-500' : 'bg-secondary'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${dnd ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Today's Appointments" value={todayAppts.length} icon={Calendar} accent />
          <StatCard label="Pending Requests" value={pendingAppts.length} icon={Clock} />
          <StatCard label="Weekly Revenue" value={`Rs ${(totalRevenue / 1000).toFixed(1)}k`} icon={DollarSign} />
          <StatCard label="Total Patients" value={uniquePatients} icon={Users} />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Revenue Chart */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Revenue This Week
              </h3>
              <span className="text-xs text-muted-foreground font-mono">Rs {totalRevenue.toLocaleString()}</span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(243 75% 59%)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(243 75% 59%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" stroke="hsl(220 12% 55%)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(220 12% 55%)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={v => `${(v/1000)}k`} />
                <Tooltip
                  contentStyle={{ background: 'hsl(0 0% 100%)', border: '1px solid hsl(220 13% 90%)', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: 'hsl(220 12% 55%)' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="hsl(243 75% 59%)" strokeWidth={2} fill="url(#revGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Patient Volume */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Patient Volume
              </h3>
              <span className="text-xs text-muted-foreground font-mono">{totalPatients} this week</span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData}>
                <XAxis dataKey="day" stroke="hsl(220 12% 55%)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(220 12% 55%)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: 'hsl(0 0% 100%)', border: '1px solid hsl(220 13% 90%)', borderRadius: '8px', fontSize: '12px' }}
                  cursor={{ fill: 'hsl(220 14% 95%)' }}
                />
                <Bar dataKey="patients" fill="hsl(243 75% 59%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pending Requests + Today's Schedule */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Pending Requests */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                Pending Requests
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400">{pendingAppts.length}</span>
              </h2>
              <Link to="/doctor/appointments" className="text-xs text-primary hover:underline flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[1, 2].map(i => <div key={i} className="h-24 rounded-lg bg-card border border-border animate-pulse" />)}
              </div>
            ) : pendingAppts.length > 0 ? (
              <div className="space-y-2">
                {pendingAppts.slice(0, 3).map(appt => (
                  <AppointmentCard key={appt.id} appointment={appt} role="doctor" onJoin={handleAccept} onCancel={handleAccept} />
                ))}
              </div>
            ) : (
              <EmptyState icon={Clock} title="No pending requests" description="New appointment requests will appear here" />
            )}
          </div>

          {/* Today's Schedule */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" />
                Today's Schedule
              </h2>
              <Link to="/doctor/schedule" className="text-xs text-primary hover:underline flex items-center gap-1">
                Calendar <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[1, 2].map(i => <div key={i} className="h-24 rounded-lg bg-card border border-border animate-pulse" />)}
              </div>
            ) : todayAppts.length > 0 ? (
              <div className="space-y-2">
                {todayAppts.slice(0, 4).map(appt => (
                  <AppointmentCard key={appt.id} appointment={appt} role="doctor" onJoin={handleAccept} />
                ))}
              </div>
            ) : (
              <EmptyState icon={Stethoscope} title="No appointments today" description="Your schedule is clear for today" />
            )}
          </div>
        </div>

        {/* Practice Summary */}
        <DoctorSummary doctorId={doctorId} doctorName={doctorName} appointments={appointments} loading={loading} />
      </div>
    </Layout>
  );
}