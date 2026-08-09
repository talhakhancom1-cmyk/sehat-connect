const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ConversationMember = sequelize.define('ConversationMember', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  conversation_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  user_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  user_name: {
    type: DataTypes.STRING
  },
  role: {
    type: DataTypes.STRING
  },
  added_by: {
    type: DataTypes.STRING
  },
  joined_at: {
    type: DataTypes.DATE
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'active'
  }
}, {
  tableName: 'conversation_members',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = ConversationMember;
