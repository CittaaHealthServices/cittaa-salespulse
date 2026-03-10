// jobs/leadDiscovery.js
// Discovers leads from job postings on Naukri, LinkedIn, Indeed, Shine, Glassdoor.
// Logic: an org actively hiring for counsellor / wellness / EAP roles = hot lead for Cittaa.
//
// Two-step Gemini pipeline:
//   Step 1 (grounded): search returns narrative text with real job posting data
//   Step 2 (extract):  separate model converts narrative → clean JSON lead record

require('dotenv').config();

const mongoose = require('mongoose');
let cron;
try { cron = require('node-cron'); } catch (e) { console.warn('[Discovery] node-cron unavailable'); }

// ── Gemini setup ───────────────────────────────────────────────────────────
function getGemini() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!key) return null;
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    return new GoogleGenerativeAI(key);
  } catch (e) { console.warn('[Discovery] Gemini init failed:', e.message); return null; }
}

// ── lazy model loaders ─────────────────────────────────────────────────────
function LeadQueue() { return require('../models/LeadQueue'); }
function DiscoveryLog() { return require('../models/DiscoveryLog'); }

// ─────────────────────────────────────────────────────────────────────────────
// QUERIES — each query targets a specific job platform + role + region
// type tells us what kind of org this is
// target_role tells Cittaa WHO to pitch to at that org
// ─────────────────────────────────────────────────────────────────────────────
const QUERIES = [
  // ──────────────── SCHOOLS ────────────────────────────────────────────────

  // Naukri – schools – South India
  { q: 'site:naukri.com "school counsellor" OR "school psychologist" Hyderabad Telangana 2025', target_role: 'Principal / Vice Principal', type: 'school', region: 'Telangana', platform: 'Naukri' },
  { q: 'site:naukri.com "school counsellor" OR "guidance counsellor" Bengaluru Karnataka 2025', target_role: 'Principal / Vice Principal', type: 'school', region: 'Karnataka', platform: 'Naukri' },
  { q: 'site:naukri.com "school counsellor" OR "student counsellor" Chennai Tamil Nadu 2025', target_role: 'Principal / Vice Principal', type: 'school', region: 'Tamil Nadu', platform: 'Naukri' },

  // Naukri – schools – North India
  { q: 'site:naukri.com "school counsellor" OR "school psychologist" Delhi NCR Noida Gurugram 2025', target_role: 'Principal / Vice Principal', type: 'school', region: 'Delhi NCR', platform: 'Naukri' },
  { q: 'site:naukri.com "school counsellor" OR "guidance counsellor" Mumbai Pune Maharashtra 2025', target_role: 'Principal / Vice Principal', type: 'school', region: 'Maharashtra', platform: 'Naukri' },

  // LinkedIn – schools
  { q: 'site:linkedin.com/jobs "school counsellor" OR "school psychologist" India 2025', target_role: 'Principal / Vice Principal', type: 'school', region: 'Pan India', platform: 'LinkedIn Jobs' },
  { q: 'site:linkedin.com/jobs "student counsellor" OR "guidance counsellor" school India 2025', target_role: 'Head of School / Director', type: 'school', region: 'Pan India', platform: 'LinkedIn Jobs' },

  // Indeed – schools
  { q: 'site:indeed.com "school counsellor" OR "school psychologist" India hiring 2025', target_role: 'Principal / Vice Principal', type: 'school', region: 'Pan India', platform: 'Indeed' },

  // Shine – schools
  { q: 'site:shine.com "school counsellor" OR "student counsellor" India 2025', target_role: 'Principal / Vice Principal', type: 'school', region: 'Pan India', platform: 'Shine' },

  // ──────────────── CORPORATES / EAP ───────────────────────────────────────

  // Naukri – corporate EAP / wellness – South India
  { q: 'site:naukri.com "EAP counsellor" OR "employee assistance" counsellor Hyderabad Bengaluru 2025', target_role: 'CHRO / HR Director', type: 'corporate', region: 'South India', platform: 'Naukri' },
  { q: 'site:naukri.com "corporate wellness" OR "employee wellbeing" counsellor Bengaluru Hyderabad 2025', target_role: 'HR Manager / L&D Head', type: 'corporate', region: 'South India', platform: 'Naukri' },
  { q: 'site:naukri.com "mental health counsellor" OR "workplace counsellor" IT company Bengaluru Pune 2025', target_role: 'HR Business Partner / CHRO', type: 'corporate', region: 'IT Hubs', platform: 'Naukri' },

  // Naukri – corporate EAP – North India
  { q: 'site:naukri.com "EAP counsellor" OR "employee wellness" counsellor Delhi Gurugram Noida 2025', target_role: 'CHRO / HR Director', type: 'corporate', region: 'Delhi NCR', platform: 'Naukri' },
  { q: 'site:naukri.com "corporate counsellor" OR "mental health" wellness officer Mumbai Pune 2025', target_role: 'HR Manager / L&D Head', type: 'corporate', region: 'Maharashtra', platform: 'Naukri' },
  { q: 'site:naukri.com "wellbeing manager" OR "mental health first aider" India corporate 2025', target_role: 'CHRO / VP People', type: 'corporate', region: 'Pan India', platform: 'Naukri' },

  // LinkedIn – corporate EAP
  { q: 'site:linkedin.com/jobs "EAP counsellor" OR "employee assistance programme" India 2025', target_role: 'CHRO / HR Director', type: 'corporate', region: 'Pan India', platform: 'LinkedIn Jobs' },
  { q: 'site:linkedin.com/jobs "corporate mental health" OR "employee wellbeing" counsellor India 2025', target_role: 'HR Manager / People & Culture Head', type: 'corporate', region: 'Pan India', platform: 'LinkedIn Jobs' },
  { q: 'site:linkedin.com/jobs "workplace counsellor" OR "corporate wellness counsellor" India hiring 2025', target_role: 'HR Business Partner / CHRO', type: 'corporate', region: 'Pan India', platform: 'LinkedIn Jobs' },

  // Indeed – corporate
  { q: 'site:indeed.com "EAP counsellor" OR "employee assistance" OR "corporate wellness counsellor" India 2025', target_role: 'CHRO / HR Director', type: 'corporate', region: 'Pan India', platform: 'Indeed' },

  // Shine – corporate
  { q: 'site:shine.com "corporate counsellor" OR "EAP" OR "employee wellbeing" counsellor India 2025', target_role: 'HR Manager / L&D Head', type: 'corporate', region: 'Pan India', platform: 'Shine' },

  // ──────────────── CLINICS / REHAB / NGOs ─────────────────────────────────

  // Clinics / hospitals hiring counsellors
  { q: 'site:naukri.com "clinical counsellor" OR "counselling psychologist" hospital clinic India 2025', target_role: 'Medical Director / Clinic Head', type: 'clinic', region: 'Pan India', platform: 'Naukri' },
  { q: 'site:linkedin.com/jobs "counselling psychologist" OR "clinical psychologist" clinic hospital India 2025', target_role: 'Medical Director / HOD Psychology', type: 'clinic', region: 'Pan India', platform: 'LinkedIn Jobs' },

  // Rehab centres
  { q: 'site:naukri.com "rehabilitation counsellor" OR "addiction counsellor" centre India 2025', target_role: 'Centre Director / Head of Services', type: 'rehab', region: 'Pan India', platform: 'Naukri' },

  // NGOs / social impact
  { q: 'site:linkedin.com/jobs "counsellor" NGO OR "social impact" OR "mental health" organisation India 2025', target_role: 'Programme Director / CEO', type: 'ngo', region: 'Pan India', platform: 'LinkedIn Jobs' },

  // Coaching institutes
  { q: 'site:naukri.com "counsellor" OR "psychologist" coaching institute OR "ed-tech" India 2025', target_role: 'Director / Head of Student Success', type: 'coaching', region: 'Pan India', platform: 'Naukri' },
  { q: 'site:indeed.com "student counsellor" OR "career counsellor" coaching institute India 2025', target_role: 'Director / Academic Head', type: 'coaching', region: 'Pan India', platform: 'Indeed' },
];

// ── prompt builders ────────────────────────────────────────────────────────
function buildSearchPrompt(query) {
  return `You are a B2B sales intelligence agent for Cittaa, an AI-powered mental health platform for organisations.

A company actively HIRING for counsellor / wellness roles proves they need Cittaa's platform.

Search for: "${query.q}"

For each job posting you find, extract:
1. The hiring organisation's name and location
2. The exact job title they posted
3. A direct URL to the job post on ${query.platform}
4. Any contact information visible (HR email, phone, LinkedIn page)
5. Organisation size / employee count if mentioned
6. The type of organisation (school, corporate, clinic, NGO, rehab, coaching)

Focus on REAL, VERIFIABLE job postings — not generic aggregators or fake listings.
The source URL must be a real link to the actual job post on ${query.platform}.

Region focus: ${query.region}
Decision maker to approach at this org: ${query.target_role}`;
}

function buildExtractionPrompt(text, query) {
  return `Extract lead information from this job posting data and return ONLY valid JSON.

Input text:
${text}

Return a JSON array. Each object must have these exact fields:
{
  "org_name": "Full organisation name",
  "type": "${query.type}",
  "city": "City name",
  "state": "State name",
  "contact_name": "HR contact name if found, else empty string",
  "role": "Contact's role/title if found, else empty string",
  "email": "Email if found, else empty string",
  "phone": "Phone if found, else empty string",
  "employees_or_students": number or 0,
  "notes": "Why this org is a hot lead — what job they posted, context",
  "ai_score": number between 40-95,
  "source_url": "MUST be a real direct URL to the job post on ${query.platform} — if you cannot find a real URL, omit this lead entirely",
  "target_role": "${query.target_role}",
  "job_title_hiring_for": "Exact job title from the posting",
  "discovery_source": "${query.platform} job posting",
  "discovery_query": "${query.q.replace(/"/g, '\\"')}"
}

Rules:
- Only include leads with a REAL source_url (actual job post link)
- ai_score: 85-95 if direct job post URL + contact info; 70-84 if job post URL only; 40-69 if indirect
- Return [] if no valid leads found
- Return ONLY the JSON array, no markdown, no explanation`;
}

// ── deduplication helper ───────────────────────────────────────────────────
function normalise(str) {
  return (str || '').toLowerCase()
    .replace(/pvt\.?\s*ltd\.?|private\s+limited|ltd\.?|inc\.?|llp|llc/gi, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function isDuplicate(orgName) {
  try {
    const norm = normalise(orgName);
    const existing = await LeadQueue().find({
      created_at: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    }).select('org_name').lean();
    return existing.some(e => normalise(e.org_name) === norm);
  } catch { return false; }
}

// ── save one lead to queue ─────────────────────────────────────────────────
async function saveLead(raw, query) {
  if (!raw.org_name || !raw.source_url) return null;     // must have real URL
  if (await isDuplicate(raw.org_name)) return null;

  try {
    const doc = await LeadQueue().create({
      org_name:             raw.org_name.trim(),
      type:                 raw.type || query.type,
      city:                 raw.city || '',
      state:                raw.state || '',
      contact_name:         raw.contact_name || '',
      role:                 raw.role || '',
      email:                raw.email || '',
      phone:                raw.phone || '',
      employees_or_students: Number(raw.employees_or_students) || 0,
      notes:                raw.notes || '',
      ai_score:             Math.min(Math.max(Number(raw.ai_score) || 50, 0), 100),
      source_url:           raw.source_url,
      target_role:          raw.target_role || query.target_role,
      job_title_hiring_for: raw.job_title_hiring_for || '',
      discovery_source:     raw.discovery_source || `${query.platform} job posting`,
      discovery_query:      raw.discovery_query || query.q,
      status:               'pending',
    });
    return doc;
  } catch (e) {
    if (e.code === 11000) return null; // duplicate key
    console.error('[Discovery] saveLead error:', e.message);
    return null;
  }
}

// ── run one query through the Gemini pipeline ─────────────────────────────
async function runQuery(query, genAI) {
  const saved = [];
  try {
    // Step 1: grounded search
    const searchModel = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      tools: [{ googleSearch: {} }],
    });
    const searchResult = await searchModel.generateContent(buildSearchPrompt(query));
    const narrative = searchResult.response.text();
    if (!narrative || narrative.length < 100) return saved;

    // Step 2: extract JSON
    const extractModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const extractResult = await extractModel.generateContent(buildExtractionPrompt(narrative, query));
    let raw = extractResult.response.text().trim();

    // Strip markdown fences if present
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let leads;
    try { leads = JSON.parse(raw); } catch { return saved; }
    if (!Array.isArray(leads)) return saved;

    for (const lead of leads.slice(0, 5)) {  // max 5 per query
      const doc = await saveLead(lead, query);
      if (doc) saved.push(doc);
    }
  } catch (e) {
    console.error(`[Discovery] Query failed (${query.platform}/${query.type}):`, e.message);
  }
  return saved;
}

// ── run a batch of queries ────────────────────────────────────────────────
async function runDiscovery(batch) {
  const genAI = getGemini();
  if (!genAI) { console.warn('[Discovery] No GEMINI_API_KEY — skipping'); return []; }

  const allSaved = [];
  for (const query of batch) {
    console.log(`[Discovery] Querying ${query.platform} for ${query.type}s in ${query.region}…`);
    const saved = await runQuery(query, genAI);
    console.log(`[Discovery]   → ${saved.length} new lead(s) saved`);
    allSaved.push(...saved);
    await new Promise(r => setTimeout(r, 2000)); // rate-limit between queries
  }

  // Log the run
  try {
    await DiscoveryLog().create({
      queries_run: batch.length,
      leads_found: allSaved.length,
      ran_at: new Date(),
    });
  } catch {}

  console.log(`[Discovery] Batch complete — ${allSaved.length} total new leads`);
  return allSaved;
}

// ── test discovery — runs a balanced subset (1 school + 1 corporate + 1 other) ──
async function runTestDiscovery() {
  const subset = [
    // 1 school query
    QUERIES.find(q => q.type === 'school' && q.platform === 'Naukri'),
    // 1 corporate query
    QUERIES.find(q => q.type === 'corporate' && q.platform === 'Naukri'),
    // 1 corporate LinkedIn
    QUERIES.find(q => q.type === 'corporate' && q.platform === 'LinkedIn Jobs'),
    // 1 school LinkedIn
    QUERIES.find(q => q.type === 'school' && q.platform === 'LinkedIn Jobs'),
  ].filter(Boolean);

  return runDiscovery(subset);
}

// ── scheduled jobs ────────────────────────────────────────────────────────
function startDiscoveryJobs() {
  if (!cron) { console.warn('[Discovery] node-cron unavailable — skipping scheduled jobs'); return; }

  try {
    // Full run every Monday at 1 AM IST
    cron.schedule('0 1 * * 1', () => {
      console.log('[Discovery] Weekly full scan starting…');
      runDiscovery(QUERIES).catch(e => console.error('[Discovery] Weekly scan error:', e.message));
    }, { timezone: 'Asia/Kolkata' });

    // Mid-week corporate-only run — Wednesday at 2 AM IST
    cron.schedule('0 2 * * 3', () => {
      const corporateQueries = QUERIES.filter(q => q.type === 'corporate');
      console.log('[Discovery] Mid-week corporate scan starting…');
      runDiscovery(corporateQueries).catch(e => console.error('[Discovery] Corporate scan error:', e.message));
    }, { timezone: 'Asia/Kolkata' });

    console.log('[Discovery] Scheduled jobs registered (Mon full scan, Wed corporate scan)');
  } catch (e) {
    console.error('[Discovery] Failed to register cron jobs:', e.message);
  }
}

module.exports = { startDiscoveryJobs, runDiscovery, runTestDiscovery, QUERIES };
