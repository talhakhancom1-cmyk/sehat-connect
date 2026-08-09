const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Discontinuation = sequelize.define('Discontinuation', {
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
  discontinued_by_id: {
    type: DataTypes.STRING
  },
  discontinued_by_name: {
    type: DataTypes.STRING
  },
  discontinued_by_role: {
    type: DataTypes.STRING
  },
  reason: {
    type: DataTypes.STRING
  },
  reason_detail: {
    type: DataTypes.TEXT
  },
  discontinued_at: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'discontinuations',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Discontinuation;
