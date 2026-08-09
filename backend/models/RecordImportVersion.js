const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const RecordImportVersion = sequelize.define('RecordImportVersion', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  record_import_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  amendment_reason: {
    type: DataTypes.TEXT
  },
  previous_data: {
    type: DataTypes.JSONB
  },
  new_data: {
    type: DataTypes.JSONB
  },
  created_by_user_id: {
    type: DataTypes.STRING
  },
  created_by_role: {
    type: DataTypes.STRING
  }
}, {
  tableName: 'record_import_versions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = RecordImportVersion;
