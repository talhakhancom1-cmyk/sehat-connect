const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PayoutAccount = sequelize.define('PayoutAccount', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  doctor_id: {
    type: DataTypes.UUID
  },
  clinic_id: {
    type: DataTypes.UUID
  },
  provider: {
    type: DataTypes.STRING,
    allowNull: false
  },
  account_reference: {
    type: DataTypes.STRING,
    allowNull: false
  },
  country: {
    type: DataTypes.STRING,
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING(8),
    allowNull: false,
    defaultValue: 'PKR'
  },
  status: {
    type: DataTypes.ENUM('pending', 'verified', 'suspended'),
    defaultValue: 'pending'
  },
  verified_at: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'payout_accounts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = PayoutAccount;
