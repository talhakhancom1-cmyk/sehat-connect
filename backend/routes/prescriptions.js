const express = require('express');
const { Op } = require('sequelize');
const { Prescription, PrescriptionItem, Doctor } = require('../models');
const { authenticate } = require('../middleware/auth');
const { ADMIN_ROLES } = require('../constants/ehc');
const { parseSort } = require('../lib/parseSort');
const { paginate, buildPaginatedResponse } = require('../lib/paginate');
const { pickFields } = require('../lib/pickFields');

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

// PUT /api/v1/prescriptions/:id — update a prescription (sign, change status, etc.)
// Only the doctor who created it, the patient it belongs to, or an admin can update.
// Doctors can sign/unsign and update clinical fields. Patients can only mark
// status as 'completed' (e.g. acknowledge). Admins can update anything.
const PRESCRIPTION_WRITABLE = [
  'status', 'notes', 'diagnosis', 'follow_up', 'is_signed', 'signed_at',
  'doctor_specialty', 'appointment_id', 'encounter_id',
];

router.put('/:id', authenticate, async (req, res) => {
  try {
    const prescription = await Prescription.findByPk(req.params.id);
    if (!prescription) {
      return res.status(404).json({ error: 'Prescription not found' });
    }

    // Authorization: determine who the caller is
    const isAdminUser = isAdmin(req.user);
    const isOwningDoctor = prescription.signed_by_user_id === req.user.id;
    let isPatientOwner = prescription.patient_id === req.user.id;
    // Also check if the caller is the doctor via Doctor table link
    if (!isOwningDoctor && !isAdminUser) {
      const myDoctor = await Doctor.findOne({
        where: req.user.email ? { [Op.or]: [{ user_id: req.user.id }, { email: req.user.email }] } : { user_id: req.user.id }
      }).catch(() => null);
      if (myDoctor && prescription.doctor_id === myDoctor.id) {
        // It's the doctor who owns this prescription
      } else if (!isPatientOwner) {
        return res.status(403).json({ error: 'Forbidden — you can only update your own prescriptions' });
      }
    }

    const body = pickFields(req.body, PRESCRIPTION_WRITABLE);

    // If signing the prescription, set signed_at and ensure status is 'active'
    if (body.is_signed === true) {
      body.signed_at = body.signed_at || new Date().toISOString();
      body.status = 'active';
    }

    await prescription.update(body);

    // Return with items/medications for frontend convenience
    const items = await PrescriptionItem.findAll({
      where: { prescription_id: prescription.id },
      order: [['display_order', 'ASC']]
    });
    res.json({ ...prescription.toJSON(), items, medications: items.map(itemToMedication) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
