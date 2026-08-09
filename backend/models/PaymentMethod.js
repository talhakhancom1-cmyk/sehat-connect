const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PaymentMethod = sequelize.define('PaymentMethod', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  provider: {
    type: DataTypes.STRING,
    allowNull: false
  },
  token_reference: {
    type: DataTypes.STRING,
    allowNull: false
  },
  label: {
    type: DataTypes.STRING
  },
  brand: {
    type: DataTypes.STRING
  },
  last4: {
    type: DataTypes.STRING
  },
  expiry_month: {
    type: DataTypes.INTEGER
  },
  expiry_year: {
    type: DataTypes.INTEGER
  },
  is_default: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  status: {
    type: DataTypes.ENUM('active', 'expired', 'revoked'),
    defaultValue: 'active'
  }
}, {
  tableName: 'payment_methods',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = PaymentMethod;
