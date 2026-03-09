const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const { sendNewLeadEmail } = require('../services/emailService');

// GET /api/leads
router.get('/', async (req, res) => {
  try {
    const { type, stage, search, owner, priority, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (type) filter.type = type;
    if (stage) filter.stage = stage;
    if (owner) filter.owner = owner;
    if (priority) filter.priority = priority;
    if (search) {
      filter.$or = [
        { org_name: { $regex: search, $options: 'i' } },
        { contact_name: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [leads, total] = await Promise.all([
      Lead.find(filter).sort({ ai_score: -1, created_at: -1 }).skip(skip).limit(parseInt(limit)),
      Lead.countDocuments(filter),
    ]);

    res.json({ leads, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/leads/:id
router.get('/:id', async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json(lead);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/leads
router.post('/', async (req, res) => {
  try {
    const lead = new Lead(req.body);
    await lead.save();
    await Activity.create({
      lead_id: lead._id,
      type: 'lead_created',
      description: `Lead created: ${lead.org_name}`,
      created_by: req.body.owner || 'S',
    });
    res.status(201).json(lead);
    // Fire-and-forget email (after response sent)
    sendNewLeadEmail(lead).catch(console.error);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/leads/:id
router.patch('/:id', async (req, res) => {
  try {
    const old = await Lead.findById(req.params.id);
    const lead = await Lead.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    // Log stage change
    if (req.body.stage && old && req.body.stage !== old.stage) {
      await Activity.create({
        lead_id: lead._id,
        type: 'stage_change',
        description: `Stage changed from ${old.stage} → ${req.body.stage}`,
        created_by: req.body.updated_by || 'S',
      });
    }

    res.json(lead);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/leads/:id
router.delete('/:id', async (req, res) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json({ message: 'Lead deleted', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/leads/:id/activities
router.get('/:id/activities', async (req, res) => {
  try {
    const activities = await Activity.find({ lead_id: req.params.id }).sort({ created_at: -1 }).limit(30);
    res.json(activities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
