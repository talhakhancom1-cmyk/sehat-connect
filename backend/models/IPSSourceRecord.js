const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const IPSSourceRecord = sequelize.define('IPSSourceRecord', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  ips_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  medical_record_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  category: {
    type: DataTypes.STRING
  }
}, {
  tableName: 'ips_source_records',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = IPSSourceRecord;
