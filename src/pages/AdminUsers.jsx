import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import Layout from '@/components/Layout';
import { Search, User as UserIcon } from 'lucide-react';
import { isAdmin, isDoctor, EHC_ROLES } from '@/lib/useRole';
import { cn } from '@/lib/utils';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const data = await base44.entities.User.list();
      setUsers(data);
    } catch { setUsers([]); }
    finally { setLoading(false); }
  };

  const handleRoleChange = async (userId, role) => {
    await base44.entities.User.update(userId, { role });
    load();
  };

  const filtered = users.filter(u =>
    !search || u.email?.toLowerCase().includes(search.toLowerCase()) || u.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout role="admin" title="User Management">
      <div className="space-y-4 animate-fade-in">
        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card border border-border max-w-md">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users…" className="bg-transparent text-sm outline-none flex-1" />
        </div>

        {/* User List */}
        {loading ? (
          <div className="bg-card rounded-2xl shadow-card divide-y divide-border/60">
            {[1, 2, 3, 4].map(i => <div key={i} className="flex items-center gap-3 p-3"><div className="w-10 h-10 rounded-full shimmer" /><div className="flex-1 h-4 shimmer rounded" /></div>)}
          </div>
        ) : filtered.length > 0 ? (
          <div className="bg-card rounded-2xl divide-y divide-border/60 shadow-card overflow-hidden">
            {filtered.map((user, i) => (
              <div key={user.id} className="flex items-center gap-3 p-3 animate-slide-up" style={{ animationDelay: `${i * 40}ms` }}>
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-primary">
                    {(user.full_name || user.email || 'U')[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{user.full_name || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {user.role && (
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-[10px] font-medium capitalize',
                      isAdmin(user.role) ? 'bg-green-50 text-green-600 border border-green-100' :
                      isDoctor(user.role, user.app_role) ? 'bg-indigo-50 text-indigo-600' :
                      'bg-blue-50 text-blue-600'
                    )}>
                      {isAdmin(user.role) ? 'admin' : isDoctor(user.role, user.app_role) ? 'doctor' : 'patient'}
                    </span>
                  )}
                  <button
                    onClick={() => handleRoleChange(user.id, isAdmin(user.role) ? EHC_ROLES.PATIENT : EHC_ROLES.SUPER_ADMIN)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all active:scale-95',
                      isAdmin(user.role)
                        ? 'bg-green-50 text-green-600 border border-green-100'
                        : 'bg-secondary text-muted-foreground border border-border'
                    )}
                  >
                    {isAdmin(user.role) ? 'Admin' : 'Make Admin'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-card rounded-2xl shadow-card p-8 text-center">
            <UserIcon className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No users found</p>
          </div>
        )}
      </div>
    </Layout>
  );
}