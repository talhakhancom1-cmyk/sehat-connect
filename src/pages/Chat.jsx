import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useRole } from '@/lib/useRole';
import Layout from '@/components/Layout';
import DoctorAvatar from '@/components/DoctorAvatar';
import EmptyState from '@/components/EmptyState';
import { listMyConversations, otherParty } from '@/lib/conversations';
import { Search, MessageSquare } from 'lucide-react';

export default function Chat() {
  const { user } = useAuth();
  const { role } = useRole();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    const load = async () => {
      try {
        const convos = await listMyConversations(user.id);
        if (!alive) return;
        setConversations(convos);
        const [sent, received] = await Promise.all([
          base44.entities.Message.filter({ sender_id: user.id }, '-created_date', 500).catch(() => []),
          base44.entities.Message.filter({ receiver_id: user.id }, '-created_date', 500).catch(() => []),
        ]);
        if (!alive) return;
        setMessages([...sent, ...received]);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();

    const unsubscribe = base44.entities.Message.subscribe((event) => {
      if (event.type === 'create') {
        const msg = event.data;
        if (msg.sender_id === user.id || msg.receiver_id === user.id) {
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        }
      }
    });
    return () => { alive = false; unsubscribe(); };
  }, [user?.id]);

  const rows = useMemo(() => {
    const byConvo = new Map();
    messages.forEach(msg => {
      if (!msg.conversation_id) return;
      if (!byConvo.has(msg.conversation_id)) byConvo.set(msg.conversation_id, []);
      byConvo.get(msg.conversation_id).push(msg);
    });
    return conversations.map(c => {
      const msgs = (byConvo.get(c.id) || []).sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
      const last = msgs[msgs.length - 1];
      const unread = msgs.filter(m => m.receiver_id === user?.id && !m.read).length;
      const other = otherParty(c, user?.id);
      return { id: c.id, name: other.name, lastMessage: last, unread, sortAt: c.last_message_at || (last?.created_date) };
    }).sort((a, b) => new Date(b.sortAt || 0) - new Date(a.sortAt || 0));
  }, [conversations, messages, user?.id]);

  const filtered = rows.filter(r => !search || r.name?.toLowerCase().includes(search.toLowerCase()));

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const diff = Date.now() - date.getTime();
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return `${Math.floor(diff / 86400000)}d`;
  };

  return (
    <Layout role={role}>
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Chat</h1>
        </div>

        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card border border-border">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground/60"
          />
        </div>

        {loading ? (
          <div className="bg-card rounded-2xl divide-y divide-border/60 shadow-card overflow-hidden">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3 p-3">
                <div className="w-12 h-12 rounded-full shimmer" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 shimmer rounded" />
                  <div className="h-2 w-40 shimmer rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="bg-card rounded-2xl divide-y divide-border/60 shadow-card overflow-hidden">
            {filtered.map((row, i) => (
              <div
                key={row.id}
                onClick={() => navigate(`/chat/${row.id}`)}
                className="flex items-center gap-3 p-3 hover:bg-secondary/30 transition-colors cursor-pointer animate-slide-up"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <DoctorAvatar name={row.name} size="lg" round />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{row.name}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {row.lastMessage?.content || 'No messages yet — tap to start'}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] text-muted-foreground">{formatTime(row.lastMessage?.created_date || row.sortAt)}</span>
                  {row.unread > 0 && (
                    <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center animate-pop-in">
                      {row.unread}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-card rounded-2xl shadow-card">
            <EmptyState
              icon={MessageSquare}
              title="No conversations yet"
              description="Start a chat with your doctor from the appointments page"
            />
          </div>
        )}
      </div>
    </Layout>
  );
}