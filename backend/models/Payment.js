const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PAYMENT_PROVIDERS = ['jazzcash', 'easypaisa', 'raast', 'local_card', 'stripe', 'paypal', 'cash', 'bank_transfer'];
const PAYMENT_STATUSES = ['intent', 'pending', 'authorized', 'captured', 'failed', 'refunded', 'disputed'];

const Payment = sequelize.define('Payment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  appointment_id: {
    type: DataTypes.UUID
  },
  payer_user_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  patient_user_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  patient_name: {
    type: DataTypes.STRING
  },
  payer_name: {
    type: DataTypes.STRING
  },
  provider: {
    type: DataTypes.ENUM(...PAYMENT_PROVIDERS),
    allowNull: false
  },
  method: {
    type: DataTypes.STRING
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
  fx_rate: {
    type: DataTypes.DECIMAL(18, 8)
  },
  pkr_equivalent: {
    type: DataTypes.DECIMAL(12, 2)
  },
  status: {
    type: DataTypes.ENUM(...PAYMENT_STATUSES),
    defaultValue: 'intent'
  },
  provider_txn_id: {
    type: DataTypes.STRING
  },
  idempotency_key: {
    type: DataTypes.STRING,
    unique: true
  },
  description: {
    type: DataTypes.TEXT
  },
  paid_at: {
    type: DataTypes.DATE
  },
  confirmed_at: {
    type: DataTypes.DATE
  },
  failure_reason: {
    type: DataTypes.TEXT
  },
  webhook_received_at: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'payments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = { Payment, PAYMENT_PROVIDERS, PAYMENT_STATUSES };
