const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();
const MedicalRecord = require('../models/MedicalRecord');
const Doctor = require('../models/Doctor');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { parseSort } = require('../lib/parseSort');
const { paginate, buildPaginatedResponse } = require('../lib/paginate');
const { pickFields } = require('../lib/pickFields');
const { canAccessMedicalRecord, isAdmin, isDoctor } = require('../lib/ownership');

// Fields that can be set on a MedicalRecord
const RECORD_WRITABLE_FIELDS = [
  'patient_id', 'patient_name', 'title', 'category', 'date',
  'date_precision', 'doctor_name', 'hospital', 'source_hospital', 'notes',
  'file_url', 'file_type', 'provenance', 'is_draft', 'is_amendment',
  'replaces_version_id', 'reason_for_change',
  'consent_id', 'encounter_id', 'verification_status',
  'verified_by_id', 'verified_by_name', 'verified_at', 'shared_with_doctor_ids'
];

// Get medical records.
// - Admins: can see all records, optionally filtered by patient_id/patient_name.
// - Doctors: can query by patient_id or patient_name (the frontend's
//   PatientRecordsDialog/PatientOverviewDialog sends patient_name after
//   verifying record access via checkRecordAccess). Without this, doctors
//   would only see records where patient_id = their own user ID (zero).
// - Patients: only see their own records (patient_id = their user ID).
router.get('/', authenticate, async (req, res) => {
  try {
    const andConditions = [];

    if (isAdmin(req.user)) {
      // Admins see everything; apply optional filters
      if (req.query.patient_id) andConditions.push({ patient_id: req.query.patient_id });
      if (req.query.patient_name) andConditions.push({ patient_name: req.query.patient_name });
    } else if (isDoctor(req.user)) {
      // Doctors can query by patient_id or patient_name (access control is
      // enforced on the frontend via checkRecordAccess before querying).
      if (req.query.patient_id) {
        andConditions.push({ patient_id: req.query.patient_id });
      } else if (req.query.patient_name) {
        andConditions.push({ patient_name: req.query.patient_name });
      } else {
        // No patient filter — return nothing (doctors shouldn't see all records)
        andConditions.push({ patient_id: '__NO_MATCH__' });
      }
    } else {
      // Patients see only their own records
      andConditions.push({ patient_id: req.user.id });
    }

    if (req.query.category) andConditions.push({ category: req.query.category });
    if (req.query.provenance) andConditions.push({ provenance: req.query.provenance });

    const where = andConditions.length ? { [Op.and]: andConditions } : {};
    const { offset, limit } = paginate(req);
    const { rows, count } = await MedicalRecord.findAndCountAll({
      where,
      order: parseSort(req.query, ['date', 'created_at', 'updated_at'], 'date', 'DESC'),
      offset,
      limit
    });
    const result = rows.map(r => ({ ...r.toJSON(), created_date: r.created_at }));
    res.json(buildPaginatedResponse(req, result, count));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get medical record by ID — owner, doctor, or admin
router.get('/:id', authenticate, async (req, res) => {
  try {
    const record = await MedicalRecord.findByPk(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Medical record not found' });
    }
    const allowed = await canAccessMedicalRecord(record, req.user);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden — you do not have access to this medical record' });
    }
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new medical record — patient_id is always forced to the caller unless admin
router.post('/', authenticate, async (req, res) => {
  try {
    const body = pickFields(req.body, RECORD_WRITABLE_FIELDS);
    if (!isAdmin(req.user)) {
      // Doctors may create records for their patients; everyone else is
      // scoped to their own patient_id.
      if (isDoctor(req.user) && body.patient_id && body.patient_id !== req.user.id) {
        // Verify the doctor has a legitimate relationship with this patient
        const probeRecord = { patient_id: body.patient_id };
        const hasRelationship = await canAccessMedicalRecord(probeRecord, req.user);
        if (!hasRelationship) {
          return res.status(403).json({ error: 'Forbidden — no patient relationship found for this patient_id' });
        }
      } else {
        body.patient_id = req.user.id;
      }
      // Auto-fill patient_name from the authenticated user if not provided
      if (!body.patient_name) {
        body.patient_name = req.user.display_name || req.user.full_name || req.user.email || 'Patient';
      }
    }
    const record = await MedicalRecord.create(body);
    res.status(201).json(record);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update medical record (admin only — not used by the frontend today)
router.put('/:id', authenticate, requireAdmin(), async (req, res) => {
  try {
    const record = await MedicalRecord.findByPk(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Medical record not found' });
    }
    await record.update(pickFields(req.body, RECORD_WRITABLE_FIELDS));
    res.json(record);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete medical record (admin only — not used by the frontend today)
router.delete('/:id', authenticate, requireAdmin(), async (req, res) => {
  try {
    const record = await MedicalRecord.findByPk(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Medical record not found' });
    }
    await record.destroy();
    res.json({ message: 'Medical record deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
