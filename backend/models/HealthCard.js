const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CARD_TYPES = [
  'emergency',
  'allergy',
  'medication',
  'vaccination',
  'chronic_condition',
  'maternal',
  'child',
  'ips'
];

const HealthCard = sequelize.define('HealthCard', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  patient_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  patient_name: {
    type: DataTypes.STRING
  },
  card_type: {
    type: DataTypes.ENUM(...CARD_TYPES),
    allowNull: false
  },
  title: {
    type: DataTypes.STRING
  },
  data_json: {
    type: DataTypes.TEXT
  },
  status: {
    type: DataTypes.ENUM('active', 'archived', 'revoked'),
    defaultValue: 'active'
  },
  shared_token: {
    type: DataTypes.STRING
  },
  shared_token_expires_at: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'health_cards',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

HealthCard.CARD_TYPES = CARD_TYPES;

module.exports = HealthCard;
