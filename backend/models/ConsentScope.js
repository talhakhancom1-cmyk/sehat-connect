const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ConsentScope = sequelize.define('ConsentScope', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  consent_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  category_key: {
    type: DataTypes.STRING,
    allowNull: false
  },
  permission: {
    type: DataTypes.STRING,
    allowNull: false
  }
}, {
  tableName: 'consent_scopes',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = ConsentScope;
