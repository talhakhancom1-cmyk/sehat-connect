const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Doctor = sequelize.define('Doctor', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.UUID
  },
  full_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  specialty: {
    type: DataTypes.STRING,
    allowNull: false
  },
  consultation_fee: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  city: {
    type: DataTypes.STRING
  },
  country: {
    type: DataTypes.STRING,
    defaultValue: 'Pakistan'
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  phone: {
    type: DataTypes.STRING
  },
  pmdc_number: {
    type: DataTypes.STRING
  },
  profile_pic_url: {
    type: DataTypes.STRING
  },
  // Virtual field for frontend compatibility — aliases profile_pic_url
  image_url: {
    type: DataTypes.VIRTUAL,
    get() { return this.profile_pic_url; },
    set(value) { this.setDataValue('profile_pic_url', value); }
  },
  verification_status: {
    type: DataTypes.ENUM('pending', 'verified', 'suspended'),
    defaultValue: 'pending'
  },
  bio: {
    type: DataTypes.TEXT
  },
  experience_years: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  address: {
    type: DataTypes.TEXT
  },
  license_number: {
    type: DataTypes.STRING
  },
  license_document_url: {
    type: DataTypes.TEXT
  },
  identity_document_url: {
    type: DataTypes.TEXT
  },
  verification_notes: {
    type: DataTypes.TEXT
  },
  verification_submitted_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  rating: {
    type: DataTypes.DECIMAL(3, 2),
    defaultValue: 0
  },
  total_reviews: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  total_patients: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  is_online: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'doctors',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Doctor;