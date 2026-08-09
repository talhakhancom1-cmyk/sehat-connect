const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ApiKey = sequelize.define('ApiKey', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  // Store a SHA-256 hash of the full key — never store the raw key in the DB.
  // The full key is only returned ONCE at creation time.
  key_hash: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  // A non-secret prefix (e.g. "sk_live_a1b2…") for display in the admin panel
  key_prefix: {
    type: DataTypes.STRING,
    allowNull: false
  },
  // JSON array of allowed domains/origins, e.g. ["example.com", "app.example.com"]
  // "*" means allow all domains (not recommended for production)
  allowed_domains: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  // JSON array of scopes, e.g. ["read:doctors", "read:appointments", "write:appointments"]
  // "*" means all scopes
  scopes: {
    type: DataTypes.JSONB,
    defaultValue: ['*']
  },
  // Rate limit: requests per minute (0 = unlimited)
  rate_limit_per_minute: {
    type: DataTypes.INTEGER,
    defaultValue: 60
  },
  created_by_user_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  last_used_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  last_used_ip: {
    type: DataTypes.STRING,
    allowNull: true
  },
  last_used_origin: {
    type: DataTypes.STRING,
    allowNull: true
  },
  total_requests: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'api_keys',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = ApiKey;
