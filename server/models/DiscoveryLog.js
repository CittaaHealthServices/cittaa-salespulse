const mongoose = require('mongoose');

const discoveryLogSchema = new mongoose.Schema({
  run_at: { type: Date, default: Date.now },
  queries_run: [{ type: String }],
  leads_found: { type: Number, default: 0 },
  leads_added_to_queue: { type: Number, default: 0 },
  duplicates_skipped: { type: Number, default: 0 },
  status: { type: String, enum: ['success', 'failed', 'running'], default: 'running' },
  error: { type: String, default: null },
  duration_seconds: { type: Number },
});

module.exports = mongoose.model('DiscoveryLog', discoveryLogSchema);
