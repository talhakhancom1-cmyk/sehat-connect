const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CONSENT_STATUSES = ['active', 'revoked', 'expired'];

const HouseholdConsent = sequelize.define('HouseholdConsent', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  household_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  member_user_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  scope: {
    type: DataTypes.ENUM('booking_delegation', 'payment_delegation', 'record_view_delegation'),
    allowNull: false
  },
  granted_to_user_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  categories: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  date_range_start: {
    type: DataTypes.DATE
  },
  date_range_end: {
    type: DataTypes.DATE
  },
  status: {
    type: DataTypes.ENUM(...CONSENT_STATUSES),
    defaultValue: 'active'
  },
  granted_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  revoked_at: {
    type: DataTypes.DATE
  },
  expires_at: {
    type: DataTypes.DATE
  },
  source_invitation_id: {
    type: DataTypes.UUID
  }
}, {
  tableName: 'household_consents',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = { HouseholdConsent, CONSENT_STATUSES };
