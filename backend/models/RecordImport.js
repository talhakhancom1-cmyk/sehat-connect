const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const RecordImport = sequelize.define('RecordImport', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  patient_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false
  },
  source_name: {
    type: DataTypes.STRING
  },
  date: {
    type: DataTypes.DATE
  },
  date_precision: {
    type: DataTypes.ENUM('exact', 'month', 'year', 'approximate', 'unknown'),
    defaultValue: 'exact'
  },
  date_is_approximate: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  diagnosis_or_description: {
    type: DataTypes.TEXT
  },
  notes: {
    type: DataTypes.TEXT
  },
  status: {
    type: DataTypes.ENUM('draft', 'submitted', 'verified'),
    defaultValue: 'draft'
  },
  provenance: {
    type: DataTypes.STRING,
    defaultValue: 'patient_uploaded'
  },
  submitted_at: {
    type: DataTypes.DATE
  },
  verified_at: {
    type: DataTypes.DATE
  },
  verified_by_id: {
    type: DataTypes.STRING
  },
  medical_record_id: {
    type: DataTypes.STRING
  },
  created_by_user_id: {
    type: DataTypes.STRING
  },
  created_by_role: {
    type: DataTypes.STRING
  }
}, {
  tableName: 'record_imports',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = RecordImport;
