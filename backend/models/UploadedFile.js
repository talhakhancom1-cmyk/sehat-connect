const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UploadedFile = sequelize.define('UploadedFile', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  owner_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  original_name: {
    type: DataTypes.STRING
  },
  stored_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  mime_type: {
    type: DataTypes.STRING
  },
  size_bytes: {
    type: DataTypes.INTEGER
  },
  file_url: {
    type: DataTypes.STRING
  },
  purpose: {
    type: DataTypes.STRING
  },
  shared_token: {
    type: DataTypes.STRING
  },
  shared_token_expires_at: {
    type: DataTypes.DATE
  },
  status: {
    type: DataTypes.ENUM('active', 'revoked', 'deleted'),
    defaultValue: 'active'
  }
}, {
  tableName: 'uploaded_files',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = UploadedFile;
