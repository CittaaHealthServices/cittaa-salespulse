// server/index.js — Cittaa SalesPulse API Server
// Safe startup: port binds first, MongoDB + jobs connect after

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 4000;

// ─── Middleware ────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Health (MUST be first — Railway checks this before anything else) ─────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), ts: new Date().toISOString() });
});

// ─── Detailed healthcheck (for the health dashboard) ─────────────────────
try {
  app.use('/api/healthcheck', require('./routes/healthcheck'));
} catch (e) {
  console.warn('[Startup] healthcheck route failed to load:', e.message);
}

// ─── API routes ────────────────────────────────────────────────────────────
const routeMap = [
  ['/api/radar',     './routes/radar'],
  ['/api/leads',     './routes/leads'],
  ['/api/pipeline',  './routes/pipeline'],
  ['/api/stats',     './routes/stats'],
  ['/api/followups', './routes/followups'],
  ['/api/compose',   './routes/compose'],
];

for (const [mountPath, file] of routeMap) {
  try {
    app.use(mountPath, require(file));
  } catch (e) {
    console.warn(`[Startup] Route ${mountPath} failed to load:`, e.message);
  }
}

// ─── Serve React SPA ───────────────────────────────────────────────────────
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// ─── Start server first (Railway healthcheck needs this ASAP) ─────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] ✅ Listening on port ${PORT}`);

  // Connect MongoDB after port is bound
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.warn('[MongoDB] ⚠️  No MONGO_URI — skipping DB connection');
  } else {
    require('mongoose')
      .connect(mongoUri)
      .then(() => {
        console.log('[MongoDB] ✅ Connected');

        // Start background jobs
        try {
          const { startDiscoveryJobs } = require('./jobs/leadDiscovery');
          if (typeof startDiscoveryJobs === 'function') startDiscoveryJobs();
        } catch (e) { console.warn('[Jobs] leadDiscovery failed:', e.message); }

        try {
          const { start } = require('./jobs/reminderEngine');
          if (typeof start === 'function') start();
        } catch (e) { console.warn('[Jobs] reminderEngine failed:', e.message); }
      })
      .catch(e => console.error('[MongoDB] ❌ Connection failed:', e.message));
  }
});
