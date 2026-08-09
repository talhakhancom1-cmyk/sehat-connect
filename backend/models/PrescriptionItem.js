const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PrescriptionItem = sequelize.define('PrescriptionItem', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  prescription_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  medication_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  dosage: {
    type: DataTypes.STRING
  },
  frequency: {
    type: DataTypes.STRING
  },
  duration: {
    type: DataTypes.STRING
  },
  route: {
    type: DataTypes.ENUM('oral', 'topical', 'injection', 'inhalation', 'sublingual', 'other')
  },
  instructions: {
    type: DataTypes.TEXT
  },
  display_order: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'prescription_items',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = PrescriptionItem;
