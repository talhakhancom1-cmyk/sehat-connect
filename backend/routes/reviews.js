const express = require('express');
const { Review } = require('../models');
const { authenticate } = require('../middleware/auth');
const { parseSort } = require('../lib/parseSort');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const where = {};
    if (req.query.doctor_id) where.doctor_id = req.query.doctor_id;
    if (req.query.patient_id) where.patient_id = req.query.patient_id;
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
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const review = await Review.findByPk(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    if (review.patient_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await review.update(req.body);
    res.json({ ...review.toJSON(), created_date: review.created_at });
  } catch (error) {
    res.status(400).json({ error: error.message });
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
