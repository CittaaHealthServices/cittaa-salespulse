const express = require('express');
const router = express.Router();
const LeadQueue = require('../models/LeadQueue');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const DiscoveryLog = require('../models/DiscoveryLog');
const { runDiscovery } = require('../jobs/leadDiscovery');
const { sendLeadApprovedEmail } = require('../services/emailService');

// GET /api/radar/queue
router.get('/queue', async (req, res) => {
  try {
    const { status = 'pending', page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [items, total] = await Promise.all([
      LeadQueue.find({ status }).sort({ ai_score: -1, discovered_at: -1 }).skip(skip).limit(parseInt(limit)),
      LeadQueue.countDocuments({ status }),
    ]);
    res.json({ items, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/radar/approve/:id
router.post('/approve/:id', async (req, res) => {
  try {
    const queued = await LeadQueue.findById(req.params.id);
    if (!queued) return res.status(404).json({ error: 'Not found' });
    if (queued.status !== 'pending') return res.status(400).json({ error: 'Already reviewed' });

    // Create lead in main collection
    const lead = await Lead.create({
      type: queued.type,
      org_name: queued.org_name,
      contact_name: queued.contact_name,
      role: queued.role,
      city: queued.city,
      state: queued.state,
      email: queued.email,
      phone: queued.phone,
      employees_or_students: queued.employees_or_students,
      contract_value: queued.estimated_value,
      ai_score: queued.ai_score,
      priority: queued.ai_score >= 70 ? 'high' : queued.ai_score >= 45 ? 'medium' : 'low',
      source: 'auto_discovered',
      discovery_source: 'google_search',
      notes: `AI Reasoning: ${queued.ai_reasoning}\nSource: ${queued.source_url || ''}`,
      stage: 'New',
    });

    // Mark queue item as approved
    await LeadQueue.findByIdAndUpdate(req.params.id, {
      status: 'approved',
      reviewed_by: req.body.reviewed_by || 'S',
      reviewed_at: new Date(),
    });

    await Activity.create({
      lead_id: lead._id,
      type: 'lead_discovered',
      description: `Auto-discovered and approved: ${lead.org_name} from Lead Radar`,
      created_by: req.body.reviewed_by || 'S',
    });

    res.json({ lead, message: 'Approved and added to Lead Hub' });
    // Fire-and-forget email notification
    sendLeadApprovedEmail(lead, req.body.reviewed_by || 'S').catch(console.error);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/radar/reject/:id
router.post('/reject/:id', async (req, res) => {
  try {
    const item = await LeadQueue.findByIdAndUpdate(
      req.params.id,
      { status: 'rejected', reviewed_by: req.body.reviewed_by || 'S', reviewed_at: new Date() },
      { new: true }
    );
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Rejected', item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/radar/logs
router.get('/logs', async (req, res) => {
  try {
    const logs = await DiscoveryLog.find().sort({ run_at: -1 }).limit(20);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/radar/run-now
router.post('/run-now', async (req, res) => {
  try {
    res.json({ message: 'Discovery job triggered — check logs in ~2 minutes' });
    // Run async after response
    runDiscovery().catch(console.error);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/radar/stats
router.get('/stats', async (req, res) => {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [pending, approvedThisWeek, rejectedThisWeek, lastLog] = await Promise.all([
      LeadQueue.countDocuments({ status: 'pending' }),
      LeadQueue.countDocuments({ status: 'approved', reviewed_at: { $gte: weekAgo } }),
      LeadQueue.countDocuments({ status: 'rejected', reviewed_at: { $gte: weekAgo } }),
      DiscoveryLog.findOne().sort({ run_at: -1 }),
    ]);
    res.json({ pending, approvedThisWeek, rejectedThisWeek, lastRun: lastLog?.run_at || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
