const express = require('express');
const { RecordImport, RecordImportFile, RecordImportVersion, MedicalRecord } = require('../models');
const { RECORD_CATEGORIES, PROVENANCE } = require('../constants/ehc');
const { authenticate, requireRole } = require('../middleware/auth');
const { parseSort } = require('../lib/parseSort');
const { canAccessMedicalRecord, isAdmin } = require('../lib/ownership');

const router = express.Router();
const patientRouter = express.Router({ mergeParams: true });
const VALID_STATUSES = ['draft', 'submitted', 'verified'];

function normalizeCategory(category) {
  if (!category) return null;
  const key = category.toLowerCase().replace(/\s+/g, '_');
  const match = RECORD_CATEGORIES.find(c => c.key === key || c.key === category);
  return match ? match.key : category;
}

function buildRecordFromImport(recordImport) {
  return {
    patient_id: recordImport.patient_id,
    patient_name: 'Patient',
    title: recordImport.diagnosis_or_description || 'Imported record',
    category: recordImport.category,
    date: recordImport.date || new Date(),
    date_precision: recordImport.date_precision === 'exact' ? 'day' : recordImport.date_precision,
    source_hospital: recordImport.source_name,
    notes: recordImport.notes,
    provenance: PROVENANCE.PATIENT_UPLOADED,
    is_draft: false
  };
}

router.post('/', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    const patientId = body.patient_id || req.params.patientId;
    if (!patientId) {
      return res.status(400).json({ error: 'patient_id is required' });
    }
    // Non-admins can only create imports for themselves (doctors use the
    // verify endpoint, not the create endpoint).
    if (!isAdmin(req.user) && patientId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden — patient_id must match the current user' });
    }
    if (!body.category) {
      return res.status(400).json({ error: 'category is required' });
    }
    const recordImport = await RecordImport.create({
      patient_id: patientId,
      category: normalizeCategory(body.category),
      source_name: body.source_name,
      date: body.date,
      date_precision: body.date_precision || 'exact',
      date_is_approximate: body.date_is_approximate || false,
      diagnosis_or_description: body.diagnosis_or_description,
      notes: body.notes,
      status: 'draft',
      provenance: PROVENANCE.PATIENT_UPLOADED,
      created_by_user_id: req.user.id,
      created_by_role: req.user.role
    });
    res.status(201).json(recordImport);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

patientRouter.get('/', authenticate, async (req, res) => {
  try {
    const records = await RecordImport.findAll({
      where: { patient_id: req.params.patientId },
      order: parseSort(req.query, ['created_at', 'date'], 'created_at', 'DESC'),
      limit: 1000
    });
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const recordImport = await RecordImport.findByPk(req.params.id);
    if (!recordImport) {
      return res.status(404).json({ error: 'Record import not found' });
    }
    const allowed = await canAccessMedicalRecord({ patient_id: recordImport.patient_id }, req.user);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden — you do not have access to this record import' });
    }
    const files = await RecordImportFile.findAll({
      where: { record_import_id: recordImport.id }
    });
    res.json({ ...recordImport.toJSON(), files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id', authenticate, async (req, res) => {
  try {
    const recordImport = await RecordImport.findByPk(req.params.id);
    if (!recordImport) {
      return res.status(404).json({ error: 'Record import not found' });
    }
    const allowed = await canAccessMedicalRecord({ patient_id: recordImport.patient_id }, req.user);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden — you do not have access to this record import' });
    }
    if (recordImport.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft imports can be edited' });
    }
    const updates = { ...req.body };
    if (updates.category) {
      updates.category = normalizeCategory(updates.category);
    }
    delete updates.id;
    delete updates.patient_id;
    await recordImport.update(updates);
    res.json(recordImport);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/files', authenticate, async (req, res) => {
  try {
    const recordImport = await RecordImport.findByPk(req.params.id);
    if (!recordImport) {
      return res.status(404).json({ error: 'Record import not found' });
    }
    const allowed = await canAccessMedicalRecord({ patient_id: recordImport.patient_id }, req.user);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden — you do not have access to this record import' });
    }
    const { file_url, file_type, file_name, captured_from_camera } = req.body || {};
    if (!file_url) {
      return res.status(400).json({ error: 'file_url is required' });
    }
    const file = await RecordImportFile.create({
      record_import_id: recordImport.id,
      file_url,
      file_type,
      file_name,
      captured_from_camera: captured_from_camera || false,
      uploaded_by_user_id: req.user.id
    });
    res.status(201).json(file);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/submit', authenticate, async (req, res) => {
  try {
    const recordImport = await RecordImport.findByPk(req.params.id);
    if (!recordImport) {
      return res.status(404).json({ error: 'Record import not found' });
    }
    const allowed = await canAccessMedicalRecord({ patient_id: recordImport.patient_id }, req.user);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden — you do not have access to this record import' });
    }
    if (recordImport.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft imports can be submitted' });
    }

    const medicalRecord = await MedicalRecord.create(buildRecordFromImport(recordImport));
    await recordImport.update({
      status: 'submitted',
      submitted_at: new Date(),
      medical_record_id: medicalRecord.id
    });

    res.json({ record_import: recordImport, medical_record: medicalRecord });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/verify', authenticate, requireRole(['doctor', 'super_admin', 'clinic_admin']), async (req, res) => {
  try {
    const recordImport = await RecordImport.findByPk(req.params.id);
    if (!recordImport) {
      return res.status(404).json({ error: 'Record import not found' });
    }
    await recordImport.update({
      status: 'verified',
      verified_at: new Date(),
      verified_by_id: req.user.id,
      provenance: PROVENANCE.CLINICIAN_VERIFIED
    });
    if (recordImport.medical_record_id) {
      const medicalRecord = await MedicalRecord.findByPk(recordImport.medical_record_id);
      if (medicalRecord) {
        await medicalRecord.update({
          provenance: PROVENANCE.CLINICIAN_VERIFIED,
          verification_status: 'clinician_verified',
          verified_by_id: req.user.id,
          verified_at: new Date()
        });
      }
    }
    res.json(recordImport);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/amendments', authenticate, async (req, res) => {
  try {
    const recordImport = await RecordImport.findByPk(req.params.id);
    if (!recordImport) {
      return res.status(404).json({ error: 'Record import not found' });
    }
    const allowed = await canAccessMedicalRecord({ patient_id: recordImport.patient_id }, req.user);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden — you do not have access to this record import' });
    }
    const { amendment_reason, new_data } = req.body || {};
    await RecordImportVersion.create({
      record_import_id: recordImport.id,
      amendment_reason,
      previous_data: recordImport.toJSON(),
      new_data,
      created_by_user_id: req.user.id,
      created_by_role: req.user.role
    });
    if (new_data && typeof new_data === 'object') {
      const updates = { ...new_data };
      delete updates.id;
      delete updates.patient_id;
      if (updates.category) updates.category = normalizeCategory(updates.category);
      await recordImport.update(updates);
    }
    res.status(201).json({ message: 'Amendment recorded' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = { router, patientRouter };
