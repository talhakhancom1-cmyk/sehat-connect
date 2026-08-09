const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const EmergencyContact = sequelize.define('EmergencyContact', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  relation: {
    type: DataTypes.STRING
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false
  }
}, {
  tableName: 'emergency_contacts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = EmergencyContact;
