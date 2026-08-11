import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import Layout from '@/components/Layout';
import EmptyState from '@/components/EmptyState';
import StatusBadge from '@/components/StatusBadge';
import HouseholdMemberForm from '@/components/HouseholdMemberForm';
import DelegationForm from '@/components/DelegationForm';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Home, Users, UserPlus, ShieldCheck, Ban, Crown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

const scopeLabel = { booking: 'Book appointments', payment: 'Make payments', record_view: 'View records' };

export default function Household() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [household, setHousehold] = useState(null);
  const [members, setMembers] = useState([]);
  const [delegations, setDelegations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [showDelegationForm, setShowDelegationForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [granting, setGranting] = useState(false);
  const [revokingId, setRevokingId] = useState(null);

  useEffect(() => { if (user?.id) load(); }, [user?.id]);

  const load = async () => {
    try {
      const hs = await base44.entities.Household.filter({ member_ids: user.id }, '-created_date', 5);
      const h = hs.find((x) => x.status === 'active') || hs[0];
      setHousehold(h || null);
      if (h) {
        const ms = await base44.entities.HouseholdMember.filter({ household_id: h.id }, '-added_at', 50);
        setMembers(ms);
        const ds = await base44.entities.Delegation.filter({ household_id: h.id, delegator_user_id: user.id }, '-granted_at', 50);
        setDelegations(ds);
      }
    } catch { setHousehold(null); }
    finally { setLoading(false); }
  };

  const createHousehold = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const h = await base44.entities.Household.create({ name: name.trim(), head_user_id: user.id, head_name: user.full_name, member_ids: [user.id], status: 'active' });
      await base44.entities.HouseholdMember.create({ household_id: h.id, household_name: h.name, user_id: user.id, user_name: user.full_name, user_email: user.email, role: 'head', added_by: user.id, added_at: new Date().toISOString(), status: 'active' });
      toast({ title: 'Household created' });
      setName('');
      load();
    } catch (e) { toast({ title: 'Could not create household', description: e.message, variant: 'destructive' }); }
    finally { setCreating(false); }
  };

  const addMember = async ({ email, name: memberName, role, relationship, is_minor }) => {
    if (!household || addingMember) return;
    setAddingMember(true);
    try {
      let userId = email;
      if (email) {
        try {
          const invited = await base44.users.inviteUser(email, 'user');
          userId = invited?.id || invited || email;
        } catch (e) {
          // If invite fails (e.g. already registered), continue with email as the reference
          userId = email;
        }
      }
      await base44.entities.HouseholdMember.create({
        household_id: household.id, household_name: household.name,
        user_id: userId, user_name: memberName, user_email: email || undefined,
        role, relationship, is_minor,
        added_by: user.id, added_at: new Date().toISOString(), status: 'active',
      });
      await base44.entities.Household.update(household.id, { member_ids: [...new Set([...(household.member_ids || []), userId])] });
      await base44.entities.AuditEvent.create({ actor_user_id: user.id, actor_role: 'patient', action: 'household_invite', target_type: 'Household', target_id: household.id, patient_id: user.id, detail: `Invited ${memberName || email}` });
      toast({ title: 'Member added' });
      setShowMemberForm(false);
      load();
    } catch (e) {
      toast({ title: 'Could not add member', description: e.message, variant: 'destructive' });
    } finally {
      setAddingMember(false);
    }
  };

  const removeMember = async (m) => {
    if (m.user_id === user.id) { toast({ title: 'You cannot remove yourself', variant: 'destructive' }); return; }
    if (removingId) return;
    if (!confirm(`Remove ${m.user_name || m.user_email}?`)) return;
    setRemovingId(m.id);
    try {
      await base44.entities.HouseholdMember.update(m.id, { status: 'removed' });
      await base44.entities.Household.update(household.id, { member_ids: (household.member_ids || []).filter((id) => id !== m.user_id) });
      await base44.entities.AuditEvent.create({ actor_user_id: user.id, actor_role: 'patient', action: 'household_revoke', target_type: 'HouseholdMember', target_id: m.id, patient_id: user.id, detail: `Removed ${m.user_name || m.user_email}` });
      toast({ title: 'Member removed' });
      load();
    } catch (e) {
      toast({ title: 'Could not remove member', description: e.message, variant: 'destructive' });
    } finally {
      setRemovingId(null);
    }
  };

  const grantDelegation = async ({ delegatee_user_id, scope, record_view_categories, expires_hours }) => {
    if (granting) return;
    setGranting(true);
    try {
      const expiresAt = new Date(Date.now() + expires_hours * 3600 * 1000).toISOString();
      const member = members.find((m) => m.user_id === delegatee_user_id);
      await base44.entities.Delegation.create({
        household_id: household.id, delegator_user_id: user.id, delegator_name: user.full_name,
        delegatee_user_id, delegatee_name: member?.user_name || '',
        scope, record_view_categories: scope === 'record_view' ? record_view_categories : [],
        status: 'active', granted_at: new Date().toISOString(), expires_at: expiresAt,
      });
      await base44.entities.AuditEvent.create({ actor_user_id: user.id, actor_role: 'patient', action: 'delegation_grant', target_type: 'Delegation', target_id: 'pending', patient_id: user.id, detail: `Granted ${scopeLabel[scope]} to ${member?.user_name || ''}` });
      toast({ title: 'Access granted' });
      setShowDelegationForm(false);
      load();
    } catch (e) {
      toast({ title: 'Could not grant access', description: e.message, variant: 'destructive' });
    } finally {
      setGranting(false);
    }
  };

  const revokeDelegation = async (d) => {
    if (revokingId) return;
    setRevokingId(d.id);
    try {
      await base44.entities.Delegation.update(d.id, { status: 'revoked', revoked_at: new Date().toISOString() });
      await base44.entities.AuditEvent.create({ actor_user_id: user.id, actor_role: 'patient', action: 'delegation_revoke', target_type: 'Delegation', target_id: d.id, patient_id: user.id, detail: `Revoked ${scopeLabel[d.scope]}` });
      toast({ title: 'Delegation revoked' });
      load();
    } catch (e) {
      toast({ title: 'Could not revoke delegation', description: e.message, variant: 'destructive' });
    } finally {
      setRevokingId(null);
    }
  };

  if (loading) return <Layout><div className="h-40 rounded-2xl shimmer" /></Layout>;

  return (
    <Layout>
      <div className="space-y-5 animate-fade-in">
        <div className="flex items-center gap-2">
          <Home className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Household</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Family circle and delegated access</p>
          </div>
        </div>

        {!household ? (
          <div className="bg-card rounded-2xl shadow-card">
            <EmptyState icon={Users} title="No household yet" description="Create a household to add members and grant scoped access (booking, payments, record views)." />
            <div className="p-4 pt-0 flex items-center gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Household name (e.g. Khan Family)" className="flex-1 h-10 rounded-xl border border-input bg-background px-3 text-sm" />
              <button onClick={createHousehold} disabled={!name.trim() || creating} className="px-4 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"><Plus className="w-4 h-4" /> {creating ? 'Creating…' : 'Create'}</button>
            </div>
          </div>
        ) : (
          <>
            {/* Members */}
            <div className="bg-card rounded-2xl shadow-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div>
                  <p className="font-semibold text-sm">{household.name}</p>
                  <p className="text-[11px] text-muted-foreground">{members.filter((m) => m.status === 'active').length} members</p>
                </div>
                <button onClick={() => setShowMemberForm(true)} className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center gap-1.5 hover:bg-primary/20"><UserPlus className="w-3.5 h-3.5" /> Add</button>
              </div>
              <div className="divide-y divide-border/60">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 p-3">
                    <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0', m.role === 'head' ? 'bg-amber-100 text-amber-700' : 'bg-secondary text-muted-foreground')}>
                      {m.role === 'head' ? <Crown className="w-4 h-4" /> : (m.user_name?.[0] || '?')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.user_name || m.user_email || 'Member'}</p>
                      <p className="text-[11px] text-muted-foreground capitalize">{m.role.replace('_', ' ')}{m.relationship ? ` · ${m.relationship}` : ''}{m.is_minor ? ' · minor' : ''}</p>
                    </div>
                    <StatusBadge status={m.status} />
                    {m.status === 'active' && m.user_id !== user.id && (
                      <button onClick={() => removeMember(m)} disabled={removingId === m.id} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5 disabled:opacity-40"><Ban className="w-4 h-4" /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Delegations */}
            <div className="bg-card rounded-2xl shadow-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  <p className="font-semibold text-sm">Delegated access</p>
                </div>
                <button onClick={() => setShowDelegationForm(true)} className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center gap-1.5 hover:bg-primary/20"><Plus className="w-3.5 h-3.5" /> Grant</button>
              </div>
              {delegations.filter((d) => d.status === 'active').length === 0 ? (
                <p className="px-4 py-6 text-xs text-muted-foreground text-center">No active delegations. Grant a member scoped access.</p>
              ) : (
                <div className="divide-y divide-border/60">
                  {delegations.filter((d) => d.status === 'active').map((d) => (
                    <div key={d.id} className="flex items-center gap-3 p-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center"><ShieldCheck className="w-4 h-4" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{scopeLabel[d.scope]}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          to {d.delegatee_name || 'member'} · expires {d.expires_at ? new Date(d.expires_at).toLocaleDateString() : '—'}
                          {d.scope === 'record_view' && d.record_view_categories?.length ? ` · ${d.record_view_categories.length} categories` : ''}
                        </p>
                      </div>
                      <StatusBadge status="active" />
                      <button onClick={() => revokeDelegation(d)} disabled={revokingId === d.id} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5 disabled:opacity-40"><Ban className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showMemberForm && <HouseholdMemberForm householdId={household?.id} householdName={household?.name} addedBy={user?.id} onAdd={addMember} onClose={() => setShowMemberForm(false)} />}
      {showDelegationForm && household && <DelegationForm members={members.filter((m) => m.status === 'active' && m.user_id !== user.id)} onGrant={grantDelegation} onClose={() => setShowDelegationForm(false)} />}
    </Layout>
  );
}