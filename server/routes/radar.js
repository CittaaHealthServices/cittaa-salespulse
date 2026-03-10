// routes/radar.js — Lead Radar (job posting signals from Naukri / LinkedIn etc.)
const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');

// ── lazy model loaders (safe if DB not yet connected) ─────────────────────
function LeadQueue() { return require('../models/LeadQueue'); }
function Lead()      { return require('../models/Lead'); }

// ─────────────────────────────────────────────────────────────────────────
// GET /api/radar
// List pending leads from the discovery queue
// ─────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status = 'pending', limit = 50, page = 1 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const items = await LeadQueue().find({ status })
      .sort({ ai_score: -1, created_at: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await LeadQueue().countDocuments({ status });

    res.json({ items, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[Radar] GET / error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// POST /api/radar/trigger
// Manually kick off a discovery scan (runs a subset of queries)
// ─────────────────────────────────────────────────────────────────────────
router.post('/trigger', async (req, res) => {
  try {
    // Respond immediately so the UI doesn't timeout
    res.json({ ok: true, message: 'Discovery scan started — new leads will appear shortly' });

    // Run scan in background
    setImmediate(async () => {
      try {
        const { runTestDiscovery } = require('../jobs/leadDiscovery');
        await runTestDiscovery();
        console.log('[Radar] Manual scan completed');
      } catch (e) {
        console.error('[Radar] Manual scan error:', e.message);
      }
    });
  } catch (err) {
    console.error('[Radar] POST /trigger error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// POST /api/radar/approve/:id
// Approve a queued lead → create Lead document + send notification
// ─────────────────────────────────────────────────────────────────────────
router.post('/approve/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { owner = 'S', approver_name = 'Team', contract_value } = req.body;

    const item = await LeadQueue().findById(id).lean();
    if (!item) return res.status(404).json({ error: 'Lead not found in queue' });

    // Check for duplicate
    const existing = await Lead().findOne({
      org_name: { $regex: new RegExp(`^${item.org_name.trim()}$`, 'i') },
    });
    if (existing) {
      await LeadQueue().findByIdAndUpdate(id, { status: 'rejected', reject_reason: 'Duplicate' });
      return res.status(409).json({ error: 'Duplicate — this org is already in your pipeline' });
    }

    // Create Lead
    const leadData = {
      org_name:             item.org_name,
      type:                 item.type            || 'corporate',
      city:                 item.city            || '',
      state:                item.state           || '',
      contact_name:         item.contact_name    || '',
      role:                 item.role            || item.target_role || '',
      email:                item.email           || '',
      phone:                item.phone           || '',
      notes:                item.notes           || '',
      ai_score:             item.ai_score        || 50,
      employees_or_students:item.employees_or_students || 0,
      contract_value:       contract_value || item.contract_value || 0,
      stage:                'New',
      owner,
      // job-posting signal fields
      target_role:          item.target_role     || '',
      source_url:           item.source_url      || '',
      discovery_query:      item.discovery_query || '',
      job_title_hiring_for: item.job_title_hiring_for || '',
      discovery_source:     'google_search',
    };

    const lead = await Lead().create(leadData);

    // Mark queue item as approved
    await LeadQueue().findByIdAndUpdate(id, { status: 'approved', lead_id: lead._id });

    // Background: send email + create calendar event
    setImmediate(async () => {
      try {
        const { sendLeadApprovedEmail } = require('../services/emailService');
        await sendLeadApprovedEmail(lead, approver_name);
      } catch (e) { console.warn('[Radar] Email error:', e.message); }

      try {
        const { createLeadApprovedEvent } = require('../services/calendarService');
        await createLeadApprovedEvent(lead);
      } catch (e) { console.warn('[Radar] Calendar error:', e.message); }
    });

    res.json({ ok: true, lead });
  } catch (err) {
    console.error('[Radar] POST /approve error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// POST /api/radar/reject/:id
// Reject / skip a queued lead
// ─────────────────────────────────────────────────────────────────────────
router.post('/reject/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = '' } = req.body;

    const item = await LeadQueue().findByIdAndUpdate(
      id,
      { status: 'rejected', reject_reason: reason },
      { new: true }
    );
    if (!item) return res.status(404).json({ error: 'Lead not found' });

    res.json({ ok: true });
  } catch (err) {
    console.error('[Radar] POST /reject error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// DELETE /api/radar/:id
// Hard-delete a queue item
// ─────────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await LeadQueue().findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /api/radar/stats
// Queue statistics
// ─────────────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [pending, approved, rejected] = await Promise.all([
      LeadQueue().countDocuments({ status: 'pending' }),
      LeadQueue().countDocuments({ status: 'approved' }),
      LeadQueue().countDocuments({ status: 'rejected' }),
    ]);
    res.json({ pending, approved, rejected, total: pending + approved + rejected });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
