const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  actor_id: {
    type: DataTypes.UUID,
    allowNull: false,
    comment: 'The user who performed the action'
  },
  actor_email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  actor_role: {
    type: DataTypes.STRING,
    allowNull: false
  },
  action: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'password_reset, impersonation_start, impersonation_end, permission_change, user_create, user_delete, etc.'
  },
  target_id: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'The user/entity that was acted upon'
  },
  target_email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  target_type: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'user'
  },
  details: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional context: IP address, user agent, reason, etc.'
  },
  ip_address: {
    type: DataTypes.STRING,
    allowNull: true
  },
}, {
  tableName: 'audit_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false, // audit logs are immutable
});

// Helper to create an audit log entry from an Express request
AuditLog.log = async function (req, action, target = {}, details = {}) {
  if (!req.user) return null;
  return AuditLog.create({
    actor_id: req.user.id,
    actor_email: req.user.email,
    actor_role: req.user.role,
    action,
    target_id: target.id || target.target_id || null,
    target_email: target.email || null,
    target_type: target.type || 'user',
    details: {
      ...details,
      user_agent: req.headers['user-agent'],
    },
    ip_address: req.ip || req.connection?.remoteAddress,
  });
};

module.exports = AuditLog;
