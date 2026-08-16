import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Activity, Menu, ChevronRight, Search, Bell, Siren, LogOut, Home, Stethoscope, LayoutGrid } from 'lucide-react';
import { Sheet, SheetContent, SheetClose, SheetTrigger } from '@/components/ui/sheet';
import { patientNav, doctorNav, adminNav } from '@/components/Sidebar';
import { useAuth } from '@/lib/AuthContext';
import { isAdmin, isDoctor } from '@/lib/useRole';
import { cn } from '@/lib/utils';

const isActive = (pathname, item) =>
  pathname === item.path || (item.path === '/chat' && pathname.startsWith('/chat/'));

export default function MobileNav({ role = 'patient' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const nav = role === 'doctor' ? doctorNav : role === 'admin' ? adminNav : patientNav;
  const homePath = role === 'doctor' ? '/doctor' : role === 'admin' ? '/admin' : '/';

  // Close the drawer whenever the route changes so it never lingers over a new page
  useEffect(() => { setOpen(false); }, [location.pathname]);

  const name = user?.display_name?.split(' ')[0] || user?.full_name?.split(' ')[0] || 'there';
  const initial = (user?.display_name || user?.full_name || user?.email || 'U')[0].toUpperCase();

  const portals = [
    { path: '/', icon: Home, label: 'Patient', show: true, key: 'patient' },
    { path: '/doctor', icon: Stethoscope, label: 'Doctor', show: isDoctor(user?.role, user?.app_role), key: 'doctor' },
    { path: '/admin', icon: LayoutGrid, label: 'Admin', show: isAdmin(user?.role), key: 'admin' },
  ].filter(p => p.show);

  const quickLinks = [
    { to: '/notifications', icon: Bell, label: 'Notifications' },
    { to: '/doctors', icon: Search, label: 'Find a Doctor' },
    { to: '/emergency', icon: Siren, label: 'Emergency SOS', danger: true },
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          aria-label="Open menu"
          className="lg:hidden -ml-2 p-2.5 min-h-[44px] min-w-[44px] rounded-full hover:bg-secondary transition-colors active:scale-95"
        >
          <Menu className="w-5 h-5 text-foreground" />
        </button>
      </SheetTrigger>

      <SheetContent
        side="left"
        className="p-0 border-0 w-[84%] sm:max-w-xs bg-white/75 backdrop-blur-2xl rounded-r-[28px] shadow-soft-lg"
      >
        <div className="h-full flex flex-col">
          {/* Brand + safe area */}
          <div className="px-5 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-4">
            <Link to={homePath} className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-primary" strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-[15px] font-bold tracking-tight leading-none">EcoHealth<span className="text-primary">.</span></p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{role} portal</p>
              </div>
            </Link>
          </div>

          {/* User card */}
          <div className="px-4 pb-2">
            <div className="flex items-center gap-3 px-3 py-3 rounded-2xl bg-black/[0.03]">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                {initial}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{user?.display_name || user?.full_name || 'User'}</p>
                <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
              </div>
            </div>
          </div>

          {/* Scrollable menu */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-4 pb-4 space-y-5">
            {/* Navigation list */}
            <nav className="space-y-1">
              {nav.map((item) => {
                const Icon = item.icon;
                const active = isActive(location.pathname, item);
                return (
                  <SheetClose asChild key={item.path}>
                    <Link
                      to={item.path}
                      className={cn(
                        'flex items-center gap-3 px-3 min-h-[48px] rounded-2xl text-[15px] font-medium transition-all active:scale-[0.98]',
                        active
                          ? 'bg-primary text-primary-foreground shadow-soft'
                          : 'text-foreground/80 hover:bg-black/[0.04]'
                      )}
                    >
                      <span className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                        active ? 'bg-white/20' : 'bg-black/[0.05]'
                      )}>
                        <Icon className="w-4 h-4" strokeWidth={2} />
                      </span>
                      <span className="flex-1">{item.label}</span>
                      {active && <ChevronRight className="w-4 h-4 opacity-70" />}
                    </Link>
                  </SheetClose>
                );
              })}
            </nav>

            {/* Quick links */}
            <div className="space-y-1">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Quick Links</p>
              {quickLinks.map((q) => {
                const Icon = q.icon;
                return (
                  <SheetClose asChild key={q.to}>
                    <Link
                      to={q.to}
                      className={cn(
                        'flex items-center gap-3 px-3 min-h-[48px] rounded-2xl text-[15px] font-medium transition-all active:scale-[0.98]',
                        q.danger ? 'text-destructive hover:bg-destructive/5' : 'text-foreground/80 hover:bg-black/[0.04]'
                      )}
                    >
                      <span className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                        q.danger ? 'bg-destructive/10' : 'bg-black/[0.05]'
                      )}>
                        <Icon className="w-4 h-4" strokeWidth={2} />
                      </span>
                      <span className="flex-1">{q.label}</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </Link>
                  </SheetClose>
                );
              })}
            </div>
          </div>

          {/* Portal switch (segmented) + logout */}
          <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 border-t border-black/5">
            {portals.length > 1 && (
              <div className="flex p-1 mt-3 mb-2 rounded-xl bg-black/[0.05]">
                {portals.map((p) => {
                  const Icon = p.icon;
                  const active = role === p.key;
                  return (
                    <button
                      key={p.path}
                      onClick={() => navigate(p.path)}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all',
                        active ? 'bg-white text-primary shadow-sm' : 'text-muted-foreground'
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {p.label}
                    </button>
                  );
                })}
              </div>
            )}
            <SheetClose asChild>
              <button
                onClick={() => logout()}
                className="w-full flex items-center gap-3 px-3 min-h-[48px] rounded-2xl text-[15px] font-medium text-destructive hover:bg-destructive/5 transition-all active:scale-[0.98]"
              >
                <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-destructive/10">
                  <LogOut className="w-4 h-4" strokeWidth={2} />
                </span>
                <span>Log Out</span>
              </button>
            </SheetClose>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}