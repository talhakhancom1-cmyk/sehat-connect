import React, { useEffect, useState, useCallback } from 'react';
import { Bell, Search, Siren, LogOut, Home, Stethoscope, LayoutGrid, MessageCircle, CalendarClock, CalendarCheck, Pill, ShieldAlert, ShieldCheck, Users, CreditCard, Info, CheckCheck, UserCog } from 'lucide-react';
import MobileNav from '@/components/MobileNav';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { isAdmin, isDoctor } from '@/lib/useRole';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn, authFileUrl } from '@/lib/utils';
import { listNotifications, markRead, markAllRead, deepLinkFor, iconFor } from '@/lib/notifications';
import { onNotificationNew, onMessageNew } from '@/lib/socketClient';
import { playNotificationBeep, primeAudio } from '@/lib/notificationSound';
import moment from 'moment';

const ICONS = { MessageCircle, CalendarClock, CalendarCheck, Pill, ShieldAlert, ShieldCheck, Users, CreditCard, Info, Bell };

export default function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    const list = await listNotifications(8);
    setNotifications(list);
    setUnread(list.filter(n => !n.read).length);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);

    // Prime audio on first user interaction (browser autoplay policy)
    primeAudio();

    // Play beep + reload notifications when a new one arrives in real time
    const unsubNotif = onNotificationNew((notification) => {
      console.log('[TopBar] real-time notification:new', notification);
      playNotificationBeep();
      load(); // refresh the notification list
    });

    // Also beep on new chat messages (if not in the active chat thread)
    const unsubMsg = onMessageNew((message) => {
      // Only beep if the user is not currently viewing the chat thread
      const inChatThread = location.pathname.startsWith('/chat/');
      if (!inChatThread) {
        playNotificationBeep();
      }
    });

    return () => {
      clearInterval(id);
      unsubNotif();
      unsubMsg();
    };
  }, [load, location.pathname]);

  const openNotification = async (n) => {
    if (!n.read) { await markRead(n.id); load(); }
    navigate(deepLinkFor(n));
  };

  const handleMarkAll = async () => {
    await markAllRead();
    load();
  };
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = user?.display_name?.split(' ')[0] || user?.full_name?.split(' ')[0] || 'there';
  const initial = (user?.display_name || user?.full_name || user?.email || 'U')[0].toUpperCase();
  const role = location.pathname.startsWith('/doctor') ? 'doctor' : location.pathname.startsWith('/admin') ? 'admin' : 'patient';

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-border safe-area-top">
      <div className="flex items-center justify-between px-4 lg:px-6 py-3 opacity-100">
        {/* Greeting */}
        <div className="flex items-center gap-2.5">
          <MobileNav role={role} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0 hover:bg-primary/20 transition-colors overflow-hidden">
                {user?.profile_pic_url ? (
                  <img src={authFileUrl(user.profile_pic_url)} alt="" className="w-full h-full object-cover" />
                ) : (
                  initial
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-medium leading-none">{user?.display_name || user?.full_name || 'User'}</p>
                <p className="text-xs text-muted-foreground mt-1">{user?.email}</p>
                {user?.role &&
                <span className="inline-block mt-1.5 text-[10px] font-semibold uppercase text-primary">{user.role.replace(/_/g, ' ')}</span>
                }
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => navigate('/profile')}
                className={cn('cursor-pointer', location.pathname === '/profile' && 'bg-primary/10 text-primary')}>
                <UserCog className="w-4 h-4 mr-2" /> My Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">Switch Portal</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => navigate('/')}
                className={cn('cursor-pointer', location.pathname === '/' && 'bg-primary/10 text-primary')}>
                
                <Home className="w-4 h-4 mr-2" /> Patient Portal
              </DropdownMenuItem>
              {isDoctor(user?.role, user?.app_role) &&
              <DropdownMenuItem
                onClick={() => navigate('/doctor')}
                className={cn('cursor-pointer', location.pathname.startsWith('/doctor') && 'bg-primary/10 text-primary')}>
                
                  <Stethoscope className="w-4 h-4 mr-2" /> Doctor Portal
                </DropdownMenuItem>
              }
              {isAdmin(user?.role) &&
              <DropdownMenuItem
                onClick={() => navigate('/admin')}
                className={cn('cursor-pointer', location.pathname.startsWith('/admin') && 'bg-primary/10 text-primary')}>
                
                  <LayoutGrid className="w-4 h-4 mr-2" /> Admin Portal
                </DropdownMenuItem>
              }
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => logout()}
                className="text-destructive focus:text-destructive cursor-pointer">
                
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="hidden sm:block">
            <p className="text-[11px] text-muted-foreground leading-none">Hey!</p>
            <p className="text-sm font-bold text-foreground mt-0.5">{greeting}, {name}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Link to="/doctors" className="p-2 rounded-full hover:bg-secondary transition-colors">
            <Search className="w-4 h-4 text-muted-foreground" />
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="relative p-2 rounded-full hover:bg-secondary transition-colors">
                <Bell className="w-4 h-4 text-muted-foreground" />
                {unread > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <div className="flex items-center justify-between px-2 py-1.5">
                <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
                {unread > 0 && (
                  <button onClick={handleMarkAll} className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1">
                    <CheckCheck className="w-3 h-3" /> Mark all
                  </button>
                )}
              </div>
              <DropdownMenuSeparator />
              {notifications.length > 0 ?
              notifications.map((n) => {
                const Icon = ICONS[iconFor(n.type)] || Bell;
                return (
                  <DropdownMenuItem key={n.id} onClick={() => openNotification(n)} className="flex items-start gap-2.5 py-2.5 cursor-pointer">
                    <div className={cn('shrink-0 w-8 h-8 rounded-lg flex items-center justify-center', n.read ? 'bg-secondary' : 'bg-primary/10')}>
                      <Icon className={cn('w-3.5 h-3.5', n.read ? 'text-muted-foreground' : 'text-primary')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-xs leading-tight', n.read ? 'font-medium text-foreground' : 'font-semibold text-foreground')}>{n.title}</p>
                      {n.body && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{n.body}</p>}
                      <p className="text-[10px] text-muted-foreground mt-0.5">{moment(n.created_date).fromNow()}</p>
                    </div>
                    {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" />}
                  </DropdownMenuItem>
                );
              }) :
              <div className="py-6 px-2 text-center">
                <Bell className="w-5 h-5 mx-auto text-muted-foreground mb-1.5" />
                <p className="text-xs text-muted-foreground">No new notifications</p>
              </div>
              }
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/notifications" className="text-xs font-semibold text-primary justify-center cursor-pointer">View all notifications</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Link
            to="/emergency"
            className="flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 transition-all ml-1">
            
            <Siren className="w-3.5 h-3.5" />
            <span className="text-xs font-semibold hidden sm:inline">SOS</span>
          </Link>
        </div>
      </div>
    </header>);

}