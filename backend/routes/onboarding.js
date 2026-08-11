const express = require('express');
const { User, Doctor } = require('../models');
const { authenticate } = require('../middleware/auth');
const { recordAudit, auditFromRequest } = require('../lib/audit');
const {
  validatePhone, validateNumericRange, validateStringLength,
  validateEnum, validateDateRange, sanitizeError
} = require('../lib/validate');

const router = express.Router();

// POST /api/v1/onboarding
// Body: { role: 'patient'|'doctor', ...profileFields }
router.post('/', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    const role = body.role === 'doctor' ? 'doctor' : 'patient';

    // --- Server-side validation ---
    if (body.age !== undefined && body.age !== null && body.age !== '') {
      const err = validateNumericRange(body.age, 0, 150, 'age');
      if (err) return res.status(400).json({ error: err });
    }
    if (body.consultation_fee !== undefined && body.consultation_fee !== null && body.consultation_fee !== '') {
      const err = validateNumericRange(body.consultation_fee, 0, 1000000, 'consultation_fee');
      if (err) return res.status(400).json({ error: err });
    }
    if (body.experience_years !== undefined && body.experience_years !== null && body.experience_years !== '') {
      const err = validateNumericRange(body.experience_years, 0, 70, 'experience_years');
      if (err) return res.status(400).json({ error: err });
    }
    if (body.gender !== undefined && body.gender !== null && body.gender !== '') {
      const err = validateEnum(body.gender, ['male', 'female', 'other'], 'gender');
      if (err) return res.status(400).json({ error: err });
    }
    if (body.blood_type !== undefined && body.blood_type !== null && body.blood_type !== '') {
      const err = validateEnum(body.blood_type, ['A+','A-','B+','B-','AB+','AB-','O+','O-'], 'blood_type');
      if (err) return res.status(400).json({ error: err });
    }
    if (body.phone !== undefined && body.phone !== null && body.phone !== '') {
      if (!validatePhone(body.phone)) {
        return res.status(400).json({ error: 'Phone number format is invalid' });
      }
    }
    if (body.emergency_contact_phone !== undefined && body.emergency_contact_phone !== null && body.emergency_contact_phone !== '') {
      if (!validatePhone(body.emergency_contact_phone)) {
        return res.status(400).json({ error: 'Emergency contact phone format is invalid' });
      }
    }
    const textLimits = { bio: 2000, address: 500, allergies: 1000, city: 100, country: 100, specialty: 200, pmdc_number: 50, display_name: 100, emergency_contact_name: 100 };
    for (const [field, max] of Object.entries(textLimits)) {
      if (body[field] !== undefined && body[field] !== null) {
        const err = validateStringLength(body[field], max, field);
        if (err) return res.status(400).json({ error: err });
      }
    }
    if (body.date_of_birth) {
      const currentYear = new Date().getFullYear();
      const err = validateDateRange(body.date_of_birth, 1900, currentYear, 'date_of_birth');
      if (err) return res.status(400).json({ error: err });
    }

    const updateData = {
      onboarded: true,
      display_name: body.display_name || body.fullName || req.user.display_name,
      phone: body.phone || null,
      address: body.address || null,
      city: body.city || null,
      country: body.country || 'Pakistan',
      profile_pic_url: body.profile_pic_url || null
    };

    if (role === 'patient') {
      updateData.blood_type = body.blood_type || null;
      updateData.allergies = body.allergies || null;
      updateData.gender = body.gender || null;
      updateData.age = body.age ? parseInt(body.age) : null;
      // Validate date_of_birth: reject years outside 1900-current year
      if (body.date_of_birth) {
        const dobYear = new Date(body.date_of_birth).getFullYear();
        const currentYear = new Date().getFullYear();
        if (Number.isNaN(dobYear) || dobYear < 1900 || dobYear > currentYear) {
          return res.status(400).json({ error: `Invalid date of birth: year must be between 1900 and ${currentYear}` });
        }
        updateData.date_of_birth = body.date_of_birth;
      } else {
        updateData.date_of_birth = null;
      }
      updateData.emergency_contact_name = body.emergency_contact_name || null;
      updateData.emergency_contact_phone = body.emergency_contact_phone || null;
      // Ensure role is patient
      updateData.role = req.user.role === 'super_admin' ? req.user.role : 'patient';
    } else {
      // Doctor fields
      updateData.specialty = body.specialty || null;
      updateData.pmdc_number = body.pmdc_number || null;
      updateData.consultation_fee = body.consultation_fee ? parseFloat(body.consultation_fee) : 0;
      updateData.experience_years = body.experience_years ? parseInt(body.experience_years) : 0;
      updateData.bio = body.bio || null;
      updateData.verification_status = 'pending';
      // Ensure role is doctor
      if (req.user.role !== 'super_admin') {
        updateData.role = 'doctor';
      }
    }

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await user.update(updateData);

    // If doctor, create or update the Doctor row
    if (role === 'doctor') {
      const doctorData = {
        user_id: user.id,
        full_name: updateData.display_name,
        email: user.email,
        specialty: body.specialty || 'General Medicine',
        consultation_fee: updateData.consultation_fee || 0,
        city: body.city || null,
        country: body.country || 'Pakistan',
        phone: body.phone || null,
        pmdc_number: body.pmdc_number || null,
        profile_pic_url: body.profile_pic_url || null,
        bio: body.bio || null,
        experience_years: updateData.experience_years || 0,
        address: body.address || null,
        license_number: body.pmdc_number || body.license_number || null,
        license_document_url: body.license_document_url || null,
        identity_document_url: body.identity_document_url || null,
        verification_notes: body.verification_notes || null,
        verification_status: 'pending',
        rating: 0,
        total_reviews: 0,
        total_patients: 0,
        is_online: false
      };

      const existing = await Doctor.findOne({ where: { email: user.email } });
      if (existing) {
        await existing.update(doctorData);
      } else {
        await Doctor.create(doctorData);
      }
    }

    await recordAudit(auditFromRequest(req, {
      action: role === 'doctor' ? 'doctor_onboarded' : 'patient_onboarded',
      target_type: 'User',
      target_id: user.id,
      patient_id: user.id,
      detail: `Completed onboarding as ${role}`
    }));

    const refreshed = await User.findByPk(req.user.id);
    res.json({
      success: true,
      user: refreshed,
      role,
      doctor_pending_verification: role === 'doctor'
    });
  } catch (error) {
    console.error('Onboarding error:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

// GET /api/v1/onboarding/status
router.get('/status', authenticate, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    let doctorProfile = null;
    if (user.role === 'doctor') {
      doctorProfile = await Doctor.findOne({ where: { email: user.email } });
    }
    res.json({
      onboarded: user.onboarded,
      role: user.role,
      verification_status: user.verification_status,
      doctor_profile: doctorProfile
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
