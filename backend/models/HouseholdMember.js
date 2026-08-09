const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const MEMBER_TYPES = ['head_of_household', 'adult_family_member', 'dependent_minor', 'adult_dependent'];
const MEMBER_STATUSES = ['invited', 'active', 'revoked', 'left', 'expired', 'declined'];

const HouseholdMember = sequelize.define('HouseholdMember', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  household_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  household_name: {
    type: DataTypes.STRING
  },
  user_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  user_name: {
    type: DataTypes.STRING
  },
  user_email: {
    type: DataTypes.STRING
  },
  role: {
    type: DataTypes.STRING,
    defaultValue: 'member'
  },
  member_type: {
    type: DataTypes.ENUM(...MEMBER_TYPES),
    allowNull: false,
    defaultValue: 'adult_family_member'
  },
  status: {
    type: DataTypes.ENUM(...MEMBER_STATUSES),
    defaultValue: 'invited'
  },
  added_by: {
    type: DataTypes.STRING
  },
  added_at: {
    type: DataTypes.DATE
  },
  joined_at: {
    type: DataTypes.DATE
  },
  left_at: {
    type: DataTypes.DATE
  },
  guardianship_document_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  date_of_birth: {
    type: DataTypes.DATEONLY
  },
  age_of_majority_at: {
    type: DataTypes.DATEONLY
  }
}, {
  tableName: 'household_members',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = { HouseholdMember, MEMBER_TYPES, MEMBER_STATUSES };
