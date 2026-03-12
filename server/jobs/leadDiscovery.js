// jobs/leadDiscovery.js
// Discovers leads by finding organisations actively hiring counsellors / wellness staff.
// Uses Gemini grounded search (Google Search under the hood) with plain-language queries
// — no site: operators which don't work reliably through the API.

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
function Lead()         { return require('../models/Lead'); }
function DiscoveryLog() { return require('../models/DiscoveryLog'); }

// ── QUERIES — plain language, no site: operators ────────────────────────────
// Gemini's grounded search works best with natural queries, not site: filters.
// Each query targets a specific city/region + org type + role combination.

const QUERIES = [

  // ── SCHOOLS — South India ─────────────────────────────────────────────────
  { q: 'schools in Hyderabad Telangana hiring school counsellor OR psychologist 2025 job opening',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Hyderabad', platform: 'Job Boards' },
  { q: 'schools in Bengaluru Karnataka hiring school counsellor OR student counsellor 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Bengaluru', platform: 'Job Boards' },
  { q: 'schools in Chennai Tamil Nadu hiring school counsellor OR guidance counsellor 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Chennai', platform: 'Job Boards' },

  // ── SCHOOLS — North & West India ─────────────────────────────────────────
  { q: 'schools in Delhi NCR Noida Gurugram hiring school counsellor OR psychologist 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Delhi NCR', platform: 'Job Boards' },
  { q: 'schools in Mumbai Pune Maharashtra hiring school counsellor 2025 job vacancy',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Maharashtra', platform: 'Job Boards' },
  { q: 'CBSE ICSE schools India hiring school counsellor wellness coordinator 2025 naukri linkedin',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Pan India', platform: 'Job Boards' },

  // ── SCHOOLS — Government ─────────────────────────────────────────────────
  { q: 'Kendriya Vidyalaya Navodaya Vidyalaya Sainik School hiring counsellor vacancy 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Pan India', platform: 'Govt Portal' },
  { q: 'government school India counsellor recruitment 2025 Telangana Karnataka Tamil Nadu',
    target_role: 'Principal', type: 'school', region: 'South India', platform: 'Govt Portal' },

  // ── SCHOOLS — Social media signals ───────────────────────────────────────
  { q: 'school India hiring counsellor vacancy 2025 instagram facebook linkedin post announcement',
    target_role: 'Principal', type: 'school', region: 'Pan India', platform: 'Social Media' },
  { q: 'school Hyderabad Bengaluru Chennai counsellor vacancy hiring 2025 social media post',
    target_role: 'Principal', type: 'school', region: 'South India', platform: 'Social Media' },

  // ── CORPORATES — EAP / Employee Wellness ─────────────────────────────────
  { q: 'companies in Bengaluru Hyderabad hiring EAP counsellor OR employee wellness counsellor 2025',
    target_role: 'CHRO / HR Director', type: 'corporate', region: 'South India', platform: 'Job Boards' },
  { q: 'IT companies India hiring corporate mental health counsellor OR workplace wellness counsellor 2025',
    target_role: 'HR Business Partner / CHRO', type: 'corporate', region: 'IT Hubs', platform: 'Job Boards' },
  { q: 'companies in Delhi Gurugram Noida hiring EAP counsellor employee assistance 2025',
    target_role: 'CHRO / HR Director', type: 'corporate', region: 'Delhi NCR', platform: 'Job Boards' },
  { q: 'companies in Mumbai Pune hiring employee wellbeing manager OR corporate wellness counsellor 2025',
    target_role: 'HR Manager / L&D Head', type: 'corporate', region: 'Maharashtra', platform: 'Job Boards' },
  { q: 'India companies hiring mental health counsellor employee assistance programme EAP 2025 naukri linkedin',
    target_role: 'CHRO / HR Director', type: 'corporate', region: 'Pan India', platform: 'Job Boards' },

  // ── CORPORATES — Intent signals ───────────────────────────────────────────
  { q: 'Indian companies launching employee mental health program OR EAP initiative 2025',
    target_role: 'CHRO / VP People', type: 'corporate', region: 'Pan India', platform: 'News Signal' },
  { q: 'India startup Series A Series B funded 2025 hiring people team HR employee wellness',
    target_role: 'CHRO / Head of People', type: 'corporate', region: 'Pan India', platform: 'Funding Signal' },
  { q: 'Great Place to Work certified companies India 2025 employee wellbeing mental health',
    target_role: 'CHRO / HR Director', type: 'corporate', region: 'Pan India', platform: 'GPTW Signal' },
  { q: 'India companies with high employee burnout stress reviews 2025 Glassdoor Ambitionbox mental health',
    target_role: 'CHRO / HR Director', type: 'corporate', region: 'Pan India', platform: 'Glassdoor Signal' },

  // ── CLINICS / NGOs / COACHING ─────────────────────────────────────────────
  { q: 'hospitals clinics India hiring counselling psychologist OR clinical psychologist 2025',
    target_role: 'Medical Director / Clinic Head', type: 'clinic', region: 'Pan India', platform: 'Job Boards' },
  { q: 'NGOs India hiring counsellor mental health social worker 2025',
    target_role: 'Programme Director / CEO', type: 'ngo', region: 'Pan India', platform: 'Job Boards' },
  { q: 'coaching institutes ed-tech companies India hiring student counsellor career counsellor 2025',
    target_role: 'Director / Head of Student Success', type: 'coaching', region: 'Pan India', platform: 'Job Boards' },
  { q: 'rehabilitation centres de-addiction centres India hiring counsellor psychologist 2025',
    target_role: 'Centre Director', type: 'rehab', region: 'Pan India', platform: 'Job Boards' },
];

const SIGNAL_PLATFORMS = ['News Signal', 'GPTW Signal', 'Glassdoor Signal', 'Funding Signal'];

// ── Search prompt: direct, conversational — works with Gemini grounded search ──
function buildSearchPrompt(query) {
  const orgType = {
    school:    'schools or educational institutions',
    corporate: 'companies or organisations',
    clinic:    'hospitals, clinics or healthcare organisations',
    ngo:       'NGOs or non-profit organisations',
    coaching:  'coaching institutes or ed-tech companies',
    rehab:     'rehabilitation or de-addiction centres',
  }[query.type] || 'organisations';

  if (query.platform === 'Funding Signal') {
    return `Search for: ${query.q}

Find Indian startups or companies that recently received Series A, B, or C funding in 2024-2025 and are rapidly growing their teams. These companies are ideal candidates for Cittaa's employee mental health platform because scaling teams experience stress and burnout.

For each company found, provide:
1. Company name and headquarters city
2. Funding amount and round (Series A/B/C)
3. Industry/sector
4. Approximate employee count
5. Source URL (news article, press release, or LinkedIn post)
6. Why they are a good fit for an employee wellness platform

Focus on companies with 100-2000 employees where mental health support is relevant.`;
  }

  if (query.platform === 'GPTW Signal') {
    return `Search for: ${query.q}

Find companies in India that won "Great Place to Work" certification or "Best Employer" awards in 2024-2025. These companies actively invest in employee wellbeing and are strong prospects for Cittaa's mental health platform.

For each company found, provide:
1. Company name and city
2. The award or certification received
3. Industry and approximate employee count
4. Source URL (award announcement, press release, or news article)
5. Any mention of mental health or wellness programs`;
  }

  if (query.platform === 'Glassdoor Signal') {
    return `Search for: ${query.q}

Find Indian companies where employees are publicly complaining about mental health issues, burnout, high stress, or lack of wellness support on Glassdoor or Ambitionbox. These companies urgently need Cittaa's platform.

For each company found, provide:
1. Company name and city
2. The specific mental health complaints mentioned
3. Source URL (Glassdoor or Ambitionbox review page)
4. Industry and approximate size`;
  }

  if (query.platform === 'News Signal') {
    return `Search for: ${query.q}

Find Indian companies that recently announced employee mental health programs, EAP partnerships, or workplace wellness initiatives in news articles (2024-2025). These companies are actively investing in mental health.

For each company found, provide:
1. Company name and city  
2. The wellness initiative announced
3. Source URL (news article)
4. Industry and approximate size`;
  }

  if (query.platform === 'Govt Portal') {
    return `Search for: ${query.q}

Find government schools, Kendriya Vidyalayas, Navodaya Vidyalayas, Sainik Schools, or state government schools that have posted counsellor or psychologist vacancies in 2024-2025. Government school contracts are long-tenure and high-value.

For each vacancy found, provide:
1. School name and location (city, state)
2. The exact position advertised
3. Source URL (official notification or portal)
4. Pay scale if mentioned
5. Application deadline if mentioned`;
  }

  if (query.platform === 'Social Media') {
    return `Search for: ${query.q}

Find ${orgType} in India that posted counsellor hiring announcements on Instagram, Facebook, LinkedIn posts, or Twitter in 2024-2025. Schools and companies often post vacancies on social media before listing on job boards.

For each post found, provide:
1. Organisation name and city
2. Role being hired for
3. Social media post or profile URL
4. Contact details if visible (email, phone, website)`;
  }

  // Default: job board query
  return `Search for: ${query.q}

Find ${orgType} in India that are actively hiring counsellors, psychologists, or wellness professionals in 2024-2025. These organisations are actively investing in mental health support, making them ideal prospects for Cittaa's AI mental health platform.

For each hiring organisation found, provide:
1. Organisation name and city/state
2. The exact job title being hired for
3. Job posting URL (Naukri, LinkedIn, Indeed, or organisation website)
4. Contact information if available (HR email, phone, website)
5. Organisation size (number of students or employees) if mentioned
6. Salary range if mentioned

Focus on REAL job postings, not aggregator reposts. Region: ${query.region}`;
}

// ── Extraction prompt: simple, permissive ────────────────────────────────────
function buildExtractionPrompt(text, query) {
  return `Extract all organisations from the text below that are hiring counsellors or have mental health needs.

Return a JSON array. Each item:
{
  "org_name": "Organisation name (REQUIRED)",
  "type": "${query.type}",
  "city": "City name or empty string",
  "state": "State name or empty string",
  "email": "",
  "phone": "",
  "notes": "Why this org is a lead — what signal was found",
  "ai_score": <number 40-95>,
  "source_url": "URL if available, empty string if not",
  "target_role": "${query.target_role}",
  "job_title_hiring_for": "Exact role they are hiring / reason they need Cittaa",
  "discovery_source": "${query.platform}",
  "discovery_query": "${query.q.replace(/"/g, '\\"')}"
}

Scoring:
- 85-95: Real job posting URL + contact info found
- 70-84: Job posting URL found, no contact info
- 55-69: Org name + city confirmed, no URL
- 40-54: Org name only

RULES:
- Include an org even if source_url is empty — org name is enough to save it
- Skip only if org_name is completely unknown
- Return [] if no organisations found

TEXT:
${text}

Return ONLY the JSON array, no explanation.`;
}

function normalise(s) {
  return (s || '').toLowerCase()
    .replace(/pvt\.?\s*ltd\.?|private\s+limited|ltd\.?|inc\.?|llp|llc/gi, '')
    .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

async function isDuplicate(orgName) {
  try {
    const norm = normalise(orgName);
    if (!norm || norm.length < 3) return false;
    // Only block: already in pipeline OR currently pending in queue
    const [inPipeline, inQueue] = await Promise.all([
      Lead().findOne({ org_name: { $regex: new RegExp(norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } }).select('_id').lean().catch(() => null),
      LeadQueue().findOne({ org_name: { $regex: new RegExp(norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, status: 'pending' }).select('_id').lean().catch(() => null),
    ]);
    return !!(inPipeline || inQueue);
  } catch { return false; }
}

async function saveLead(raw, query) {
  if (!raw.org_name || raw.org_name.trim().length < 2) return null;
  if (await isDuplicate(raw.org_name)) return null;
  try {
    // Always provide a fallback URL so schema required: true can't block the save
    const fallbackUrl = raw.source_url ||
      `https://www.google.com/search?q=${encodeURIComponent(raw.org_name + ' counsellor hiring India')}`;

    return await LeadQueue().create({
      org_name:              raw.org_name.trim(),
      type:                  raw.type      || query.type,
      city:                  raw.city      || '',
      state:                 raw.state     || '',
      contact_name:          '',
      role:                  '',
      email:                 raw.email     || '',
      phone:                 raw.phone     || '',
      employees_or_students: Number(raw.employees_or_students) || 0,
      notes:                 raw.notes     || '',
      ai_score:              Math.min(Math.max(Number(raw.ai_score) || 50, 0), 100),
      source_url:            fallbackUrl,
      target_role:           raw.target_role           || query.target_role,
      job_title_hiring_for:  raw.job_title_hiring_for  || '',
      discovery_source:      raw.discovery_source      || query.platform,
      discovery_query:       query.q,
      status:                'pending',
    });
  } catch (e) {
    if (e.code === 11000) return null;
    console.error('[Discovery] saveLead error:', e.message, JSON.stringify(e.errors || {}));
    return null;
  }
}

async function runQuery(query, genAI) {
  const saved = [];
  try {
    console.log(`[Discovery] Querying: ${query.platform} | ${query.type} | ${query.region}`);

    const searchModel = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      tools: [{ googleSearch: {} }],
    });

    const searchResult = await searchModel.generateContent(buildSearchPrompt(query));
    const narrative = searchResult.response.text();

    console.log(`[Discovery]   search returned ${narrative.length} chars`);
    if (!narrative || narrative.length < 60) {
      console.log(`[Discovery]   EMPTY — skipping extraction`);
      return saved;
    }

    const extractModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const extractResult = await extractModel.generateContent(buildExtractionPrompt(narrative, query));
    let rawText = extractResult.response.text().trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    // Handle case where model wraps in an object
    if (rawText.startsWith('{')) {
      const match = rawText.match(/\[[\s\S]*\]/);
      if (match) rawText = match[0];
    }

    let leads;
    try {
      leads = JSON.parse(rawText);
    } catch (parseErr) {
      console.log(`[Discovery]   JSON parse failed: ${parseErr.message}`);
      console.log(`[Discovery]   Raw (first 300): ${rawText.substring(0, 300)}`);
      return saved;
    }

    if (!Array.isArray(leads)) {
      console.log(`[Discovery]   Not array: ${typeof leads}`);
      return saved;
    }

    console.log(`[Discovery]   Extracted ${leads.length} orgs from Gemini`);
    let sv = 0, dup = 0, skip = 0;
    for (const lead of leads.slice(0, 10)) {
      if (!lead.org_name) { skip++; continue; }
      const doc = await saveLead(lead, query);
      if (doc) { saved.push(doc); sv++; }
      else if (await isDuplicate(lead.org_name)) { dup++; }
      else { skip++; }
    }
    console.log(`[Discovery]   Saved:${sv} Dup:${dup} Skip:${skip}`);
  } catch (e) {
    console.error(`[Discovery] ERROR [${query.platform}/${query.type}]: ${e.message}`);
  }
  return saved;
}

async function runDiscovery(batch) {
  const genAI = getGemini();
  if (!genAI) { console.warn('[Discovery] No GEMINI_API_KEY'); return []; }

  console.log(`[Discovery] === SCAN START — ${batch.length} queries ===`);
  const all = [];
  for (const q of batch) {
    const saved = await runQuery(q, genAI);
    all.push(...saved);
    await new Promise(r => setTimeout(r, 2000));
  }
  try { await DiscoveryLog().create({ queries_run: batch.length, leads_found: all.length, ran_at: new Date() }); } catch {}
  console.log(`[Discovery] === SCAN DONE — ${all.length} leads saved ===`);
  return all;
}

// Rotates through queries so repeated scans hit different sets
let _scanCount = 0;
async function runTestDiscovery() {
  _scanCount++;
  console.log(`[Discovery] Manual scan #${_scanCount}`);

  // Each group picks a different query per scan
  const groups = [
    QUERIES.filter(q => q.type === 'school'    && q.region.includes('Hyderabad')),
    QUERIES.filter(q => q.type === 'school'    && q.region.includes('Bengaluru')),
    QUERIES.filter(q => q.type === 'school'    && q.region.includes('Delhi')),
    QUERIES.filter(q => q.type === 'school'    && q.region.includes('Pan India')),
    QUERIES.filter(q => q.type === 'school'    && q.platform === 'Govt Portal'),
    QUERIES.filter(q => q.type === 'corporate' && q.platform === 'Job Boards'),
    QUERIES.filter(q => q.type === 'corporate' && q.platform === 'News Signal'),
    QUERIES.filter(q => q.type === 'corporate' && q.platform === 'Funding Signal'),
    QUERIES.filter(q => q.type === 'corporate' && q.platform === 'GPTW Signal'),
    QUERIES.filter(q => ['clinic','ngo','coaching','rehab'].includes(q.type)),
  ];

  const subset = groups
    .map(g => g.length ? g[(_scanCount - 1) % g.length] : null)
    .filter(Boolean);

  return runDiscovery(subset);
}

function startDiscoveryJobs() {
  if (!cron) return;
  try {
    cron.schedule('0 1 * * 1', () => runDiscovery(QUERIES).catch(console.error),         { timezone: 'Asia/Kolkata' });
    cron.schedule('0 2 * * 3', () => runDiscovery(QUERIES.filter(q => q.type === 'corporate' || SIGNAL_PLATFORMS.includes(q.platform))).catch(console.error), { timezone: 'Asia/Kolkata' });
    cron.schedule('0 3 * * 5', () => runDiscovery(QUERIES.filter(q => q.platform === 'Social Media')).catch(console.error), { timezone: 'Asia/Kolkata' });
    cron.schedule('0 4 * * 6', () => runDiscovery(QUERIES.filter(q => q.platform === 'Govt Portal' || q.platform === 'GPTW Signal')).catch(console.error), { timezone: 'Asia/Kolkata' });
    console.log('[Discovery] Cron: Mon(full) Wed(corporate) Fri(social) Sat(govt)');
  } catch (e) { console.error('[Discovery] Cron setup:', e.message); }
}

module.exports = { startDiscoveryJobs, runDiscovery, runTestDiscovery, QUERIES };
