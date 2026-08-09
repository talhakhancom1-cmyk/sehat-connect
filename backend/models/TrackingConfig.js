const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const TrackingConfig = sequelize.define('TrackingConfig', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  meta_pixel_id: {
    type: DataTypes.STRING
  },
  tiktok_pixel_id: {
    type: DataTypes.STRING
  },
  meta_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  tiktok_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  note: {
    type: DataTypes.TEXT
  }
}, {
  tableName: 'tracking_configs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = TrackingConfig;
