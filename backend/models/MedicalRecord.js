const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const MedicalRecord = sequelize.define('MedicalRecord', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  patient_id: {
    type: DataTypes.STRING
  },
  patient_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false
  },
  date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  date_precision: {
    type: DataTypes.ENUM('day', 'month', 'year'),
    defaultValue: 'day'
  },
  doctor_name: {
    type: DataTypes.STRING
  },
  hospital: {
    type: DataTypes.STRING
  },
  source_hospital: {
    type: DataTypes.STRING
  },
  notes: {
    type: DataTypes.TEXT
  },
  file_url: {
    type: DataTypes.STRING
  },
  file_type: {
    type: DataTypes.STRING
  },
  provenance: {
    type: DataTypes.STRING,
    defaultValue: 'patient_uploaded'
  },
  consent_id: {
    type: DataTypes.STRING
  },
  encounter_id: {
    type: DataTypes.STRING
  },
  shared_with_doctor_ids: {
    type: DataTypes.TEXT,
    defaultValue: null
  },
  is_draft: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  is_amendment: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  replaces_version_id: {
    type: DataTypes.STRING
  },
  reason_for_change: {
    type: DataTypes.TEXT
  },
  verification_status: {
    type: DataTypes.ENUM('unverified', 'clinician_verified'),
    defaultValue: 'unverified'
  },
  verified_by_id: {
    type: DataTypes.STRING
  },
  verified_by_name: {
    type: DataTypes.STRING
  },
  verified_at: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'medical_records',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = MedicalRecord;
