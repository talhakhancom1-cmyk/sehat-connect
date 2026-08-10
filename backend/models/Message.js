const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Message = sequelize.define('Message', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  conversation_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  sender_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  sender_name: {
    type: DataTypes.STRING
  },
  sender_role: {
    type: DataTypes.STRING
  },
  receiver_id: {
    type: DataTypes.STRING
  },
  receiver_name: {
    type: DataTypes.STRING
  },
  content: {
    type: DataTypes.TEXT
  },
  body: {
    type: DataTypes.TEXT
  },
  attachment_url: {
    type: DataTypes.STRING
  },
  attachment_type: {
    type: DataTypes.STRING
  },
  type: {
    type: DataTypes.ENUM('text', 'attachment', 'audio', 'system', 'clinical_note', 'call'),
    defaultValue: 'text'
  },
  message_type: {
    type: DataTypes.ENUM('text', 'attachment', 'audio', 'system', 'clinical_note', 'call'),
    defaultValue: 'text'
  },
  call_direction: {
    type: DataTypes.STRING
  },
  call_status: {
    type: DataTypes.STRING
  },
  call_duration: {
    type: DataTypes.INTEGER
  },
  call_type: {
    type: DataTypes.STRING
  },
  client_message_id: {
    type: DataTypes.STRING
  },
  read: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  status: {
    type: DataTypes.ENUM('sent', 'delivered', 'read'),
    defaultValue: 'sent'
  },
  read_at: {
    type: DataTypes.DATE
  },
  read_by_ids: {
    type: DataTypes.TEXT,
    defaultValue: null
  }
}, {
  tableName: 'messages',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Message;
