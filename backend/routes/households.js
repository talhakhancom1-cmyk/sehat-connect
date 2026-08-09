const express = require('express');
const { v4: uuidv4 } = require('uuid');
const {
  Household,
  HouseholdMember,
  HouseholdInvitation,
  HouseholdConsent,
  HouseholdAuditEvent,
  User,
  Notification
} = require('../models');
const { DELEGATION_SCOPES } = require('../models/HouseholdInvitation');
const { authenticate } = require('../middleware/auth');
const { parseSort } = require('../lib/parseSort');

const router = express.Router();

const INVITATION_TTL_DAYS = 7;

async function assertHead(householdId, userId) {
  const household = await Household.findByPk(householdId);
  if (!household) return { error: { status: 404, body: { error: 'Household not found' } }, household: null };
  const headIds = Array.isArray(household.head_user_ids) ? household.head_user_ids : [];
  if (!headIds.includes(userId)) {
    return { error: { status: 403, body: { error: 'Head of Household only' } }, household: null };
  }
  return { error: null, household };
}

async function assertMember(householdId, userId) {
  const member = await HouseholdMember.findOne({
    where: { household_id: householdId, user_id: userId, status: 'active' }
  });
  if (!member) {
    return { error: { status: 403, body: { error: 'Active household membership required' } }, member: null };
  }
  return { error: null, member };
}

async function logHouseholdEvent({ household_id, actor_user_id, target_user_id, action, scope, detail, appointment_id, payment_id }) {
  try {
    await HouseholdAuditEvent.create({
      household_id, actor_user_id, target_user_id, action, scope, detail, appointment_id, payment_id
    });
  } catch (e) {
    console.error('household audit event failed', e?.message);
  }
}

async function notifyUser(userId, type, title, body, data = {}) {
  try {
    await Notification.create({
      user_id: userId, type, title, body, data, priority: 'normal', read: false, sent_at: new Date()
    });
  } catch (e) {
    console.error('household notification failed', e?.message);
  }
}

// GET /api/v1/households — list (supports ?member_ids= filter)
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    // Find households where this user is a member
    const memberships = await HouseholdMember.findAll({
      where: { user_id: userId, status: 'active' }
    });
    const householdIds = memberships.map(m => m.household_id);
    // Also find households created by this user
    const created = await Household.findAll({ where: { created_by_user_id: userId } });
    created.forEach(h => { if (!householdIds.includes(h.id)) householdIds.push(h.id); });

    const households = householdIds.length
      ? await Household.findAll({ where: { id: householdIds }, order: parseSort(req.query, ['created_at', 'updated_at'], 'created_at', 'DESC') })
      : [];
    const result = households.map(h => ({
      ...h.toJSON(),
      member_ids: h.member_ids || h.head_user_ids || [],
      created_date: h.created_at,
      updated_date: h.updated_at
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/households
router.post('/', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name) return res.status(400).json({ error: 'name is required' });
    const userId = req.user.id;
    const household = await Household.create({
      name: body.name,
      created_by_user_id: userId,
      country: body.country,
      head_user_ids: [userId],
      status: 'active'
    });
    await HouseholdMember.create({
      household_id: household.id,
      user_id: userId,
      member_type: 'head_of_household',
      status: 'active',
      joined_at: new Date()
    });
    await logHouseholdEvent({
      household_id: household.id, actor_user_id: userId, action: 'household_created',
      detail: `Created household ${household.name}`
    });
    res.status(201).json(household);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/v1/households/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const household = await Household.findByPk(req.params.id);
    if (!household) return res.status(404).json({ error: 'Household not found' });
    const members = await HouseholdMember.findAll({ where: { household_id: household.id } });
    res.json({
      ...household.toJSON(),
      member_ids: household.member_ids || household.head_user_ids || [],
      members,
      created_date: household.created_at,
      updated_date: household.updated_at
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/v1/households/:id — update (e.g. add/remove member_ids)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const household = await Household.findByPk(req.params.id);
    if (!household) return res.status(404).json({ error: 'Household not found' });
    const updates = { ...req.body };
    delete updates.id;
    await household.update(updates);
    res.json({
      ...household.toJSON(),
      member_ids: household.member_ids || household.head_user_ids || [],
      created_date: household.created_at,
      updated_date: household.updated_at
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/v1/households/mine
router.get('/mine/list', authenticate, async (req, res) => {
  try {
    const memberships = await HouseholdMember.findAll({
      where: { user_id: req.user.id, status: 'active' }
    });
    const ids = memberships.map(m => m.household_id);
    const households = ids.length ? await Household.findAll({ where: { id: ids } }) : [];
    res.json(households);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/households/:id/invitations
router.post('/:id/invitations', authenticate, async (req, res) => {
  try {
    const { error, household } = await assertHead(req.params.id, req.user.id);
    if (error) return res.status(error.status).json(error.body);
    const body = req.body || {};
    if (!body.invitee_contact) return res.status(400).json({ error: 'invitee_contact is required' });
    const requested = Array.isArray(body.requested_scopes) ? body.requested_scopes.filter(s => DELEGATION_SCOPES.includes(s)) : [];
    if (requested.length === 0) return res.status(400).json({ error: 'At least one delegation scope is required' });

    const match = body.invitee_user_id
      ? await User.findByPk(body.invitee_user_id).catch(() => null)
      : await User.findOne({ where: { email: body.invitee_contact } }).catch(() => null);

    const invitation = await HouseholdInvitation.create({
      household_id: household.id,
      invited_by_user_id: req.user.id,
      invitee_contact: body.invitee_contact,
      invitee_user_id: match ? match.id : null,
      requested_scopes: requested,
      accepted_scopes: [],
      status: 'pending',
      expires_at: new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000)
    });

    if (match) {
      await notifyUser(match.id, 'system', 'Household invitation', `You have been invited to join ${household.name}`, {
        household_id: household.id, invitation_id: invitation.id, requested_scopes: requested
      });
    }

    await logHouseholdEvent({
      household_id: household.id, actor_user_id: req.user.id, action: 'invitation_sent',
      target_user_id: match ? match.id : null, detail: `Invited ${body.invitee_contact} for scopes: ${requested.join(', ')}`
    });
    res.status(201).json(invitation);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/v1/households/invitations/:invitationId/respond
router.post('/invitations/:invitationId/respond', authenticate, async (req, res) => {
  try {
    const invitation = await HouseholdInvitation.findByPk(req.params.invitationId);
    if (!invitation) return res.status(404).json({ error: 'Invitation not found' });
    if (invitation.status !== 'pending') return res.status(400).json({ error: `Invitation already ${invitation.status}` });
    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      await invitation.update({ status: 'expired' });
      return res.status(400).json({ error: 'Invitation expired' });
    }
    if (invitation.invitee_user_id && invitation.invitee_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the invitee can respond' });
    }

    const body = req.body || {};
    const decision = body.decision;
    if (decision === 'decline') {
      await invitation.update({ status: 'declined', responded_at: new Date() });
      await logHouseholdEvent({
        household_id: invitation.household_id, actor_user_id: req.user.id, action: 'invitation_declined',
        detail: 'Declined household invitation'
      });
      return res.json({ status: 'declined' });
    }

    const accepted = Array.isArray(body.accepted_scopes) ? body.accepted_scopes.filter(s => (invitation.requested_scopes || []).includes(s)) : [];
    if (accepted.length === 0) {
      return res.status(400).json({ error: 'At least one scope must be accepted, or decline explicitly' });
    }

    let member = await HouseholdMember.findOne({
      where: { household_id: invitation.household_id, user_id: req.user.id }
    });
    if (!member) {
      member = await HouseholdMember.create({
        household_id: invitation.household_id,
        user_id: req.user.id,
        member_type: 'adult_family_member',
        status: 'active',
        joined_at: new Date()
      });
    } else if (member.status !== 'active') {
      await member.update({ status: 'active', joined_at: new Date(), left_at: null });
    }

    for (const scope of accepted) {
      await HouseholdConsent.create({
        household_id: invitation.household_id,
        member_user_id: req.user.id,
        scope,
        granted_to_user_id: invitation.invited_by_user_id,
        categories: scope === 'record_view_delegation' ? (body.categories || []) : [],
        date_range_start: body.date_range_start,
        date_range_end: body.date_range_end,
        status: 'active',
        granted_at: new Date(),
        source_invitation_id: invitation.id,
        expires_at: body.expires_at
      });
    }

    await invitation.update({ status: 'accepted', accepted_scopes: accepted, responded_at: new Date(), invitee_user_id: req.user.id });
    await logHouseholdEvent({
      household_id: invitation.household_id, actor_user_id: req.user.id, action: 'invitation_accepted',
      detail: `Accepted scopes: ${accepted.join(', ')}`
    });
    await notifyUser(invitation.invited_by_user_id, 'system', 'Household invitation accepted', `${req.user.display_name || 'A member'} accepted your invitation`, {
      household_id: invitation.household_id, accepted_scopes: accepted
    });
    res.json({ status: 'accepted', accepted_scopes: accepted });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/v1/households/:id/consents/:scope/revoke
router.post('/:id/consents/:scope/revoke', authenticate, async (req, res) => {
  try {
    const scope = req.params.scope;
    if (!DELEGATION_SCOPES.includes(scope)) return res.status(400).json({ error: 'Invalid scope' });
    const consents = await HouseholdConsent.findAll({
      where: { household_id: req.params.id, member_user_id: req.user.id, scope, status: 'active' }
    });
    if (consents.length === 0) return res.status(404).json({ error: 'No active consent for this scope' });
    for (const c of consents) {
      await c.update({ status: 'revoked', revoked_at: new Date() });
    }
    await logHouseholdEvent({
      household_id: req.params.id, actor_user_id: req.user.id, action: 'scope_revoked', scope,
      detail: `Revoked ${scope}`
    });
    res.json({ revoked: consents.length });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/v1/households/:id/heads
router.post('/:id/heads', authenticate, async (req, res) => {
  try {
    const { error, household } = await assertHead(req.params.id, req.user.id);
    if (error) return res.status(error.status).json(error.body);
    const body = req.body || {};
    if (!body.new_head_user_id) return res.status(400).json({ error: 'new_head_user_id is required' });
    const headIds = Array.isArray(household.head_user_ids) ? household.head_user_ids : [];
    if (body.transfer) {
      for (const uid of headIds) {
        if (uid !== body.new_head_user_id) {
          await HouseholdConsent.update(
            { status: 'revoked', revoked_at: new Date() },
            { where: { granted_to_user_id: uid, status: 'active' } }
          );
        }
      }
      household.head_user_ids = [body.new_head_user_id];
    } else {
      if (!headIds.includes(body.new_head_user_id)) headIds.push(body.new_head_user_id);
      household.head_user_ids = headIds;
    }
    await household.save();
    let member = await HouseholdMember.findOne({ where: { household_id: household.id, user_id: body.new_head_user_id } });
    if (member) {
      await member.update({ member_type: 'head_of_household', status: 'active' });
    } else {
      await HouseholdMember.create({
        household_id: household.id, user_id: body.new_head_user_id,
        member_type: 'head_of_household', status: 'active', joined_at: new Date()
      });
    }
    await logHouseholdEvent({
      household_id: household.id, actor_user_id: req.user.id, target_user_id: body.new_head_user_id,
      action: body.transfer ? 'head_transferred' : 'head_added', detail: body.transfer ? 'Transferred head role' : 'Added co-head'
    });
    res.json(household);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/v1/households/:id/audit-log
router.get('/:id/audit-log', authenticate, async (req, res) => {
  try {
    const { error: headErr, household } = await assertHead(req.params.id, req.user.id);
    if (headErr) {
      const { error: memberErr } = await assertMember(req.params.id, req.user.id);
      if (memberErr) return res.status(memberErr.status).json(memberErr.body);
    }
    const events = await HouseholdAuditEvent.findAll({
      where: { household_id: req.params.id },
      order: parseSort(req.query, ['created_at'], 'created_at', 'DESC'),
      limit: 500
    });
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/households/:id/leave
router.post('/:id/leave', authenticate, async (req, res) => {
  try {
    const member = await HouseholdMember.findOne({
      where: { household_id: req.params.id, user_id: req.user.id, status: 'active' }
    });
    if (!member) return res.status(404).json({ error: 'No active membership to leave' });
    await member.update({ status: 'left', left_at: new Date() });
    await HouseholdConsent.update(
      { status: 'revoked', revoked_at: new Date() },
      { where: { member_user_id: req.user.id, status: 'active' } }
    );
    const household = await Household.findByPk(req.params.id);
    if (household && Array.isArray(household.head_user_ids)) {
      const remaining = household.head_user_ids.filter(id => id !== req.user.id);
      if (remaining.length === 0) {
        await household.update({ status: 'dissolved' });
      } else {
        household.head_user_ids = remaining;
        await household.save();
      }
    }
    await logHouseholdEvent({
      household_id: req.params.id, actor_user_id: req.user.id, action: 'member_left',
      detail: 'Left the household'
    });
    res.json({ status: 'left' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
