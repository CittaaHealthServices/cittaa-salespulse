// routes/healthcheck.js — Detailed system health for the SalesPulse dashboard
// Mounted at /api/healthcheck  (separate from the simple /api/health)

const express  = require('express');
const router   = express.Router();

// ─────────────────────────────────────────────────────────────────────────
// GET /api/healthcheck
// Returns full system status — DB, env vars, queue counts, last scan time
// ─────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const startTime = Date.now();

  const result = {
    timestamp:   new Date().toISOString(),
    uptime_secs: Math.floor(process.uptime()),
    env: {},
    database: { connected: false, leads: 0, queue: { pending: 0, approved: 0, rejected: 0 } },
    discovery: { gemini: false, queries: 0, platforms: [], last_error: null },
    latency_ms: 0,
  };

  // ── 1. Env var presence (no values exposed) ──────────────────────────
  result.env = {
    GEMINI_API_KEY:   !!(process.env.GEMINI_API_KEY   || process.env.GOOGLE_AI_API_KEY),
    MONGO_URI:        !!(process.env.MONGO_URI         || process.env.MONGODB_URI),
    RESEND_API_KEY:   !!process.env.RESEND_API_KEY,
    GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
    NODE_ENV:         process.env.NODE_ENV || 'development',
    PORT:             process.env.PORT     || 4000,
  };

  // ── 2. MongoDB + document counts ─────────────────────────────────────
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      result.database.connected = true;
      try {
        const LeadQueue = require('../models/LeadQueue');
        const Lead      = require('../models/Lead');
        const [p, a, r, total] = await Promise.all([
          LeadQueue.countDocuments({ status: 'pending'  }),
          LeadQueue.countDocuments({ status: 'approved' }),
          LeadQueue.countDocuments({ status: 'rejected' }),
          Lead.countDocuments(),
        ]);
        result.database.queue   = { pending: p, approved: a, rejected: r };
        result.database.leads   = total;
      } catch (e) {
        result.database.count_error = e.message;
      }
    } else {
      result.database.ready_state = mongoose.connection.readyState;
    }
  } catch (e) {
    result.database.error = e.message;
  }

  // ── 3. Discovery / Gemini ─────────────────────────────────────────────
  try {
    const ld = require('../jobs/leadDiscovery');
    const qs = ld.QUERIES || [];
    result.discovery.queries   = qs.length;
    result.discovery.platforms = [...new Set(qs.map(q => q.platform))];
    result.discovery.gemini    = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY);
  } catch (e) {
    result.discovery.last_error = e.message;
  }

  // ── 4. Last discovery run (from DiscoveryLog if available) ───────────
  try {
    const DL = require('../models/DiscoveryLog');
    if (mongoose.connection.readyState === 1) {
      const last = await DL.findOne().sort({ created_at: -1 }).lean();
      if (last) result.discovery.last_run = last.created_at || last._id.getTimestamp();
    }
  } catch (_) {}   // DiscoveryLog is optional

  result.latency_ms = Date.now() - startTime;
  result.ok = result.database.connected && result.env.GEMINI_API_KEY && result.env.MONGO_URI;

  res.json(result);
});

module.exports = router;
