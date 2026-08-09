const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CallParticipant = sequelize.define('CallParticipant', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  call_room_id: {
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
  joined_at: {
    type: DataTypes.DATE
  },
  left_at: {
    type: DataTypes.DATE
  },
  connection_state: {
    type: DataTypes.ENUM('joining', 'connected', 'reconnecting', 'disconnected'),
    defaultValue: 'joining'
  }
}, {
  tableName: 'call_participants',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = CallParticipant;
