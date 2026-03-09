const mongoose = require('mongoose');

const leadQueueSchema = new mongoose.Schema({
  type: { type: String, enum: ['school', 'corporate', 'clinic', 'ngo', 'rehab', 'coaching'], required: true },
  org_name: { type: String, required: true, trim: true },
  contact_name: { type: String, trim: true },
  role: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  employees_or_students: { type: Number },
  estimated_value: { type: Number, default: 0 },
  ai_score: { type: Number, min: 0, max: 100, default: 50 },
  ai_reasoning: { type: String },
  discovery_source: { type: String },
  discovery_query: { type: String },
  source_url: { type: String },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  reviewed_by: { type: String, enum: ['S', 'A', null], default: null },
  discovered_at: { type: Date, default: Date.now },
  reviewed_at: { type: Date },
});

module.exports = mongoose.model('LeadQueue', leadQueueSchema);
