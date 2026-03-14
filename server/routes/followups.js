const express = require('express');
const router = express.Router();
const Followup = require('../models/Followup');
const Activity = require('../models/Activity');
const Lead = require('../models/Lead');
const { sendFollowupScheduledEmail } = require('../services/emailService');
const { createFollowupEvent } = require('../services/calendarService');

// GET /api/followups
router.get('/', async (req, res) => {
  try {
    const { owner, status, lead_id } = req.query;
    const filter = {};
    if (owner) filter.owner = owner;
    if (status) filter.status = status;
    if (lead_id) filter.lead_id = lead_id;

    const followups = await Followup.find(filter)
      .populate('lead_id', 'org_name type city contact_name stage')
      .sort({ due_date: 1 });

    res.json(followups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/followups
router.post('/', async (req, res) => {
  try {
    const followup = new Followup(req.body);
    await followup.save();
    await Activity.create({
      lead_id: req.body.lead_id,
      type: 'followup_scheduled',
      description: `Follow-up scheduled: ${req.body.action} via ${req.body.channel}`,
      created_by: req.body.owner || 'S',
    });
    const populated = await Followup.findById(followup._id).populate('lead_id', 'org_name type city contact_name phone');
    res.status(201).json(populated);
    // Fire-and-forget: email + Google Calendar (both non-blocking)
    sendFollowupScheduledEmail(followup, populated.lead_id).catch(console.error);
    createFollowupEvent(followup, populated.lead_id).catch(console.error);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/followups/:id/complete
router.patch('/:id/complete', async (req, res) => {
  try {
    const followup = await Followup.findByIdAndUpdate(
      req.params.id,
      { status: 'completed', completed_at: new Date() },
      { new: true }
    ).populate('lead_id', 'org_name');
    if (!followup) return res.status(404).json({ error: 'Not found' });
    await Activity.create({
      lead_id: followup.lead_id?._id,
      type: 'followup_completed',
      description: `Follow-up completed: ${followup.action}`,
      created_by: req.body.completed_by || 'S',
    });
    res.json(followup);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/followups/:id/snooze
router.patch('/:id/snooze', async (req, res) => {
  try {
    const { hours = 24 } = req.body;
    const snoozeUntil = new Date(Date.now() + hours * 60 * 60 * 1000);
    const followup = await Followup.findByIdAndUpdate(
      req.params.id,
      { status: 'snoozed', snoozed_until: snoozeUntil, due_date: snoozeUntil },
      { new: true }
    );
    if (!followup) return res.status(404).json({ error: 'Not found' });
    res.json(followup);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/followups/:id
router.delete('/:id', async (req, res) => {
  try {
    await Followup.findByIdAndUpdate(req.params.id, { status: 'cancelled' });
    res.json({ message: 'Cancelled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
