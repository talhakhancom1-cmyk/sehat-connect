const express = require('express');
const { Review, Doctor } = require('../models');
const { Op } = require('sequelize');
const { authenticate } = require('../middleware/auth');
const { parseSort } = require('../lib/parseSort');
const { isAdmin } = require('../lib/ownership');
const { validateStringLength, sanitizeError } = require('../lib/validate');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const where = {};
    if (req.query.doctor_id) where.doctor_id = req.query.doctor_id;
    if (req.query.patient_id) where.patient_id = req.query.patient_id;
    // Non-admins: scope to public reviews or their own reviews (as patient or doctor)
    if (!isAdmin(req.user)) {
      const doctorEntity = await Doctor.findOne({
        where: req.user.email
          ? { [Op.or]: [{ user_id: req.user.id }, { email: req.user.email }] }
          : { user_id: req.user.id }
      }).catch(() => null);
      const ownership = [{ patient_id: req.user.id }];
      if (doctorEntity) ownership.push({ doctor_id: doctorEntity.id });
      where[Op.or] = ownership;
    }
    const reviews = await Review.findAll({
      where,
      order: parseSort(req.query, ['date', 'created_at', 'rating'], 'date', 'DESC'),
      limit: 200
    });
    const result = reviews.map(r => ({ ...r.toJSON(), created_date: r.created_at }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const review = await Review.findByPk(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    // Allow if the user is the reviewer or the doctor being reviewed (or admin)
    if (!isAdmin(req.user) && review.patient_id !== req.user.id) {
      const doctorEntity = await Doctor.findOne({
        where: req.user.email
          ? { [Op.or]: [{ user_id: req.user.id }, { email: req.user.email }] }
          : { user_id: req.user.id }
      }).catch(() => null);
      if (!doctorEntity || doctorEntity.id !== review.doctor_id) {
        return res.status(403).json({ error: 'Forbidden — you can only view your own reviews or reviews about you' });
      }
    }
    res.json({ ...review.toJSON(), created_date: review.created_at });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.doctor_id) return res.status(400).json({ error: 'doctor_id is required' });
    if (!body.rating) return res.status(400).json({ error: 'rating is required' });
    // --- Server-side validation ---
    const ratingNum = Number(body.rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ error: 'rating must be an integer between 1 and 5' });
    }
    if (body.comment !== undefined && body.comment !== null) {
      const err = validateStringLength(body.comment, 2000, 'comment');
      if (err) return res.status(400).json({ error: err });
    }
    const review = await Review.create({
      doctor_id: body.doctor_id,
      patient_id: body.patient_id || req.user.id,
      patient_name: body.patient_name || req.user.display_name,
      appointment_id: body.appointment_id || null,
      rating: body.rating,
      comment: body.comment || null,
      is_verified: !!body.is_verified,
      date: body.date || new Date().toISOString().slice(0, 10)
    });
    res.status(201).json({ ...review.toJSON(), created_date: review.created_at });
  } catch (error) {
    res.status(400).json({ error: sanitizeError(error) });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const review = await Review.findByPk(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    if (review.patient_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    // --- Server-side validation (updates) ---
    const upd = req.body || {};
    if (upd.rating !== undefined && upd.rating !== null && upd.rating !== '') {
      const ratingNum = Number(upd.rating);
      if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return res.status(400).json({ error: 'rating must be an integer between 1 and 5' });
      }
    }
    if (upd.comment !== undefined && upd.comment !== null) {
      const err = validateStringLength(upd.comment, 2000, 'comment');
      if (err) return res.status(400).json({ error: err });
    }
    await review.update(req.body);
    res.json({ ...review.toJSON(), created_date: review.created_at });
  } catch (error) {
    res.status(400).json({ error: sanitizeError(error) });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const review = await Review.findByPk(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    if (review.patient_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await review.destroy();
    res.json({ message: 'Review deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
