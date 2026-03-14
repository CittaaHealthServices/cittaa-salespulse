const mongoose = require('mongoose');

const leadQueueSchema = new mongoose.Schema({
  org_name:              { type: String, required: true, trim: true },
  type:                  { type: String, enum: ['school', 'corporate', 'clinic', 'ngo', 'rehab', 'coaching'], default: 'corporate' },
  city:                  { type: String, trim: true },
  state:                 { type: String, trim: true },
  contact_name:          { type: String, trim: true },
  role:                  { type: String, trim: true },            // contact's actual job title
  target_role:           { type: String, trim: true },            // decision-maker Cittaa should approach
  job_title_hiring_for:  { type: String, trim: true },            // job they posted (proof of need)
  email:                 { type: String, trim: true, lowercase: true },
  phone:                 { type: String, trim: true },
  employees_or_students: { type: Number },
  estimated_value:       { type: Number, default: 0 },
  ai_score:              { type: Number, min: 0, max: 100 },
  ai_reasoning:          { type: String },
  why_good_lead:         { type: String },
  discovery_source:      { type: String },                        // e.g. "Naukri job posting", "LinkedIn Jobs"
  discovery_query:       { type: String },                        // exact search query used
  source_url:            { type: String },                        // direct job post URL
  status:                { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  reviewed_by:           { type: String, enum: ['S', 'A', 'P', null], default: null },
  reviewed_at:           { type: Date },
  discovered_at:         { type: Date, default: Date.now },
});

leadQueueSchema.index({ org_name: 1, discovered_at: -1 });

module.exports = mongoose.model('LeadQueue', leadQueueSchema, 'lead_queue');
