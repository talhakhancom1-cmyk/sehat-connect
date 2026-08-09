const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CALL_STATUSES = [
  'idle',
  'ringing',
  'connecting',
  'active',
  'reconnecting',
  'ended',
  'failed'
];

const CallRoom = sequelize.define('CallRoom', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  conversation_id: {
    type: DataTypes.STRING
  },
  appointment_id: {
    type: DataTypes.STRING
  },
  initiator_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  call_type: {
    type: DataTypes.ENUM('audio', 'video'),
    defaultValue: 'video'
  },
  status: {
    type: DataTypes.ENUM(...CALL_STATUSES),
    defaultValue: 'idle'
  },
  started_at: {
    type: DataTypes.DATE
  },
  ended_at: {
    type: DataTypes.DATE
  },
  ended_reason: {
    type: DataTypes.STRING
  }
}, {
  tableName: 'call_rooms',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

CallRoom.CALL_STATUSES = CALL_STATUSES;

module.exports = CallRoom;
