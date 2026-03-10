// ─────────────────────────────────────────────────────────────────────────
// Cittaa SalesPulse — Express server entry point (safe startup version)
//
// Design principles:
//  1. /api/health is registered FIRST so Railway's healthcheck always passes
//  2. Every optional service (calendar, email, reminder, discovery) is
//     wrapped in try-catch — a missing env var won't crash the server
//  3. MongoDB connection failures are logged but don't stop the process
// ─────────────────────────────────────────────────────────────────────────

require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const mongoose = require('mongoose');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 5001;

// ── middleware ────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ── HEALTH CHECK — must be first so Railway sees it immediately ───────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'cittaa-salespulse',
    ts: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// ── routes ────────────────────────────────────────────────────────────────
try { app.use('/api/leads',    require('./routes/leads'));    } catch (e) { console.error('[Routes] leads:',    e.message); }
try { app.use('/api/radar',    require('./routes/radar'));    } catch (e) { console.error('[Routes] radar:',    e.message); }
try { app.use('/api/pipeline', require('./routes/pipeline')); } catch (e) { console.error('[Routes] pipeline:', e.message); }
try { app.use('/api/stats',    require('./routes/stats'));    } catch (e) { console.error('[Routes] stats:',    e.message); }
try { app.use('/api/followups',require('./routes/followups')); } catch (e) { console.error('[Routes] followups:',e.message); }
try { app.use('/api/compose',  require('./routes/compose'));  } catch (e) { console.error('[Routes] compose:',  e.message); }

// ── Serve React frontend (built by Railway during deploy) ────────────────
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

// React Router catch-all — any non-API route serves index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// ── 404 fallback (API routes only — won't reach here for frontend) ────────
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// ── global error handler ──────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err.message);
  res.status(500).json({ error: err.message });
});

// ── start HTTP server immediately (before DB) so healthcheck passes ───────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Cittaa SalesPulse listening on port ${PORT}`);

  // ── MongoDB ─────────────────────────────────────────────────────────────
  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (MONGO_URI) {
    mongoose
      .connect(MONGO_URI)
      .then(() => console.log('[DB] MongoDB connected'))
      .catch(e  => console.error('[DB] MongoDB connection failed:', e.message));
  } else {
    console.warn('[DB] No MONGO_URI — running without database');
  }

  // ── Reminder engine ──────────────────────────────────────────────────────
  try {
    const { start } = require('./jobs/reminderEngine');
    start();
    console.log('[Server] Reminder engine started');
  } catch (e) {
    console.warn('[Server] Reminder engine skipped:', e.message);
  }

  // ── Lead discovery scheduler ─────────────────────────────────────────────
  try {
    const { startDiscoveryJobs } = require('./jobs/leadDiscovery');
    startDiscoveryJobs();
    console.log('[Server] Discovery jobs started');
  } catch (e) {
    console.warn('[Server] Discovery jobs skipped:', e.message);
  }
});
