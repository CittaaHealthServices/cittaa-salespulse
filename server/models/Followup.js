const mongoose = require('mongoose');

const followupSchema = new mongoose.Schema({
  lead_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  action: { type: String, required: true },
  channel: { type: String, enum: ['Email', 'WhatsApp', 'LinkedIn', 'Call', 'Visit'], default: 'Email' },
  due_date: { type: Date, required: true },
  owner: { type: String, enum: ['S', 'A'], default: 'S' },
  status: { type: String, enum: ['pending', 'completed', 'snoozed', 'cancelled'], default: 'pending' },
  notes: { type: String, default: '' },
  created_at: { type: Date, default: Date.now },
  completed_at: { type: Date },
  snoozed_until: { type: Date },
});

module.exports = mongoose.model('Followup', followupSchema);
