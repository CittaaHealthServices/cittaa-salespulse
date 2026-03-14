const mongoose = require('mongoose');

const followupSchema = new mongoose.Schema({
  lead_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  channel:      { type: String, enum: ['call', 'email', 'visit', 'demo', 'other'], default: 'call' },
  scheduled_at: { type: Date, required: true },
  notes:        { type: String, default: '' },
  completed:    { type: Boolean, default: false },
  completed_at: { type: Date },
  outcome:      { type: String, default: '' },
  owner:        { type: String, enum: ['S', 'A', 'P'], default: 'S' },
  calendar_event_id: { type: String },
  created_at:   { type: Date, default: Date.now },
  updated_at:   { type: Date, default: Date.now },
});

followupSchema.pre('save', function (next) { this.updated_at = new Date(); next(); });
followupSchema.pre('findOneAndUpdate', function (next) { this.set({ updated_at: new Date() }); next(); });
followupSchema.index({ lead_id: 1, scheduled_at: 1 });
followupSchema.index({ scheduled_at: 1, completed: 1 });

module.exports = mongoose.model('Followup', followupSchema);
