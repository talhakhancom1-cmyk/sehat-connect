import React, { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/Layout';
import EmptyState from '@/components/EmptyState';
import { Bell, CheckCheck, MessageCircle, CalendarClock, CalendarCheck, Pill, ShieldAlert, ShieldCheck, Users, CreditCard, Info } from 'lucide-react';
import { listNotifications, markRead, markAllRead, deepLinkFor, iconFor } from '@/lib/notifications';
import { useAuth } from '@/lib/AuthContext';
import { useRole } from '@/lib/useRole';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';

const ICONS = { MessageCircle, CalendarClock, CalendarCheck, Pill, ShieldAlert, ShieldCheck, Users, CreditCard, Info, Bell };

export default function NotificationsPage() {
  const { user } = useAuth();
  const { role } = useRole();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setItems(await listNotifications(50));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const unread = items.filter(n => !n.read).length;

  const handleOpen = async (n) => {
    if (!n.read) await markRead(n.id);
    navigate(deepLinkFor(n));
  };

  const handleMarkAll = async () => {
    await markAllRead();
    load();
  };

  return (
    <Layout role={role} title="Notifications">
      <div className="max-w-2xl mx-auto">
        {unread > 0 && (
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">{unread} unread</p>
            <button onClick={handleMarkAll} className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
              <CheckCheck className="w-3.5 h-3.5" /> Mark all read
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-16 rounded-xl shimmer" />)}
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={Bell} title="No notifications yet" description="Appointment reminders, medication alerts, and chat updates will appear here." />
        ) : (
          <div className="space-y-1.5">
            {items.map(n => {
              const Icon = ICONS[iconFor(n.type)] || Bell;
              return (
                <button
                  key={n.id}
                  onClick={() => handleOpen(n)}
                  className={`w-full flex items-start gap-3 p-3.5 rounded-xl border transition-all text-left hover:shadow-soft ${n.read ? 'bg-card border-border' : 'bg-primary/[0.03] border-primary/20'}`}
                >
                  <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${n.read ? 'bg-secondary' : 'bg-primary/10'}`}>
                    <Icon className={`w-4 h-4 ${n.read ? 'text-muted-foreground' : 'text-primary'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm ${n.read ? 'font-medium text-foreground' : 'font-semibold text-foreground'}`}>{n.title}</p>
                      {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                    </div>
                    {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                    <p className="text-[11px] text-muted-foreground mt-1">{moment(n.created_date).fromNow()}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}