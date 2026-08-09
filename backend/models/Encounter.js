const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Encounter = sequelize.define('Encounter', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  appointment_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  patient_id: {
    type: DataTypes.STRING
  },
  patient_name: {
    type: DataTypes.STRING
  },
  patient_age: {
    type: DataTypes.INTEGER
  },
  patient_gender: {
    type: DataTypes.ENUM('male', 'female')
  },
  doctor_id: {
    type: DataTypes.STRING
  },
  doctor_name: {
    type: DataTypes.STRING
  },
  encounter_date: {
    type: DataTypes.DATE
  },
  encounter_type: {
    type: DataTypes.ENUM('video', 'audio', 'chat', 'physical', 'home', 'emergency')
  },
  chief_complaint: {
    type: DataTypes.TEXT
  },
  examination: {
    type: DataTypes.TEXT
  },
  diagnosis: {
    type: DataTypes.TEXT
  },
  differential_diagnosis: {
    type: DataTypes.TEXT
  },
  clinical_notes: {
    type: DataTypes.TEXT
  },
  advice: {
    type: DataTypes.TEXT
  },
  follow_up: {
    type: DataTypes.TEXT
  },
  status: {
    type: DataTypes.ENUM('draft', 'completed'),
    defaultValue: 'draft'
  }
}, {
  tableName: 'encounters',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Encounter;
