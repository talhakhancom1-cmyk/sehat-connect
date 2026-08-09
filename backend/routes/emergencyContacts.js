const express = require('express');
const { EmergencyContact } = require('../models');
const { authenticate } = require('../middleware/auth');
const { parseSort } = require('../lib/parseSort');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const contacts = await EmergencyContact.findAll({
      where: { user_id: req.user.id },
      order: parseSort(req.query, ['created_at', 'updated_at'], 'created_at', 'DESC'),
      limit: 50
    });
    const result = contacts.map(c => ({ ...c.toJSON(), created_date: c.created_at }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name || !body.phone) {
      return res.status(400).json({ error: 'name and phone are required' });
    }
    const contact = await EmergencyContact.create({
      user_id: req.user.id,
      name: body.name,
      relation: body.relation || null,
      phone: body.phone
    });
    res.status(201).json({ ...contact.toJSON(), created_date: contact.created_at });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const contact = await EmergencyContact.findByPk(req.params.id);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    if (contact.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    await contact.update(req.body);
    res.json({ ...contact.toJSON(), created_date: contact.created_at });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const contact = await EmergencyContact.findByPk(req.params.id);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    if (contact.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    await contact.destroy();
    res.json({ message: 'Contact deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
