const express = require('express');
const router = express.Router();
const LeadQueue = require('../models/LeadQueue');
const Lead = require('../models/Lead');
const { startDiscoveryJobs, runDiscovery, runTestDiscovery } = require('../jobs/leadDiscovery');
const { sendLeadApprovedEmail } = require('../services/emailService');
const { createLeadApprovedEvent } = require('../services/calendarService');

// GET /api/radar/queue
router.get('/queue', async (req, res) => {
  try {
    const { status = 'pending', page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [items, total] = await Promise.all([
      LeadQueue.find({ status }).sort({ ai_score: -1, discovered_at: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      LeadQueue.countDocuments({ status }),
    ]);
    res.json({ items, total, page: parseInt(page) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/radar/stats
router.get('/stats', async (req, res) => {
  try {
    const [pending, approved, rejected, total] = await Promise.all([
      LeadQueue.countDocuments({ status: 'pending' }),
      LeadQueue.countDocuments({ status: 'approved' }),
      LeadQueue.countDocuments({ status: 'rejected' }),
      LeadQueue.countDocuments({}),
    ]);
    const topScored = await LeadQueue.find({ status: 'pending' }).sort({ ai_score: -1 }).limit(3).select('org_name ai_score type').lean();
    res.json({ pending, approved, rejected, total, topScored });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/radar/approve/:id
router.post('/approve/:id', async (req, res) => {
  try {
    const { reviewer = 'S' } = req.body;
    const item = await LeadQueue.findByIdAndUpdate(
      req.params.id,
      { status: 'approved', reviewed_by: reviewer, reviewed_at: new Date() },
      { new: true }
    );
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const approverName = reviewer === 'S' ? 'Sairam' : reviewer === 'A' ? 'Abhijay' : reviewer === 'P' ? 'Pratya' : reviewer;

    // Promote to Lead collection, carrying over target_role and source info
    const lead = await Lead.create({
      org_name:              item.org_name,
      type:                  item.type,
      city:                  item.city,
      state:                 item.state,
      contact_name:          item.contact_name,
      role:                  item.role,
      target_role:           item.target_role,
      email:                 item.email,
      phone:                 item.phone,
      employees_or_students: item.employees_or_students,
      contract_value:        item.estimated_value,
      ai_score:              item.ai_score,
      source:                'auto_discovered',
      discovery_source:      'google_search',
      source_url:            item.source_url,
      discovery_query:       item.discovery_query,
      priority:              item.ai_score >= 70 ? 'high' : item.ai_score >= 45 ? 'medium' : 'low',
      notes:                 item.why_good_lead ? `AI Reasoning: ${item.why_good_lead}` : '',
      stage:                 'New',
      owner:                 reviewer,
    });

    // Fire-and-forget: email + calendar
    sendLeadApprovedEmail(lead, approverName).catch(e => console.error('[Radar] Email error:', e.message));
    createLeadApprovedEvent(lead).catch(e => console.error('[Radar] Calendar error:', e.message));

    res.json({ success: true, lead });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/radar/reject/:id
router.post('/reject/:id', async (req, res) => {
  try {
    const { reviewer = 'S' } = req.body;
    const item = await LeadQueue.findByIdAndUpdate(
      req.params.id,
      { status: 'rejected', reviewed_by: reviewer, reviewed_at: new Date() },
      { new: true }
    );
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/radar/trigger — manual trigger from UI
router.post('/trigger', async (req, res) => {
  try {
    res.json({ success: true, message: 'Discovery triggered' });
    // Run async after response
    const { batch } = req.body || {};
    setImmediate(() => runDiscovery(batch || undefined));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/radar/debug — run one test query and return raw output
router.get('/debug', async (req, res) => {
  try {
    const result = await runTestDiscovery();
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
