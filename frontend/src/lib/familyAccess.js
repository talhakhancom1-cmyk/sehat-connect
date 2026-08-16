import { base44 } from '@/api/base44Client';
import { HEALTH_CATEGORY_KEYS } from '@/lib/healthCategories';

// Canonical record categories — backend enum keys (single source of truth:
// lib/healthCategories.js). Re-exported here for backward compatibility.
export const RECORD_CATEGORIES = HEALTH_CATEGORY_KEYS;

export const HEALTH_CARD_TYPES = [
  { value: 'emergency', label: 'Emergency' },
  { value: 'medication', label: 'Medication' },
  { value: 'allergy', label: 'Allergy' },
  { value: 'vaccination', label: 'Vaccination' },
  { value: 'chronic', label: 'Chronic' },
  { value: 'maternal', label: 'Maternal' },
  { value: 'child', label: 'Child' },
  { value: 'ips', label: 'International Patient Summary' },
];

export async function getActiveHousehold(userId) {
  const hs = await base44.entities.Household.filter(
    { member_ids: userId, status: 'active' }, '-created_date', 5
  );
  return hs[0] || null;
}

export async function getHouseholdMembers(householdId, excludeUserId) {
  if (!householdId) return [];
  const ms = await base44.entities.HouseholdMember.filter(
    { household_id: householdId, status: 'active' }, '-added_at', 50
  );
  return ms.filter((m) => m.user_id !== excludeUserId);
}

// Delegations the current user has granted (outgoing), optionally filtered by scope
export async function getOutgoingDelegations(userId, scope) {
  const ds = await base44.entities.Delegation.filter(
    { delegator_user_id: userId, status: 'active' }, '-granted_at', 50
  );
  const now = Date.now();
  return ds.filter(
    (d) => (!scope || d.scope === scope) && (!d.expires_at || new Date(d.expires_at).getTime() > now)
  );
}

// Fetch records + health cards other family members have delegated to the current user
export async function getIncomingSharedData(types) {
  const res = await base44.functions.invoke('getFamilySharedData', { types });
  return res.data;
}

export async function grantDelegation({
  household, user, delegatee, scope, record_view_categories, health_card_types, expiresHours,
}) {
  const expiresAt = new Date(Date.now() + expiresHours * 3600 * 1000).toISOString();
  const del = await base44.entities.Delegation.create({
    household_id: household.id,
    delegator_user_id: user.id,
    delegator_name: user.full_name,
    delegatee_user_id: delegatee.user_id,
    delegatee_name: delegatee.user_name,
    scope,
    record_view_categories: scope === 'record_view' ? (record_view_categories || []) : [],
    health_card_types: scope === 'health_card_view' ? (health_card_types || []) : [],
    status: 'active',
    granted_at: new Date().toISOString(),
    expires_at: expiresAt,
  });
  await base44.entities.AuditEvent.create({
    actor_user_id: user.id,
    actor_role: 'patient',
    action: 'delegation_grant',
    target_type: 'Delegation',
    target_id: del.id,
    patient_id: user.id,
    detail: `Granted ${scope} to ${delegatee.user_name}`,
  });
  return del;
}

export async function revokeDelegation(delegationId, userId, scope) {
  await base44.entities.Delegation.update(delegationId, {
    status: 'revoked',
    revoked_at: new Date().toISOString(),
  });
  await base44.entities.AuditEvent.create({
    actor_user_id: userId,
    actor_role: 'patient',
    action: 'delegation_revoke',
    target_type: 'Delegation',
    target_id: delegationId,
    patient_id: userId,
    detail: `Revoked ${scope}`,
  });
}