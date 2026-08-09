const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const RecordImportFile = sequelize.define('RecordImportFile', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  record_import_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  file_url: {
    type: DataTypes.STRING,
    allowNull: false
  },
  file_type: {
    type: DataTypes.STRING
  },
  file_name: {
    type: DataTypes.STRING
  },
  captured_from_camera: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  uploaded_by_user_id: {
    type: DataTypes.STRING
  }
}, {
  tableName: 'record_import_files',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = RecordImportFile;
