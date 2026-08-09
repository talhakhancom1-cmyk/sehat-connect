const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const HouseholdAuditEvent = sequelize.define('HouseholdAuditEvent', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  household_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  actor_user_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  target_user_id: {
    type: DataTypes.UUID
  },
  action: {
    type: DataTypes.STRING,
    allowNull: false
  },
  scope: {
    type: DataTypes.STRING
  },
  appointment_id: {
    type: DataTypes.UUID
  },
  payment_id: {
    type: DataTypes.UUID
  },
  detail: {
    type: DataTypes.TEXT
  }
}, {
  tableName: 'household_audit_events',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = HouseholdAuditEvent;
