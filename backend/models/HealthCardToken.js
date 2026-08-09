const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const HealthCardToken = sequelize.define('HealthCardToken', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  card_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  token: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  status: {
    type: DataTypes.ENUM('active', 'revoked', 'expired'),
    defaultValue: 'active'
  },
  expires_at: {
    type: DataTypes.DATE
  },
  max_views: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  view_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  created_by_id_ref: {
    type: DataTypes.STRING
  },
  revoked_at: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'health_card_tokens',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = HealthCardToken;
