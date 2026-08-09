const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Schedule = sequelize.define('Schedule', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  doctor_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  doctor_name: {
    type: DataTypes.STRING
  },
  max_patients_per_day: {
    type: DataTypes.INTEGER,
    defaultValue: 20
  },
  break_start: {
    type: DataTypes.STRING,
    defaultValue: '01:00 PM'
  },
  break_end: {
    type: DataTypes.STRING,
    defaultValue: '02:00 PM'
  },
  days: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active'
  }
}, {
  tableName: 'schedules',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Schedule;
