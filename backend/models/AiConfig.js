const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { encrypt, decrypt } = require('../lib/crypto');

const AiConfig = sequelize.define('AiConfig', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  // OpenAI API key — encrypted at rest via AES-256-GCM
  openai_api_key: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Model to use for symptom checker
  openai_model: {
    type: DataTypes.STRING,
    defaultValue: 'gpt-4o-mini'
  },
  // Master toggle for the symptom checker feature
  symptom_checker_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  // Max symptom checks per user per day
  daily_check_limit: {
    type: DataTypes.INTEGER,
    defaultValue: 10
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  updated_by_user_id: {
    type: DataTypes.UUID,
    allowNull: true
  }
}, {
  tableName: 'ai_configs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  hooks: {
    beforeSave: (record) => {
      if (record.changed('openai_api_key') && record.openai_api_key) {
        const val = record.openai_api_key;
        // Don't double-encrypt
        if (!val.includes(':') || val.length < 100) {
          try {
            record.openai_api_key = encrypt(val);
            record.dataValues.openai_api_key = record.openai_api_key;
          } catch (e) {
            console.error('AiConfig: failed to encrypt openai_api_key:', e.message);
          }
        }
      }
    },
    afterFind: (result) => {
      const decryptOne = (record) => {
        if (record && record.openai_api_key) {
          const decrypted = decrypt(record.openai_api_key);
          if (decrypted !== null) {
            record.openai_api_key = decrypted;
            record.dataValues.openai_api_key = decrypted;
          }
        }
      };
      if (Array.isArray(result)) {
        result.forEach(decryptOne);
      } else if (result) {
        decryptOne(result);
      }
    }
  }
});

module.exports = AiConfig;
