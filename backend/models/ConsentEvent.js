const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ConsentEvent = sequelize.define('ConsentEvent', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  consent_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  event_type: {
    type: DataTypes.ENUM('granted', 'revoked', 'expired', 'accessed'),
    allowNull: false
  },
  actor_user_id: {
    type: DataTypes.STRING
  },
  actor_role: {
    type: DataTypes.STRING
  },
  detail: {
    type: DataTypes.TEXT
  }
}, {
  tableName: 'consent_events',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = ConsentEvent;
