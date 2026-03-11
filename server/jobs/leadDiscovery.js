// jobs/leadDiscovery.js
// Discovers leads from Naukri, LinkedIn, Indeed, Shine, Glassdoor AND Instagram.
// Instagram: schools regularly post "We're Hiring" vacancy posts — Google indexes many.
//
// Two-step Gemini pipeline:
//   Step 1 (grounded): search returns narrative text with real posting data
//   Step 2 (extract):  separate model converts narrative → clean JSON lead

require('dotenv').config();

let cron;
try { cron = require('node-cron'); } catch (e) { console.warn('[Discovery] node-cron unavailable'); }

function getGemini() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!key) return null;
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    return new GoogleGenerativeAI(key);
  } catch (e) { console.warn('[Discovery] Gemini init failed:', e.message); return null; }
}

function LeadQueue()    { return require('../models/LeadQueue'); }
function DiscoveryLog() { return require('../models/DiscoveryLog'); }

const QUERIES = [
  // ── SCHOOLS – JOB PLATFORMS ──────────────────────────────────────────────
  { q: 'site:naukri.com "school counsellor" OR "school psychologist" Hyderabad Telangana 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Telangana', platform: 'Naukri' },
  { q: 'site:naukri.com "school counsellor" OR "guidance counsellor" Bengaluru Karnataka 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Karnataka', platform: 'Naukri' },
  { q: 'site:naukri.com "school counsellor" OR "student counsellor" Chennai Tamil Nadu 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Tamil Nadu', platform: 'Naukri' },
  { q: 'site:naukri.com "school counsellor" OR "school psychologist" Delhi NCR Noida Gurugram 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Delhi NCR', platform: 'Naukri' },
  { q: 'site:naukri.com "school counsellor" OR "guidance counsellor" Mumbai Pune Maharashtra 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Maharashtra', platform: 'Naukri' },
  { q: 'site:linkedin.com/jobs "school counsellor" OR "school psychologist" India 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Pan India', platform: 'LinkedIn Jobs' },
  { q: 'site:linkedin.com/jobs "student counsellor" OR "guidance counsellor" school India 2025',
    target_role: 'Head of School / Director', type: 'school', region: 'Pan India', platform: 'LinkedIn Jobs' },
  { q: 'site:indeed.com "school counsellor" OR "school psychologist" India hiring 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Pan India', platform: 'Indeed' },
  { q: 'site:shine.com "school counsellor" OR "student counsellor" India 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Pan India', platform: 'Shine' },

  // ── SCHOOLS – INSTAGRAM HIRING POSTS ─────────────────────────────────────
  { q: 'site:instagram.com school "hiring counsellor" OR "counsellor vacancy" OR "school counsellor" 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Pan India', platform: 'Instagram' },
  { q: 'site:instagram.com school "we are hiring" "counsellor" OR "psychologist" India 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Pan India', platform: 'Instagram' },
  { q: 'site:instagram.com "CBSE school" OR "ICSE school" OR "IB school" "counsellor vacancy" OR "hiring counsellor" India 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Pan India', platform: 'Instagram' },
  { q: 'site:instagram.com school Hyderabad OR Bengaluru OR Chennai "counsellor" "vacancy" OR "hiring" 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'South India', platform: 'Instagram' },
  { q: 'site:instagram.com school Delhi OR Mumbai OR Pune "counsellor" "vacancy" OR "hiring" 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'North & West India', platform: 'Instagram' },
  { q: '"instagram.com" school "school counsellor" hiring vacancy apply 2025 India -site:naukri.com -site:linkedin.com',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Pan India', platform: 'Instagram' },

  // ── CORPORATES – JOB PLATFORMS ───────────────────────────────────────────
  { q: 'site:naukri.com "EAP counsellor" OR "employee assistance" counsellor Hyderabad Bengaluru 2025',
    target_role: 'CHRO / HR Director', type: 'corporate', region: 'South India', platform: 'Naukri' },
  { q: 'site:naukri.com "corporate wellness" OR "employee wellbeing" counsellor Bengaluru Hyderabad 2025',
    target_role: 'HR Manager / L&D Head', type: 'corporate', region: 'South India', platform: 'Naukri' },
  { q: 'site:naukri.com "mental health counsellor" OR "workplace counsellor" IT company Bengaluru Pune 2025',
    target_role: 'HR Business Partner / CHRO', type: 'corporate', region: 'IT Hubs', platform: 'Naukri' },
  { q: 'site:naukri.com "EAP counsellor" OR "employee wellness" counsellor Delhi Gurugram Noida 2025',
    target_role: 'CHRO / HR Director', type: 'corporate', region: 'Delhi NCR', platform: 'Naukri' },
  { q: 'site:naukri.com "corporate counsellor" OR "mental health" wellness officer Mumbai Pune 2025',
    target_role: 'HR Manager / L&D Head', type: 'corporate', region: 'Maharashtra', platform: 'Naukri' },
  { q: 'site:naukri.com "wellbeing manager" OR "mental health first aider" India corporate 2025',
    target_role: 'CHRO / VP People', type: 'corporate', region: 'Pan India', platform: 'Naukri' },
  { q: 'site:linkedin.com/jobs "EAP counsellor" OR "employee assistance programme" India 2025',
    target_role: 'CHRO / HR Director', type: 'corporate', region: 'Pan India', platform: 'LinkedIn Jobs' },
  { q: 'site:linkedin.com/jobs "corporate mental health" OR "employee wellbeing" counsellor India 2025',
    target_role: 'HR Manager / People & Culture Head', type: 'corporate', region: 'Pan India', platform: 'LinkedIn Jobs' },
  { q: 'site:linkedin.com/jobs "workplace counsellor" OR "corporate wellness counsellor" India hiring 2025',
    target_role: 'HR Business Partner / CHRO', type: 'corporate', region: 'Pan India', platform: 'LinkedIn Jobs' },
  { q: 'site:indeed.com "EAP counsellor" OR "employee assistance" OR "corporate wellness counsellor" India 2025',
    target_role: 'CHRO / HR Director', type: 'corporate', region: 'Pan India', platform: 'Indeed' },
  { q: 'site:shine.com "corporate counsellor" OR "EAP" OR "employee wellbeing" counsellor India 2025',
    target_role: 'HR Manager / L&D Head', type: 'corporate', region: 'Pan India', platform: 'Shine' },

  // ── CLINICS / REHAB / NGO / COACHING ─────────────────────────────────────
  { q: 'site:naukri.com "clinical counsellor" OR "counselling psychologist" hospital clinic India 2025',
    target_role: 'Medical Director / Clinic Head', type: 'clinic', region: 'Pan India', platform: 'Naukri' },
  { q: 'site:linkedin.com/jobs "counselling psychologist" OR "clinical psychologist" clinic hospital India 2025',
    target_role: 'Medical Director / HOD Psychology', type: 'clinic', region: 'Pan India', platform: 'LinkedIn Jobs' },
  { q: 'site:naukri.com "rehabilitation counsellor" OR "addiction counsellor" centre India 2025',
    target_role: 'Centre Director / Head of Services', type: 'rehab', region: 'Pan India', platform: 'Naukri' },
  { q: 'site:linkedin.com/jobs "counsellor" NGO "social impact" OR "mental health" India 2025',
    target_role: 'Programme Director / CEO', type: 'ngo', region: 'Pan India', platform: 'LinkedIn Jobs' },
  { q: 'site:naukri.com "counsellor" OR "psychologist" coaching institute OR "ed-tech" India 2025',
    target_role: 'Director / Head of Student Success', type: 'coaching', region: 'Pan India', platform: 'Naukri' },
  { q: 'site:indeed.com "student counsellor" OR "career counsellor" coaching institute India 2025',
    target_role: 'Director / Academic Head', type: 'coaching', region: 'Pan India', platform: 'Indeed' },
];

function buildSearchPrompt(query) {
  if (query.platform === 'Instagram') {
    return `You are a B2B sales intelligence agent for Cittaa, an AI mental health platform for organisations.

Schools in India regularly post hiring announcements on Instagram — vacancy posts, "We're Hiring" stories, job opening reels.

Search for: "${query.q}"

For each school hiring post you find on Instagram, extract:
1. The school's name and city/state
2. The role they are hiring for (counsellor, psychologist, etc.)
3. The Instagram post URL or the school's Instagram profile URL
4. Contact info visible in the post or bio (email, phone, website)
5. Approximate school size if visible (CBSE/ICSE/IB, student count)

Focus on REAL school Instagram accounts — not job aggregators.
The source_url must be an actual instagram.com link.

Region: ${query.region}
Decision maker to approach: ${query.target_role}`;
  }

  return `You are a B2B sales intelligence agent for Cittaa, an AI mental health platform for organisations.

A company actively HIRING for counsellor/wellness roles proves they need Cittaa's platform.

Search for: "${query.q}"

For each job posting you find, extract:
1. The hiring organisation's name and location
2. The exact job title posted
3. A direct URL to the job post on ${query.platform}
4. Any contact information (HR email, phone, LinkedIn)
5. Organisation size if mentioned

Focus on REAL, VERIFIABLE postings — not aggregators or fake listings.
The source URL must be a real link on ${query.platform}.

Region: ${query.region}
Decision maker to approach: ${query.target_role}`;
}

function buildExtractionPrompt(text, query) {
  const isIG = query.platform === 'Instagram';
  const urlNote = isIG
    ? 'must be an instagram.com link (post or profile). Omit lead if no real IG URL.'
    : `must be a direct URL to the job post on ${query.platform}. Omit lead if no real URL.`;

  return `Extract leads from this data. Return ONLY a valid JSON array.

Input:
${text}

Each object must have:
{
  "org_name": "Full name",
  "type": "${query.type}",
  "city": "City",
  "state": "State",
  "contact_name": "",
  "role": "",
  "email": "",
  "phone": "",
  "employees_or_students": 0,
  "notes": "Why this is a hot lead",
  "ai_score": 40-95,
  "source_url": "REQUIRED — ${urlNote}",
  "target_role": "${query.target_role}",
  "job_title_hiring_for": "Exact role they are hiring for",
  "discovery_source": "${query.platform}${isIG ? ' hiring post' : ' job posting'}",
  "discovery_query": "${query.q.replace(/"/g, '\\"')}"
}

Scoring: 85-95 if URL + contact info; 70-84 if URL only; 40-69 indirect.
Rules: omit leads without a real source_url. Return [] if none found.
Return ONLY the JSON array.`;
}

function normalise(s) {
  return (s || '').toLowerCase()
    .replace(/pvt\.?\s*ltd\.?|private\s+limited|ltd\.?|inc\.?|llp|llc/gi, '')
    .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

async function isDuplicate(orgName) {
  try {
    const norm = normalise(orgName);
    const recent = await LeadQueue().find({
      created_at: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    }).select('org_name').lean();
    return recent.some(e => normalise(e.org_name) === norm);
  } catch { return false; }
}

async function saveLead(raw, query) {
  if (!raw.org_name || !raw.source_url) return null;
  if (await isDuplicate(raw.org_name)) return null;
  try {
    return await LeadQueue().create({
      org_name:              raw.org_name.trim(),
      type:                  raw.type || query.type,
      city:                  raw.city || '',
      state:                 raw.state || '',
      contact_name:          raw.contact_name || '',
      role:                  raw.role || '',
      email:                 raw.email || '',
      phone:                 raw.phone || '',
      employees_or_students: Number(raw.employees_or_students) || 0,
      notes:                 raw.notes || '',
      ai_score:              Math.min(Math.max(Number(raw.ai_score) || 50, 0), 100),
      source_url:            raw.source_url,
      target_role:           raw.target_role || query.target_role,
      job_title_hiring_for:  raw.job_title_hiring_for || '',
      discovery_source:      raw.discovery_source || `${query.platform} job posting`,
      discovery_query:       raw.discovery_query || query.q,
      status:                'pending',
    });
  } catch (e) {
    if (e.code === 11000) return null;
    console.error('[Discovery] saveLead:', e.message);
    return null;
  }
}

async function runQuery(query, genAI) {
  const saved = [];
  try {
    const searchModel = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash', tools: [{ googleSearch: {} }],
    });
    const searchResult = await searchModel.generateContent(buildSearchPrompt(query));
    const narrative = searchResult.response.text();
    if (!narrative || narrative.length < 100) return saved;

    const extractModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const extractResult = await extractModel.generateContent(buildExtractionPrompt(narrative, query));
    let raw = extractResult.response.text().trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let leads;
    try { leads = JSON.parse(raw); } catch { return saved; }
    if (!Array.isArray(leads)) return saved;

    for (const lead of leads.slice(0, 5)) {
      const doc = await saveLead(lead, query);
      if (doc) saved.push(doc);
    }
  } catch (e) {
    console.error(`[Discovery] ${query.platform}/${query.type}:`, e.message);
  }
  return saved;
}

async function runDiscovery(batch) {
  const genAI = getGemini();
  if (!genAI) { console.warn('[Discovery] No GEMINI_API_KEY'); return []; }

  const all = [];
  for (const q of batch) {
    console.log(`[Discovery] ${q.platform} · ${q.type} · ${q.region}`);
    const saved = await runQuery(q, genAI);
    console.log(`[Discovery]   → ${saved.length} new lead(s)`);
    all.push(...saved);
    await new Promise(r => setTimeout(r, 2000));
  }
  try { await DiscoveryLog().create({ queries_run: batch.length, leads_found: all.length, ran_at: new Date() }); } catch {}
  console.log(`[Discovery] Done — ${all.length} total`);
  return all;
}

// Balanced test set: school (Naukri) + school (LinkedIn) + school (Instagram) + corporate (Naukri) + corporate (LinkedIn)
async function runTestDiscovery() {
  const subset = [
    QUERIES.find(q => q.type === 'school'    && q.platform === 'Naukri'),
    QUERIES.find(q => q.type === 'school'    && q.platform === 'LinkedIn Jobs'),
    QUERIES.find(q => q.type === 'school'    && q.platform === 'Instagram'),
    QUERIES.find(q => q.type === 'corporate' && q.platform === 'Naukri'),
    QUERIES.find(q => q.type === 'corporate' && q.platform === 'LinkedIn Jobs'),
  ].filter(Boolean);
  return runDiscovery(subset);
}

function startDiscoveryJobs() {
  if (!cron) return;
  try {
    cron.schedule('0 1 * * 1', () => runDiscovery(QUERIES).catch(console.error), { timezone: 'Asia/Kolkata' });
    cron.schedule('0 2 * * 3', () => runDiscovery(QUERIES.filter(q => q.type === 'corporate')).catch(console.error), { timezone: 'Asia/Kolkata' });
    cron.schedule('0 3 * * 5', () => runDiscovery(QUERIES.filter(q => q.platform === 'Instagram')).catch(console.error), { timezone: 'Asia/Kolkata' });
    console.log('[Discovery] Jobs: Mon (full), Wed (corporate), Fri (Instagram)');
  } catch (e) { console.error('[Discovery] Cron setup:', e.message); }
}

module.exports = { startDiscoveryJobs, runDiscovery, runTestDiscovery, QUERIES };
