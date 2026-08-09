const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Prescription = sequelize.define('Prescription', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
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
  doctor_name: {
    type: DataTypes.STRING
  },
  doctor_specialty: {
    type: DataTypes.STRING
  },
  diagnosis: {
    type: DataTypes.TEXT
  },
  follow_up: {
    type: DataTypes.STRING
  },
  is_signed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  signed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  appointment_id: {
    type: DataTypes.STRING
  },
  encounter_id: {
    type: DataTypes.STRING
  },
  status: {
    type: DataTypes.ENUM('active', 'completed', 'discontinued'),
    defaultValue: 'active'
  },
  notes: {
    type: DataTypes.TEXT
  },
  issued_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  signed_by_user_id: {
    type: DataTypes.STRING
  }
}, {
  tableName: 'prescriptions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Prescription;
