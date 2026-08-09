const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const REFUND_STATUSES = ['pending', 'approved', 'processed', 'failed', 'disputed'];

const Refund = sequelize.define('Refund', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  payment_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING(8),
    allowNull: false,
    defaultValue: 'PKR'
  },
  reason: {
    type: DataTypes.TEXT
  },
  status: {
    type: DataTypes.ENUM(...REFUND_STATUSES),
    defaultValue: 'pending'
  },
  initiated_by_user_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  provider_refund_id: {
    type: DataTypes.STRING
  },
  processed_at: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'refunds',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = { Refund, REFUND_STATUSES };
