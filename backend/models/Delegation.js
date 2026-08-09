const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DELEGATION_SCOPES = ['booking', 'payment', 'record_view', 'pharmacy', 'health_card_view'];
const DELEGATION_STATUSES = ['active', 'revoked', 'expired'];

const Delegation = sequelize.define('Delegation', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  household_id: {
    type: DataTypes.UUID
  },
  delegator_user_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  delegator_name: {
    type: DataTypes.STRING
  },
  delegatee_user_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  delegatee_name: {
    type: DataTypes.STRING
  },
  scope: {
    type: DataTypes.ENUM(...DELEGATION_SCOPES),
    allowNull: false
  },
  record_view_categories: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  health_card_types: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  status: {
    type: DataTypes.ENUM(...DELEGATION_STATUSES),
    defaultValue: 'active'
  },
  granted_at: {
    type: DataTypes.DATE
  },
  expires_at: {
    type: DataTypes.DATE
  },
  revoked_at: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'delegations',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

Delegation.DELEGATION_SCOPES = DELEGATION_SCOPES;

module.exports = Delegation;
