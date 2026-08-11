import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import Layout from '@/components/Layout';
import StatCard from '@/components/StatCard';
import DoctorAvatar from '@/components/DoctorAvatar';
import StatusBadge from '@/components/StatusBadge';
import { Stethoscope, Users, Calendar, DollarSign, ShieldCheck, Ban } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar } from 'recharts';
import { formatAppointmentDate } from '@/lib/utils';

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function AdminDashboard() {
  const [doctors, setDoctors] = useState([]);
  const [users, setUsers] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [docs, usrs, appts] = await Promise.all([
        base44.entities.Doctor.list('-created_date', 500).catch(() => []),
        base44.entities.User.list().catch(() => []),
        base44.entities.Appointment.list('-appointment_date', 200).catch(() => []),
      ]);
      setDoctors(docs);
      setUsers(usrs);
      setAppointments(appts);
    } finally { setLoading(false); }
  };

  const pendingDoctors = doctors.filter(d => d.verification_status === 'pending');
  const verifiedDoctors = doctors.filter(d => d.verification_status === 'verified');
  const totalPatients = users.filter(u => u.app_role === 'patient').length;
  const totalRevenue = appointments.filter(a => a.payment_status === 'paid').reduce((sum, a) => sum + (a.consultation_fee || 0), 0);

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
      appointments: dayAppts.length,
      revenue: dayAppts.reduce((sum, a) => sum + (a.consultation_fee || 0), 0),
    };
  });

  const handleVerify = async (doctorId, status) => {
    if (verifyingId) return;
    setVerifyingId(doctorId);
    try {
      await base44.entities.Doctor.update(doctorId, { verification_status: status });
      load();
    } catch (e) {
      console.error(e);
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <Layout role="admin" title="Admin Dashboard">
      <div className="space-y-6 animate-fade-in">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Doctors" value={verifiedDoctors.length} icon={Stethoscope} accent />
          <StatCard label="Total Patients" value={totalPatients} icon={Users} />
          <StatCard label="Appointments" value={appointments.length} icon={Calendar} />
          <StatCard label="Revenue" value={`Rs ${(totalRevenue / 1000).toFixed(1)}k`} icon={DollarSign} />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card rounded-2xl p-4 shadow-card">
            <h3 className="text-sm font-semibold mb-4">Appointments (7 days)</h3>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="apptGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(243 75% 59%)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(243 75% 59%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" stroke="hsl(220 9% 46%)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(220 9% 46%)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: 'white', border: '1px solid hsl(220 13% 90%)', borderRadius: '8px', fontSize: '12px' }} />
                <Area type="monotone" dataKey="appointments" stroke="hsl(243 75% 59%)" strokeWidth={2} fill="url(#apptGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card rounded-2xl p-4 shadow-card">
            <h3 className="text-sm font-semibold mb-4">Revenue (7 days)</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData}>
                <XAxis dataKey="day" stroke="hsl(220 9% 46%)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(220 9% 46%)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000)}k`} />
                <Tooltip contentStyle={{ background: 'white', border: '1px solid hsl(220 13% 90%)', borderRadius: '8px', fontSize: '12px' }} cursor={{ fill: 'hsl(220 14% 95%)' }} />
                <Bar dataKey="revenue" fill="hsl(243 75% 59%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pending Doctor Verifications */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-base">Pending Verifications</h2>
            <Link to="/admin/doctors" className="text-primary text-sm font-medium">See All</Link>
          </div>
          {loading ? (
            <div className="bg-card rounded-2xl shadow-card divide-y divide-border/60">
              {[1, 2].map(i => <div key={i} className="flex items-center gap-3 p-3"><div className="w-10 h-10 rounded-full shimmer" /><div className="flex-1 h-4 shimmer rounded" /></div>)}
            </div>
          ) : pendingDoctors.length > 0 ? (
            <div className="bg-card rounded-2xl divide-y divide-border/60 shadow-card overflow-hidden">
              {pendingDoctors.slice(0, 5).map((doc, i) => (
                <div key={doc.id} className="flex items-center gap-3 p-3 animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
                  <DoctorAvatar name={doc.full_name} imageUrl={doc.image_url} size="md" round />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{doc.full_name}</p>
                    <p className="text-xs text-muted-foreground">{doc.specialty} · {doc.city}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => handleVerify(doc.id, 'verified')} disabled={verifyingId === doc.id} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50">
                      <ShieldCheck className="w-3.5 h-3.5" /> {verifyingId === doc.id ? 'Verifying…' : 'Verify'}
                    </button>
                    <button onClick={() => handleVerify(doc.id, 'suspended')} disabled={verifyingId === doc.id} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-50 text-red-600 border border-red-100 text-xs font-semibold hover:bg-red-100 active:scale-95 transition-all disabled:opacity-50">
                      <Ban className="w-3.5 h-3.5" /> {verifyingId === doc.id ? 'Rejecting…' : 'Reject'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-2xl shadow-card p-6 text-center">
              <ShieldCheck className="w-8 h-8 mx-auto text-green-500 mb-2" />
              <p className="text-sm text-muted-foreground">All doctors verified</p>
            </div>
          )}
        </div>

        {/* Recent Appointments */}
        <div>
          <h2 className="font-bold text-base mb-3">Recent Appointments</h2>
          {loading ? (
            <div className="bg-card rounded-2xl shadow-card divide-y divide-border/60">
              {[1, 2, 3].map(i => <div key={i} className="flex items-center gap-3 p-3"><div className="w-10 h-10 rounded-full shimmer" /><div className="flex-1 h-4 shimmer rounded" /></div>)}
            </div>
          ) : appointments.length > 0 ? (
            <div className="bg-card rounded-2xl divide-y divide-border/60 shadow-card overflow-hidden">
              {appointments.slice(0, 6).map((appt, i) => (
                <div key={appt.id} className="flex items-center gap-3 p-3 animate-slide-up" style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{appt.patient_name} → {appt.doctor_name}</p>
                    <p className="text-xs text-muted-foreground">{formatAppointmentDate(appt.appointment_date)} · {appt.time_slot} · Rs {Number(appt.consultation_fee || 0).toLocaleString()}</p>
                  </div>
                  <StatusBadge status={appt.status} />
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-2xl shadow-card p-6 text-center">
              <Calendar className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No appointments yet</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}