const express = require('express');
const ReminderPreference = require('../models/ReminderPreference');
const { authenticate } = require('../middleware/auth');
const { sanitizeError } = require('../lib/validate');

const router = express.Router();

// GET /api/reminder-preferences — get the current user's reminder preferences
router.get('/', authenticate, async (req, res) => {
  try {
    let pref = await ReminderPreference.findOne({ where: { patient_id: req.user.id } });
    if (!pref) {
      pref = await ReminderPreference.create({ patient_id: req.user.id });
    }
    res.json(pref);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// PUT /api/reminder-preferences — update reminder preferences
router.put('/', authenticate, async (req, res) => {
  try {
    const { reminders_enabled, reminder_times } = req.body;
    let pref = await ReminderPreference.findOne({ where: { patient_id: req.user.id } });
    if (!pref) {
      pref = await ReminderPreference.create({ patient_id: req.user.id });
    }
    const updates = {};
    if (typeof reminders_enabled === 'boolean') updates.reminders_enabled = reminders_enabled;
    if (reminder_times && typeof reminder_times === 'object') {
      // Validate time format HH:MM
      for (const [key, value] of Object.entries(reminder_times)) {
        if (value && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
          return res.status(400).json({ error: `Invalid time format for ${key}. Use HH:MM 24h format.` });
        }
      }
      updates.reminder_times = { ...pref.reminder_times, ...reminder_times };
    }
    await pref.update(updates);
    res.json(pref);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

module.exports = router;
