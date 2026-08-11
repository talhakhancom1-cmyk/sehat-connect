import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, FileText, Calendar, MessageSquare, LayoutGrid, CalendarDays, Users, Stethoscope, ShieldCheck, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';

const patientNav = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/records', icon: FileText, label: 'Records' },
  { path: '/appointments', icon: Calendar, label: 'Appts' },
  { path: '/access', icon: ShieldCheck, label: 'Access' },
  { path: '/chat', icon: MessageSquare, label: 'Chat' },
];

const doctorNav = [
  { path: '/doctor', icon: LayoutGrid, label: 'Home' },
  { path: '/doctor/appointments', icon: CalendarDays, label: 'Appts' },
  { path: '/doctor/calendar', icon: Calendar, label: 'Calendar' },
  { path: '/doctor/patients', icon: Users, label: 'Patients' },
  { path: '/chat', icon: MessageSquare, label: 'Chat' },
  { path: '/doctor/schedule', icon: Stethoscope, label: 'Schedule' },
];

const adminNav = [
  { path: '/admin', icon: LayoutGrid, label: 'Home' },
  { path: '/admin/doctors', icon: Stethoscope, label: 'Doctors' },
  { path: '/admin/users', icon: Users, label: 'Users' },
  { path: '/admin/audit', icon: ClipboardList, label: 'Audit' },
];

export default function BottomNav({ role = 'patient' }) {
  const location = useLocation();
  const nav = role === 'doctor' ? doctorNav : role === 'admin' ? adminNav : patientNav;

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-white/95 backdrop-blur-xl safe-area-bottom">
      <div className="flex items-center justify-around px-2 py-1.5">
        {nav.map(item => {
          const Icon = item.icon;
          const active = location.pathname === item.path || (item.path === '/chat' && location.pathname.startsWith('/chat/'));
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1.5 min-h-[44px] justify-center transition-colors',
                active ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <Icon className="w-5 h-5" strokeWidth={2} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}