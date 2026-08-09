const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const IPS = sequelize.define('IPS', {
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
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  status: {
    type: DataTypes.ENUM('active', 'superseded', 'revoked'),
    defaultValue: 'active'
  },
  language: {
    type: DataTypes.STRING,
    defaultValue: 'en'
  },
  summary_json: {
    type: DataTypes.TEXT
  },
  generated_by_user_id: {
    type: DataTypes.STRING
  },
  generated_at: {
    type: DataTypes.DATE
  },
  shared_token: {
    type: DataTypes.STRING
  },
  shared_token_expires_at: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'ips_documents',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = IPS;
