const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  lead_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  type: { type: String, required: true }, // e.g. 'stage_change', 'note_added', 'message_sent', 'lead_discovered'
  description: { type: String, required: true },
  created_by: { type: String, enum: ['S', 'A', 'system'], default: 'system' },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Activity', activitySchema);
