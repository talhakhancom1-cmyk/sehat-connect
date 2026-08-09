const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Conversation = sequelize.define('Conversation', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  patient_id: {
    type: DataTypes.STRING
  },
  patient_name: {
    type: DataTypes.STRING
  },
  doctor_id: {
    type: DataTypes.STRING
  },
  doctor_name: {
    type: DataTypes.STRING
  },
  member_ids: {
    type: DataTypes.TEXT,
    defaultValue: null
  },
  appointment_id: {
    type: DataTypes.STRING
  },
  consent_id: {
    type: DataTypes.STRING
  },
  title: {
    type: DataTypes.STRING
  },
  status: {
    type: DataTypes.ENUM('active', 'closed', 'expired'),
    defaultValue: 'active'
  },
  last_message_at: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'conversations',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Conversation;
