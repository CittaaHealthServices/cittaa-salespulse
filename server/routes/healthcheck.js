// routes/healthcheck.js — Full system health API for the dashboard
const express = require('express');
const router  = express.Router();

router.get('/', async (req, res) => {
  const startTime = Date.now();

  const result = {
    timestamp:   new Date().toISOString(),
    uptime_secs: Math.floor(process.uptime()),
    env: {},
    database: { connected: false, leads: 0, queue: { pending: 0, approved: 0, rejected: 0 } },
    discovery: { gemini: false, queries: 0, platforms: [], last_run: null, last_leads_found: 0 },
    services:  { email: false, calendar: false },
    monitor:   { component_status: {}, recent_errors: [] },
    latency_ms: 0,
    ok: false,
  };

  // ── Env vars ────────────────────────────────────────────────────────────
  result.env = {
    GEMINI_API_KEY:   !!(process.env.GEMINI_API_KEY   || process.env.GOOGLE_AI_API_KEY),
    MONGO_URI:        !!(process.env.MONGO_URI         || process.env.MONGODB_URI),
    RESEND_API_KEY:   !!process.env.RESEND_API_KEY,
    GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
    NODE_ENV:         process.env.NODE_ENV || 'development',
    PORT:             process.env.PORT     || 4000,
  };

  // ── MongoDB ──────────────────────────────────────────────────────────────
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      result.database.connected = true;
      try {
        const LeadQueue = require('../models/LeadQueue');
        const Lead      = require('../models/Lead');
        const [p, a, r, total] = await Promise.all([
          LeadQueue.countDocuments({ status: 'pending' }),
          LeadQueue.countDocuments({ status: 'approved' }),
          LeadQueue.countDocuments({ status: 'rejected' }),
          Lead.countDocuments(),
        ]);
        result.database.queue = { pending: p, approved: a, rejected: r };
        result.database.leads = total;
      } catch(e) { result.database.count_error = e.message; }
    } else {
      result.database.ready_state = mongoose.connection.readyState;
    }
  } catch(e) { result.database.error = e.message; }

  // ── Discovery / Gemini ──────────────────────────────────────────────────
  try {
    const ld = require('../jobs/leadDiscovery');
    const qs = ld.QUERIES || [];
    result.discovery.queries   = qs.length;
    result.discovery.platforms = [...new Set(qs.map(q => q.platform))];
    result.discovery.gemini    = result.env.GEMINI_API_KEY;
  } catch(e) { result.discovery.load_error = e.message; }

  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      const DL   = require('../models/DiscoveryLog');
      const last = await DL.findOne().sort({ ran_at: -1 }).lean();
      if (last) {
        result.discovery.last_run         = last.ran_at;
        result.discovery.last_leads_found = last.leads_found || 0;
        result.discovery.hours_since_scan = Math.round((Date.now() - new Date(last.ran_at)) / 3600000);
      }
    }
  } catch(_) {}

  // ── Services ────────────────────────────────────────────────────────────
  result.services.email    = result.env.RESEND_API_KEY;
  result.services.calendar = result.env.GOOGLE_CLIENT_ID;

  // ── Health monitor (component states + error log) ──────────────────────
  try {
    const hm = require('../jobs/healthMonitor');
    result.monitor.component_status = hm.getCurrentStatus();
    result.monitor.recent_errors    = hm.getErrorLog();
  } catch(_) {}

  result.latency_ms = Date.now() - startTime;
  result.ok = result.database.connected && result.env.GEMINI_API_KEY && result.env.MONGO_URI;

  res.json(result);
});

module.exports = router;
