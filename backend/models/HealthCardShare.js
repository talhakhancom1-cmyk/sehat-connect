const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const HealthCardShare = sequelize.define('HealthCardShare', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  health_card_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  token: {
    type: DataTypes.STRING,
    allowNull: false
  },
  expires_at: {
    type: DataTypes.DATE
  },
  revoked_at: {
    type: DataTypes.DATE
  },
  created_by_user_id: {
    type: DataTypes.STRING
  }
}, {
  tableName: 'health_card_shares',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = HealthCardShare;
