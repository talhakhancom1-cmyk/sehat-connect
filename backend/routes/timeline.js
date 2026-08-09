const express = require('express');
const { Op } = require('sequelize');
const MedicalRecord = require('../models/MedicalRecord');
const { RECORD_CATEGORIES } = require('../constants/ehc');
const { authenticate } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

function getCanonicalLabel(categoryValue) {
  if (!categoryValue) return null;
  const byKey = RECORD_CATEGORIES.find(c => c.key === categoryValue);
  if (byKey) return byKey.label;
  const byLabel = RECORD_CATEGORIES.find(
    c => c.label.toLowerCase() === categoryValue.toLowerCase()
  );
  if (byLabel) return byLabel.label;
  return categoryValue;
}

function getMonthKey(date) {
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return { key: `${year}-${month}`, label: d.toLocaleString('en-US', { month: 'long', year: 'numeric' }) };
}

router.get('/', authenticate, async (req, res) => {
  try {
    const { patientId } = req.params;
    const records = await MedicalRecord.findAll({
      where: { patient_id: patientId },
      order: [['date', 'DESC'], ['created_at', 'DESC']],
      limit: 1000
    });

    const groups = {};
    for (const record of records) {
      const sortDate = record.date || record.created_at;
      const { key, label } = getMonthKey(sortDate);
      if (!groups[key]) {
        groups[key] = { month: key, label, records: [] };
      }
      const plain = record.toJSON();
      plain.category_label = getCanonicalLabel(plain.category);
      groups[key].records.push(plain);
    }

    const timeline = Object.values(groups).sort((a, b) => b.month.localeCompare(a.month));
    res.json({ patient_id: patientId, timeline });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
