const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Invoice = sequelize.define('Invoice', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  appointment_id: {
    type: DataTypes.UUID
  },
  order_id: {
    type: DataTypes.STRING
  },
  payment_id: {
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
  line_items: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  currency: {
    type: DataTypes.STRING(8),
    allowNull: false,
    defaultValue: 'PKR'
  },
  pkr_equivalent: {
    type: DataTypes.DECIMAL(12, 2)
  },
  subtotal: {
    type: DataTypes.DECIMAL(12, 2)
  },
  tax: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  },
  total: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('draft', 'issued', 'paid', 'void', 'refunded'),
    defaultValue: 'draft'
  },
  issued_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  paid_at: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'invoices',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Invoice;
