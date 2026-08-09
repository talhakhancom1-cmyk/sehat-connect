const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CountryConfig = sequelize.define('CountryConfig', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  country: {
    type: DataTypes.STRING,
    allowNull: false
  },
  country_name: {
    type: DataTypes.STRING
  },
  language: {
    type: DataTypes.STRING,
    defaultValue: 'en'
  },
  languages: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  timezone: {
    type: DataTypes.STRING
  },
  currency: {
    type: DataTypes.STRING
  },
  currency_symbol: {
    type: DataTypes.STRING
  },
  cities: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  specialties: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  regulation_notes: {
    type: DataTypes.TEXT
  },
  consent_default_expiry_hours: {
    type: DataTypes.INTEGER,
    defaultValue: 24
  },
  age_of_majority: {
    type: DataTypes.INTEGER,
    defaultValue: 18
  },
  sensitive_categories: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'country_configs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = CountryConfig;
