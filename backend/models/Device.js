const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Device = sequelize.define('Device', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  device_type: {
    type: DataTypes.ENUM('web', 'windows', 'ios', 'android'),
    allowNull: false
  },
  os: {
    type: DataTypes.STRING
  },
  os_version: {
    type: DataTypes.STRING
  },
  app_version: {
    type: DataTypes.STRING
  },
  push_token: {
    type: DataTypes.TEXT
  },
  voip_token: {
    type: DataTypes.TEXT
  },
  browser: {
    type: DataTypes.STRING
  },
  last_active_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  is_trusted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  is_revoked: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  revoked_at: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'devices',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Device;
