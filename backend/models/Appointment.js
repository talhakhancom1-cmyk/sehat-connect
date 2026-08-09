const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Appointment = sequelize.define('Appointment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  doctor_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  doctor_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  doctor_user_id: {
    type: DataTypes.STRING
  },
  patient_id: {
    type: DataTypes.STRING
  },
  patient_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  patient_age: {
    type: DataTypes.INTEGER
  },
  patient_gender: {
    type: DataTypes.ENUM('male', 'female')
  },
  appointment_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  time_slot: {
    type: DataTypes.STRING,
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('video', 'audio', 'chat', 'physical', 'home', 'emergency'),
    defaultValue: 'video'
  },
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'rejected'),
    defaultValue: 'pending'
  },
  reason: {
    type: DataTypes.TEXT
  },
  consultation_fee: {
    type: DataTypes.DECIMAL(10, 2)
  },
  payment_status: {
    type: DataTypes.ENUM('unpaid', 'paid', 'refunded'),
    defaultValue: 'unpaid'
  },
  payment_method: {
    type: DataTypes.ENUM('jazzcash', 'easypaisa', 'card', 'bank_transfer', 'cash')
  },
  notes: {
    type: DataTypes.TEXT
  },
  symptoms: {
    type: DataTypes.TEXT
  }
}, {
  tableName: 'appointments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Appointment;
