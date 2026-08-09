const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DoctorCredential = sequelize.define('DoctorCredential', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  doctor_id: {
    type: DataTypes.UUID
  },
  organization_id: {
    type: DataTypes.UUID
  },
  license_number: {
    type: DataTypes.STRING,
    allowNull: false
  },
  issuing_body: {
    type: DataTypes.STRING,
    allowNull: false
  },
  country: {
    type: DataTypes.STRING,
    allowNull: false
  },
  specialty: {
    type: DataTypes.STRING
  },
  verification_status: {
    type: DataTypes.ENUM('pending', 'verified', 'suspended', 'revoked'),
    defaultValue: 'pending'
  },
  verified_by_id: {
    type: DataTypes.UUID
  },
  verified_at: {
    type: DataTypes.DATE
  },
  documents: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  valid_from: {
    type: DataTypes.DATE
  },
  valid_until: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'doctor_credentials',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = DoctorCredential;
