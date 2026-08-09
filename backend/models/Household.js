const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Household = sequelize.define('Household', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  created_by_user_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  country: {
    type: DataTypes.STRING
  },
  head_user_id: {
    type: DataTypes.STRING
  },
  head_name: {
    type: DataTypes.STRING
  },
  head_user_ids: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  member_ids: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  status: {
    type: DataTypes.ENUM('active', 'suspended', 'dissolved'),
    defaultValue: 'active'
  }
}, {
  tableName: 'households',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Household;
