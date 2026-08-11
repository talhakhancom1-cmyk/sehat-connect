const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DoseEvent = sequelize.define('DoseEvent', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  medication_plan_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  prescription_id: {
    type: DataTypes.STRING
  },
  patient_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  patient_name: {
    type: DataTypes.STRING
  },
  doctor_id: {
    type: DataTypes.STRING
  },
  taken_at: {
    type: DataTypes.DATE,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'taken', 'skipped', 'snoozed', 'missed'),
    defaultValue: 'pending'
  },
  source: {
    type: DataTypes.STRING,
    defaultValue: 'patient'
  },
  notes: {
    type: DataTypes.TEXT
  }
}, {
  tableName: 'dose_events',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = DoseEvent;
