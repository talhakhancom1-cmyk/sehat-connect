const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const INVITATION_STATUSES = ['pending', 'accepted', 'declined', 'expired', 'cancelled'];
const DELEGATION_SCOPES = ['booking_delegation', 'payment_delegation', 'record_view_delegation'];

const HouseholdInvitation = sequelize.define('HouseholdInvitation', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  household_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  invited_by_user_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  invitee_contact: {
    type: DataTypes.STRING,
    allowNull: false
  },
  invitee_user_id: {
    type: DataTypes.UUID
  },
  requested_scopes: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  accepted_scopes: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  status: {
    type: DataTypes.ENUM(...INVITATION_STATUSES),
    defaultValue: 'pending'
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false
  },
  responded_at: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'household_invitations',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = { HouseholdInvitation, INVITATION_STATUSES, DELEGATION_SCOPES };
