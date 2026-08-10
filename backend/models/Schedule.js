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
  slot_duration_minutes: {
    type: DataTypes.INTEGER,
    defaultValue: 30,
    comment: 'Duration of each bookable slot in minutes (15, 20, 30, 45, 60)'
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
  // Per-day breaks: array of { date: "YYYY-MM-DD", start: "01:00 PM", end: "02:00 PM", reason: "Lunch" }
  // These block specific time slots on specific days without affecting the recurring weekly schedule.
  day_breaks: {
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
