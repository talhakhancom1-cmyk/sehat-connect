const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Organization = sequelize.define('Organization', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('clinic', 'hospital', 'diagnostic_lab', 'pharmacy', 'insurance', 'government', 'other'),
    allowNull: false
  },
  country: {
    type: DataTypes.STRING,
    allowNull: false
  },
  city: {
    type: DataTypes.STRING
  },
  address: {
    type: DataTypes.TEXT
  },
  tax_id: {
    type: DataTypes.STRING
  },
  primary_contact_email: {
    type: DataTypes.STRING
  },
  primary_contact_phone: {
    type: DataTypes.STRING
  },
  verification_status: {
    type: DataTypes.ENUM('pending', 'verified', 'suspended'),
    defaultValue: 'pending'
  },
  verified_by_id: {
    type: DataTypes.UUID
  },
  verified_at: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'organizations',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Organization;
