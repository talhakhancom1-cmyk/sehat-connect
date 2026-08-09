const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Consent = sequelize.define('Consent', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  patient_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  patient_name: {
    type: DataTypes.STRING
  },
  recipient_user_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  recipient_name: {
    type: DataTypes.STRING
  },
  categories: {
    type: DataTypes.TEXT,
    defaultValue: null
  },
  permission_set: {
    type: DataTypes.TEXT,
    defaultValue: null
  },
  date_range_start: {
    type: DataTypes.DATE
  },
  date_range_end: {
    type: DataTypes.DATE
  },
  granted_at: {
    type: DataTypes.DATE
  },
  expires_at: {
    type: DataTypes.DATE
  },
  revoked_at: {
    type: DataTypes.DATE
  },
  source_appointment_id: {
    type: DataTypes.STRING
  },
  status: {
    type: DataTypes.ENUM('active', 'revoked', 'expired'),
    defaultValue: 'active'
  }
}, {
  tableName: 'consents',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Consent;
