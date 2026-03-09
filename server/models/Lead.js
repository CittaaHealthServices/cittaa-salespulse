const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  type: { type: String, enum: ['school', 'corporate', 'clinic', 'ngo', 'rehab', 'coaching'], required: true },
  org_name: { type: String, required: true, trim: true },
  contact_name: { type: String, trim: true },
  role: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  linkedin_url: { type: String, trim: true },
  employees_or_students: { type: Number },
  stage: {
    type: String,
    enum: ['New', 'Contacted', 'Proposal Sent', 'Negotiation', 'Won', 'Lost'],
    default: 'New',
  },
  contract_value: { type: Number, default: 0 },
  ai_score: { type: Number, min: 0, max: 100, default: 50 },
  priority: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
  owner: { type: String, enum: ['S', 'A', 'P'], default: 'S' },
  source: { type: String, enum: ['manual', 'auto_discovered', 'imported'], default: 'manual' },
  discovery_source: {
    type: String,
    enum: ['google_search', 'linkedin', 'news', 'referral', null],
    default: null,
  },
  notes: { type: String, default: '' },
  tags: [{ type: String }],
  last_contact_at: { type: Date },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

leadSchema.pre('save', function (next) {
  this.updated_at = new Date();
  next();
});

leadSchema.pre('findOneAndUpdate', function (next) {
  this.set({ updated_at: new Date() });
  next();
});

// Text index for search
leadSchema.index({ org_name: 'text', contact_name: 'text', city: 'text' });

module.exports = mongoose.model('Lead', leadSchema);
