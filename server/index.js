// server/index.js — Cittaa SalesPulse API Server
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// ─── Health (FIRST — Railway checks this before anything else) ─────────────
app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', uptime: process.uptime(), ts: new Date().toISOString() })
);

// ─── Routes ────────────────────────────────────────────────────────────────
const routes = [
  ['/api/healthcheck', './routes/healthcheck'],
  ['/api/radar',       './routes/radar'],
  ['/api/leads',       './routes/leads'],
  ['/api/pipeline',    './routes/pipeline'],
  ['/api/stats',       './routes/stats'],
  ['/api/followups',   './routes/followups'],
  ['/api/compose',     './routes/compose'],
];
for (const [mp, file] of routes) {
  try { app.use(mp, require(file)); }
  catch(e) { console.warn(`[Startup] ${mp} failed:`, e.message); }
}

// ─── React SPA ─────────────────────────────────────────────────────────────
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));

// ─── Unhandled error capture → alert email ─────────────────────────────────
process.on('uncaughtException', async (err) => {
  console.error('[Server] 💥 Uncaught exception:', err.message);
  try {
    const { sendAlert, logError } = require('./jobs/healthMonitor');
    if (logError) logError('unhandled_error', err.message, err.stack);
    await sendAlert('unhandled_error', { error: err.stack || err.message });
  } catch(_) {}
});
process.on('unhandledRejection', async (reason) => {
  const msg = (reason instanceof Error) ? reason.message : String(reason);
  console.error('[Server] 💥 Unhandled rejection:', msg);
  try {
    const { logError } = require('./jobs/healthMonitor');
    if (logError) logError('unhandled_error', msg, String(reason?.stack || reason));
  } catch(_) {}
});

// ─── Start ────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] ✅ Listening on port ${PORT}`);

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.warn('[MongoDB] ⚠️  No MONGO_URI — skipping');
    return;
  }

  require('mongoose').connect(mongoUri)
    .then(() => {
      console.log('[MongoDB] ✅ Connected');

      // Start jobs
      for (const [label, mod, fn] of [
        ['leadDiscovery',  './jobs/leadDiscovery',  'startDiscoveryJobs'],
        ['reminderEngine', './jobs/reminderEngine',  'start'],
        ['healthMonitor',  './jobs/healthMonitor',   'startHealthMonitor'],
      ]) {
        try {
          const m = require(mod);
          if (typeof m[fn] === 'function') m[fn]();
        } catch(e) { console.warn(`[Jobs] ${label} failed:`, e.message); }
      }
    })
    .catch(e => {
      console.error('[MongoDB] ❌ Failed:', e.message);
      // Alert on DB connect failure
      try { require('./services/alertService').sendAlert('mongodb', { error: e.message }); } catch(_) {}
    });
});
