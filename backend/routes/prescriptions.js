const express = require('express');
const { Op } = require('sequelize');
const { Prescription, PrescriptionItem, Doctor } = require('../models');
const { authenticate } = require('../middleware/auth');
const { ADMIN_ROLES } = require('../constants/ehc');
const { parseSort } = require('../lib/parseSort');
const { paginate, buildPaginatedResponse } = require('../lib/paginate');

const router = express.Router();

function isAdmin(user) {
  return ADMIN_ROLES.includes(user.role);
}

// Map a PrescriptionItem row to the frontend-expected medication shape
function itemToMedication(item) {
  return {
    name: item.medication_name,
    dosage: item.dosage,
    frequency: item.frequency,
    duration: item.duration,
    route: item.route,
    instructions: item.instructions,
  };
}

router.get('/', authenticate, async (req, res) => {
  try {
    const where = {};
    if (req.query.doctor_id) where.doctor_id = req.query.doctor_id;
    if (req.query.patient_id) where.patient_id = req.query.patient_id;
    if (req.query.patient_name) where.patient_name = req.query.patient_name;
    if (req.query.status) where.status = req.query.status;

    if (!isAdmin(req.user)) {
      const myDoctor = await Doctor.findOne({
        where: req.user.email ? { [Op.or]: [{ user_id: req.user.id }, { email: req.user.email }] } : { user_id: req.user.id }
      }).catch(() => null);
      const ownership = [{ patient_id: req.user.id }, { signed_by_user_id: req.user.id }];
      if (myDoctor) ownership.push({ doctor_id: myDoctor.id });
      where[Op.and] = [{ [Op.or]: ownership }];
    }

    const { offset, limit } = paginate(req);
    const { rows, count } = await Prescription.findAndCountAll({
      where,
      order: parseSort(req.query, ['issued_at', 'created_at', 'updated_at'], 'issued_at', 'DESC'),
      offset,
      limit
    });
    // Fetch items for all prescriptions in one query (avoids N+1)
    const prescriptionIds = rows.map(p => p.id);
    const allItems = prescriptionIds.length ? await PrescriptionItem.findAll({
      where: { prescription_id: prescriptionIds },
      order: [['display_order', 'ASC']]
    }) : [];
    const itemsByPresc = {};
    for (const item of allItems) {
      if (!itemsByPresc[item.prescription_id]) itemsByPresc[item.prescription_id] = [];
      itemsByPresc[item.prescription_id].push(itemToMedication(item));
    }
    const result = rows.map(p => ({
      ...p.toJSON(),
      medications: itemsByPresc[p.id] || [],
      created_date: p.created_at,
      date: p.issued_at
    }));
    res.json(buildPaginatedResponse(req, result, count));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.patient_id) {
      return res.status(400).json({ error: 'patient_id is required' });
    }
    // Accept both `items` (canonical) and `medications` (frontend field name)
    const meds = Array.isArray(body.items) ? body.items : (Array.isArray(body.medications) ? body.medications : []);
    if (meds.length === 0) {
      return res.status(400).json({ error: 'items/medications array is required' });
    }

    const prescription = await Prescription.create({
      patient_id: body.patient_id,
      patient_name: body.patient_name,
      doctor_id: body.doctor_id || req.user.id,
      doctor_name: body.doctor_name,
      doctor_specialty: body.doctor_specialty,
      diagnosis: body.diagnosis,
      follow_up: body.follow_up,
      appointment_id: body.appointment_id,
      encounter_id: body.encounter_id,
      status: 'active',
      notes: body.notes,
      issued_at: body.issued_at || body.date || new Date(),
      is_signed: false,
      signed_by_user_id: req.user.id
    });

    const items = await PrescriptionItem.bulkCreate(
      meds.map((item, index) => ({
        prescription_id: prescription.id,
        medication_name: item.medication_name || item.name,
        dosage: item.dosage,
        frequency: item.frequency,
        duration: item.duration,
        route: item.route,
        instructions: item.instructions,
        display_order: item.display_order || index
      }))
    );

    res.status(201).json({ ...prescription.toJSON(), items, medications: items.map(itemToMedication) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const prescription = await Prescription.findByPk(req.params.id);
    if (!prescription) {
      return res.status(404).json({ error: 'Prescription not found' });
    }
    const items = await PrescriptionItem.findAll({
      where: { prescription_id: prescription.id },
      order: [['display_order', 'ASC']]
    });
    res.json({ ...prescription.toJSON(), items, medications: items.map(itemToMedication) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
