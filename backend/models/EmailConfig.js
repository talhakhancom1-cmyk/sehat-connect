const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { encrypt, decrypt } = require('../lib/crypto');

const EmailConfig = sequelize.define('EmailConfig', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  // SMTP provider settings
  smtp_host: {
    type: DataTypes.STRING,
    allowNull: false
  },
  smtp_port: {
    type: DataTypes.INTEGER,
    defaultValue: 587
  },
  smtp_secure: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  smtp_username: {
    type: DataTypes.STRING,
    allowNull: false
  },
  // Encrypted at rest via AES-256-GCM (see hooks below)
  smtp_password: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  // From address for outgoing emails
  from_email: {
    type: DataTypes.STRING,
    allowNull: false
  },
  from_name: {
    type: DataTypes.STRING,
    defaultValue: 'Sehat Connect'
  },
  // Reply-to address (optional)
  reply_to: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Which features use email
  enable_password_reset: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  enable_signup_otp: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  enable_appointment_reminders: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  enable_medication_reminders: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  enable_consent_notifications: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  enable_chat_notifications: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  enable_payment_receipts: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  // Master toggle
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  updated_by_user_id: {
    type: DataTypes.UUID,
    allowNull: true
  }
}, {
  tableName: 'email_configs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  hooks: {
    beforeSave: (record) => {
      // Encrypt the password before writing to DB (only if it changed and isn't already encrypted)
      if (record.changed('smtp_password') && record.smtp_password) {
        const val = record.smtp_password;
        // Don't double-encrypt (already encrypted values contain ':')
        if (!val.includes(':') || val.length < 100) {
          try {
            record.smtp_password = encrypt(val);
            record.dataValues.smtp_password = record.smtp_password;
          } catch (e) {
            console.error('EmailConfig: failed to encrypt smtp_password:', e.message);
          }
        }
      }
    },
    afterFind: (result) => {
      // Decrypt the password after reading from DB
      const decryptOne = (record) => {
        if (record && record.smtp_password) {
          const decrypted = decrypt(record.smtp_password);
          if (decrypted !== null) {
            record.smtp_password = decrypted;
            record.dataValues.smtp_password = decrypted;
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

module.exports = EmailConfig;
