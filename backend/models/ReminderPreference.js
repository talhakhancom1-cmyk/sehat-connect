const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ReminderPreference = sequelize.define('ReminderPreference', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  patient_id: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  reminders_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  // JSONB: { morning: "08:00", afternoon: "14:00", evening: "20:00" }
  // Times in 24h HH:MM format. Only the relevant times for the patient's medications are used.
  reminder_times: {
    type: DataTypes.JSONB,
    defaultValue: { morning: "08:00", evening: "20:00" }
  }
}, {
  tableName: 'reminder_preferences',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = ReminderPreference;
