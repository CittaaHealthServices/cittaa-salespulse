require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const { startCronJobs } = require('./jobs/leadDiscovery');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/leads', require('./routes/leads'));
app.use('/api/pipeline', require('./routes/pipeline'));
app.use('/api/followups', require('./routes/followups'));
app.use('/api/compose', require('./routes/compose'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/radar', require('./routes/radar'));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Cittaa SalesPulse',
    version: '2.0.0',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// ─── Serve React frontend in production ───────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientDist, 'index.html'));
    }
  });
}

// ─── MongoDB + Start ──────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI, {
    dbName: 'cittaa_salespulse',
  })
  .then(() => {
    console.log('✅ MongoDB connected — cittaa_salespulse');
    app.listen(PORT, () => {
      console.log(`🚀 Cittaa SalesPulse server on port ${PORT}`);
      // Start background lead discovery cron
      startCronJobs();
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });

module.exports = app;
