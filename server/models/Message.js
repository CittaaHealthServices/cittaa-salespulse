const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  lead_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  channel: { type: String, enum: ['Email', 'WhatsApp', 'LinkedIn', 'Proposal'], required: true },
  content: { type: String, required: true },
  subject: { type: String },
  ai_generated: { type: Boolean, default: true },
  created_by: { type: String, enum: ['S', 'A'], default: 'S' },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Message', messageSchema);
