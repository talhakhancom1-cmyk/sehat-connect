const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AuditEvent = sequelize.define('AuditEvent', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  action: {
    type: DataTypes.STRING,
    allowNull: false
  },
  actor_role: {
    type: DataTypes.STRING,
    allowNull: false
  },
  actor_user_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  detail: {
    type: DataTypes.TEXT
  },
  patient_id: {
    type: DataTypes.STRING
  },
  target_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  target_type: {
    type: DataTypes.STRING,
    allowNull: false
  },
  actor_session_jti: {
    type: DataTypes.STRING
  },
  actor_ip: {
    type: DataTypes.STRING
  },
  actor_user_agent: {
    type: DataTypes.TEXT
  },
  platform: {
    type: DataTypes.STRING
  },
  consent_id: {
    type: DataTypes.STRING
  },
  before_state: {
    type: DataTypes.JSONB
  },
  after_state: {
    type: DataTypes.JSONB
  }
}, {
  tableName: 'audit_events',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

module.exports = AuditEvent;
