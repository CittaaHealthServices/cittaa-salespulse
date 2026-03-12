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
    res.json({ ok: true, message: 'Discovery scan started — new leads will appear shortly' });

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
// POST /api/radar/test-save
// Saves a dummy lead to the queue — tests if DB writes work at all
// ─────────────────────────────────────────────────────────────────────────
router.post('/test-save', async (req, res) => {
  try {
    const dummy = {
      org_name:             `Test School ${Date.now()}`,
      type:                 'school',
      city:                 'Hyderabad',
      state:                'Telangana',
      notes:                'Diagnostic test save',
      ai_score:             75,
      source_url:           '',
      target_role:          'Principal',
      job_title_hiring_for: 'School Counsellor',
      discovery_source:     'test',
      discovery_query:      'test query',
      status:               'pending',
    };

    const doc = await LeadQueue().create(dummy);
    res.json({ ok: true, saved: true, id: doc._id, message: 'DB write works correctly' });
  } catch (err) {
    res.status(500).json({ ok: false, saved: false, error: err.message, details: err.errors });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /api/radar/debug-scan
// Runs ONE Gemini query and returns raw output — diagnoses AI pipeline
// ─────────────────────────────────────────────────────────────────────────
router.get('/debug-scan', async (req, res) => {
  const log = [];
  try {
    // 1. Check env
    const geminiKey = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY);
    const mongoKey  = !!(process.env.MONGO_URI || process.env.MONGODB_URI);
    log.push({ step: 'env', gemini_key: geminiKey, mongo_key: mongoKey });

    if (!geminiKey) {
      return res.json({ ok: false, log, error: 'GEMINI_API_KEY not set' });
    }

    // 2. Init Gemini (new @google/genai SDK)
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: key });
    log.push({ step: 'gemini_init', ok: true });

    // 3. Run grounded search
    const testQuery = 'schools in Hyderabad India hiring school counsellor 2025';
    const searchResp = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `Find schools in Hyderabad India hiring counsellors. Search: "${testQuery}". List school names, locations, job URLs.`,
      config: { tools: [{ googleSearch: {} }] },
    });
    const narrative = searchResp.text || '';
    log.push({ step: 'search', chars: narrative.length, preview: narrative.substring(0, 400) });

    if (narrative.length < 50) {
      return res.json({ ok: false, log, error: 'Gemini returned empty search results' });
    }

    // 4. Extract JSON
    const extractResp = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `From this text, extract school names as JSON array: [{"org_name":"...", "city":"...", "job_title_hiring_for":"..."}]\n\nText:\n${narrative}\n\nReturn ONLY the JSON array.`,
    });
    const rawJson = (extractResp.text || '').trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    log.push({ step: 'extract', raw_preview: rawJson.substring(0, 400) });

    let leads = [];
    try { leads = JSON.parse(rawJson); } catch (e) {
      log.push({ step: 'parse', error: e.message });
    }
    log.push({ step: 'leads_found', count: Array.isArray(leads) ? leads.length : 0, leads });

    // 5. Try saving first lead
    if (Array.isArray(leads) && leads.length > 0) {
      try {
        const doc = await LeadQueue().create({
          org_name:             leads[0].org_name || 'Debug Test Org',
          type:                 'school',
          city:                 leads[0].city || '',
          state:                '',
          notes:                'Debug scan test',
          ai_score:             70,
          source_url:           leads[0].source_url || '',
          target_role:          'Principal',
          job_title_hiring_for: leads[0].job_title_hiring_for || 'School Counsellor',
          discovery_source:     'debug scan',
          discovery_query:      testQuery,
          status:               'pending',
        });
        log.push({ step: 'db_save', ok: true, id: doc._id });
      } catch (saveErr) {
        log.push({ step: 'db_save', ok: false, error: saveErr.message, details: saveErr.errors });
      }
    }

    res.json({ ok: true, log });
  } catch (err) {
    log.push({ step: 'fatal_error', error: err.message, stack: err.stack?.split('\n').slice(0,5) });
    res.status(500).json({ ok: false, log, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// POST /api/radar/approve/:id
// ─────────────────────────────────────────────────────────────────────────
router.post('/approve/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { owner = 'S', approver_name = 'Team', contract_value } = req.body;

    const item = await LeadQueue().findById(id).lean();
    if (!item) return res.status(404).json({ error: 'Lead not found in queue' });

    const existing = await Lead().findOne({
      org_name: { $regex: new RegExp(`^${item.org_name.trim()}$`, 'i') },
    });
    if (existing) {
      await LeadQueue().findByIdAndUpdate(id, { status: 'rejected', reject_reason: 'Duplicate' });
      return res.status(409).json({ error: 'Duplicate — this org is already in your pipeline' });
    }

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
      target_role:          item.target_role     || '',
      source_url:           item.source_url      || '',
      discovery_query:      item.discovery_query || '',
      job_title_hiring_for: item.job_title_hiring_for || '',
      discovery_source:     'google_search',
    };

    const lead = await Lead().create(leadData);
    await LeadQueue().findByIdAndUpdate(id, { status: 'approved', lead_id: lead._id });

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
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// DELETE /api/radar/:id
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
