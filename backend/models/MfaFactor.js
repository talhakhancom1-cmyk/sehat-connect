const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const MfaFactor = sequelize.define('MfaFactor', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('totp', 'sms', 'email', 'biometric', 'hardware_key'),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('unverified', 'verified', 'disabled'),
    defaultValue: 'unverified'
  },
  identifier: {
    type: DataTypes.STRING
  },
  secret: {
    type: DataTypes.TEXT
  },
  verified_at: {
    type: DataTypes.DATE
  },
  disabled_at: {
    type: DataTypes.DATE
  },
  is_primary: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'mfa_factors',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = MfaFactor;
