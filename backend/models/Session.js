const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Session = sequelize.define('Session', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  token_jti: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  device_id: {
    type: DataTypes.UUID
  },
  ip_address: {
    type: DataTypes.STRING
  },
  user_agent: {
    type: DataTypes.TEXT
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false
  },
  last_used_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  revoked_at: {
    type: DataTypes.DATE
  },
  is_revoked: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'sessions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Session;
