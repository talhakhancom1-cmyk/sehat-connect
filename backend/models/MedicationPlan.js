const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const MedicationPlan = sequelize.define('MedicationPlan', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  prescription_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  encounter_id: {
    type: DataTypes.STRING
  },
  appointment_id: {
    type: DataTypes.STRING
  },
  patient_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  patient_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  doctor_id: {
    type: DataTypes.STRING
  },
  doctor_name: {
    type: DataTypes.STRING
  },
  medication_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  dosage: {
    type: DataTypes.STRING,
    allowNull: false
  },
  frequency: {
    type: DataTypes.STRING,
    allowNull: false
  },
  route: {
    type: DataTypes.ENUM('oral', 'topical', 'injection', 'inhalation', 'sublingual', 'other')
  },
  duration: {
    type: DataTypes.STRING
  },
  start_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  end_date: {
    type: DataTypes.DATE
  },
  instructions: {
    type: DataTypes.TEXT
  },
  reminders_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  status: {
    type: DataTypes.ENUM('active', 'completed', 'discontinued'),
    defaultValue: 'active'
  },
  discontinued_at: {
    type: DataTypes.DATE
  },
  discontinuation_reason: {
    type: DataTypes.TEXT
  }
}, {
  tableName: 'medication_plans',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = MedicationPlan;
