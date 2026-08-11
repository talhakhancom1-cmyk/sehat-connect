const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SymptomSession = sequelize.define('SymptomSession', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  patient_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  // JSONB array of { role: 'patient'|'assistant', content: string, timestamp: ISO string }
  messages: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  // One of: 'routine', 'soon', 'urgent', null (null until triage is complete)
  urgency_level: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Suggested specialty from AI (e.g., "Cardiology")
  suggested_specialty: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // 'active', 'completed', 'flagged_moderation'
  status: {
    type: DataTypes.STRING,
    defaultValue: 'active'
  },
  // Number of exchanges (patient messages)
  exchange_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'symptom_sessions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = SymptomSession;
