import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import Layout from '@/components/Layout';
import { Search, User as UserIcon, KeyRound, UserCog, Loader2, X, Shield, AlertCircle } from 'lucide-react';
import { isAdmin, isDoctor, EHC_ROLES } from '@/lib/useRole';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

async function apiRequest(path, { method = 'GET', body } = {}) {
  const token = localStorage.getItem('ehc_token');
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [resetting, setResetting] = useState(false);
  const [impersonating, setImpersonating] = useState(false);

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

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    if (!confirm(`Reset password for ${selectedUser.email}? A temporary password will be emailed to them.`)) return;
    setResetting(true);
    try {
      const result = await apiRequest(`/users/${selectedUser.id}/reset-password`, { method: 'POST' });
      if (result.temp_password) {
        toast({
          title: 'Password reset (email failed)',
          description: `Temp password: ${result.temp_password} — share this securely with the user.`,
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Password reset', description: result.message || `Temporary password emailed to ${selectedUser.email}` });
      }
      setSelectedUser(null);
    } catch (err) {
      toast({ title: 'Reset failed', description: err.message, variant: 'destructive' });
    } finally {
      setResetting(false);
    }
  };

  const handleImpersonate = async () => {
    if (!selectedUser) return;
    if (!confirm(`Start impersonating ${selectedUser.email}? This will be logged. You'll see the app as they see it.`)) return;
    setImpersonating(true);
    try {
      // Save the current admin token before switching
      const currentToken = localStorage.getItem('ehc_token');
      localStorage.setItem('ehc_admin_token', currentToken);

      const result = await apiRequest(`/auth/impersonate/${selectedUser.id}`, { method: 'POST' });
      // Switch to the impersonation token
      localStorage.setItem('ehc_token', result.token);
      // Redirect to the user's home page
      window.location.href = '/';
    } catch (err) {
      localStorage.removeItem('ehc_admin_token');
      toast({ title: 'Impersonation failed', description: err.message, variant: 'destructive' });
    } finally {
      setImpersonating(false);
    }
  };

  const canResetPassword = currentUser?.role === 'super_admin' || currentUser?.role === 'clinic_admin' || currentUser?.permissions?.can_reset_passwords;
  const canImpersonate = currentUser?.role === 'super_admin' || currentUser?.role === 'clinic_admin' || currentUser?.permissions?.can_impersonate;

  const filtered = users.filter(u =>
    !search || u.email?.toLowerCase().includes(search.toLowerCase()) || u.display_name?.toLowerCase().includes(search.toLowerCase()) || u.full_name?.toLowerCase().includes(search.toLowerCase())
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
                    {(user.display_name || user.email || 'U')[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{user.display_name || 'Unknown'}</p>
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
                    onClick={() => setSelectedUser(user)}
                    className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all active:scale-95 flex items-center gap-1"
                  >
                    <UserCog className="w-3 h-3" /> Manage
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

      {/* User detail modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setSelectedUser(null)}>
          <div className="bg-card rounded-2xl shadow-xl max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-bold">User Details</h3>
              <button onClick={() => setSelectedUser(null)} className="p-2 rounded-full hover:bg-secondary">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* User info */}
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-lg font-bold text-primary">
                    {(selectedUser.display_name || selectedUser.email || 'U')[0].toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="font-bold">{selectedUser.display_name || 'Unknown'}</p>
                  <p className="text-sm text-muted-foreground truncate">{selectedUser.email}</p>
                  <p className="text-xs text-muted-foreground capitalize">{selectedUser.role} · {selectedUser.app_role}</p>
                </div>
              </div>

              {/* Role toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/20">
                <span className="text-sm font-medium">Role</span>
                <button
                  onClick={() => handleRoleChange(selectedUser.id, isAdmin(selectedUser.role) ? EHC_ROLES.PATIENT : EHC_ROLES.SUPER_ADMIN)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-semibold transition-all',
                    isAdmin(selectedUser.role)
                      ? 'bg-green-50 text-green-600 border border-green-100'
                      : 'bg-secondary text-muted-foreground border border-border'
                  )}
                >
                  {isAdmin(selectedUser.role) ? 'Admin' : 'Make Admin'}
                </button>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                {canResetPassword && (
                  <button
                    onClick={handleResetPassword}
                    disabled={resetting || selectedUser.id === currentUser?.id}
                    className="w-full flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50 text-sm font-medium"
                  >
                    {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                    Reset Password & Email
                  </button>
                )}

                {canImpersonate && !isAdmin(selectedUser.role) && selectedUser.id !== currentUser?.id && (
                  <button
                    onClick={handleImpersonate}
                    disabled={impersonating}
                    className="w-full flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50 text-sm font-medium"
                  >
                    {impersonating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                    Impersonate User
                  </button>
                )}

                {selectedUser.id === currentUser?.id && (
                  <p className="text-xs text-muted-foreground text-center py-2">You cannot reset your own password or impersonate yourself.</p>
                )}

                {isAdmin(selectedUser.role) && !canImpersonate && (
                  <p className="text-xs text-muted-foreground text-center py-2">Admin accounts cannot be impersonated.</p>
                )}
              </div>

              {/* Warning notice */}
              <div className="p-3 rounded-lg bg-muted/30 text-xs text-muted-foreground flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>All actions are logged in the audit trail with your admin identity, timestamp, and IP address.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
