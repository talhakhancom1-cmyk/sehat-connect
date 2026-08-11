import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, FileText, Calendar, MessageSquare, LayoutGrid, CalendarDays, Users, Stethoscope, Activity, ShieldCheck, ClipboardList, Pill, ClipboardCheck, CalendarClock, UploadCloud, IdCard, QrCode, UsersRound, Bell, Globe, Radar, KeyRound, Mail, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import PartnerCredit from '@/components/PartnerCredit';

export const patientNav = [
  { label: 'Home', path: '/', icon: Home },
  { label: 'Records', path: '/records', icon: FileText },
  { label: 'Timeline', path: '/timeline', icon: CalendarClock },
  { label: 'Import record', path: '/records/import', icon: UploadCloud },
  { label: 'Appointments', path: '/appointments', icon: Calendar },
  { label: 'Medications', path: '/medications', icon: Pill },
  { label: 'Health Cards', path: '/cards', icon: IdCard },
  { label: 'Household', path: '/household', icon: UsersRound },
  { label: 'Manage Access', path: '/access', icon: ShieldCheck },
  { label: 'Chat', path: '/chat', icon: MessageSquare },
  { label: 'Notifications', path: '/notifications', icon: Bell },
];

export const doctorNav = [
  { label: 'Dashboard', path: '/doctor', icon: LayoutGrid },
  { label: 'Appointments', path: '/doctor/appointments', icon: CalendarDays },
  { label: 'Calendar', path: '/doctor/calendar', icon: Calendar },
  { label: 'Patients', path: '/doctor/patients', icon: Users },
  { label: 'Prescriptions', path: '/doctor/prescriptions', icon: FileText },
  { label: 'Encounters', path: '/doctor/encounters', icon: ClipboardCheck },
  { label: 'Verify card', path: '/doctor/verify-card', icon: QrCode },
  { label: 'Chat', path: '/chat', icon: MessageSquare },
  { label: 'Notifications', path: '/notifications', icon: Bell },
  { label: 'Schedule', path: '/doctor/schedule', icon: Stethoscope },
];

export const adminNav = [
  { label: 'Dashboard', path: '/admin', icon: LayoutGrid },
  { label: 'Doctors', path: '/admin/doctors', icon: Stethoscope },
  { label: 'Users', path: '/admin/users', icon: Users },
  { label: 'Audit Log', path: '/admin/audit', icon: ClipboardList },
  { label: 'Country Config', path: '/admin/config', icon: Globe },
  { label: 'Tracking Pixels', path: '/admin/pixels', icon: Radar },
  { label: 'API Keys', path: '/admin/api-keys', icon: KeyRound },
  { label: 'Email / SMTP', path: '/admin/email', icon: Mail },
  { label: 'AI Config', path: '/admin/ai-config', icon: Bot },
];

export default function Sidebar({ role = 'patient' }) {
  const location = useLocation();
  const nav = role === 'doctor' ? doctorNav : role === 'admin' ? adminNav : patientNav;

  return (
    <aside className="hidden lg:flex w-64 shrink-0 border-r border-border bg-white flex-col h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-border">
        <Link to={role === 'doctor' ? '/doctor' : role === 'admin' ? '/admin' : '/'} className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Activity className="w-4 h-4 text-primary" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-sm font-bold tracking-tight">Sehat<span className="text-primary">.</span></p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{role} portal</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.path || (item.path === '/chat' && location.pathname.startsWith('/chat/'));
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" strokeWidth={2} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-border">
        <PartnerCredit />
      </div>
    </aside>
  );
}