// jobs/leadDiscovery.js
// Uses @google/genai (new SDK) with gemini-2.5-flash and Google Search grounding

require('dotenv').config();

let cron;
try { cron = require('node-cron'); } catch(e) { console.warn('[Discovery] node-cron unavailable'); }

function getAI() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!key) return null;
  try {
    const { GoogleGenAI } = require('@google/genai');
    return new GoogleGenAI({ apiKey: key });
  } catch(e) { console.warn('[Discovery] Gemini init failed:', e.message); return null; }
}

function LeadQueue()    { return require('../models/LeadQueue'); }
function Lead()         { return require('../models/Lead'); }
function DiscoveryLog() { return require('../models/DiscoveryLog'); }

const QUERIES = [
  // ── SCHOOLS — South India
  { q: 'schools in Hyderabad Telangana hiring school counsellor OR psychologist 2025 job opening',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Hyderabad', platform: 'Job Boards' },
  { q: 'schools in Bengaluru Karnataka hiring school counsellor OR student counsellor 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Bengaluru', platform: 'Job Boards' },
  { q: 'schools in Chennai Tamil Nadu hiring school counsellor OR guidance counsellor 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Chennai', platform: 'Job Boards' },
  // ── SCHOOLS — North & West India
  { q: 'schools in Delhi NCR Noida Gurugram hiring school counsellor OR psychologist 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Delhi NCR', platform: 'Job Boards' },
  { q: 'schools in Mumbai Pune Maharashtra hiring school counsellor 2025 job vacancy',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Maharashtra', platform: 'Job Boards' },
  { q: 'CBSE ICSE schools India hiring school counsellor wellness coordinator 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Pan India', platform: 'Job Boards' },
  // ── UNIVERSITIES & COLLEGES
  { q: 'universities in Hyderabad Bengaluru hiring student counsellor OR psychologist 2025',
    target_role: 'Dean of Students / Registrar', type: 'school', region: 'South India', platform: 'Universities' },
  { q: 'universities in Delhi Mumbai Chennai hiring student wellness counsellor OR psychologist 2025',
    target_role: 'Dean of Students / Vice Chancellor', type: 'school', region: 'North & West India', platform: 'Universities' },
  { q: 'private engineering colleges MBA colleges India hiring counsellor psychologist student wellness 2025',
    target_role: 'Principal / Director', type: 'school', region: 'Pan India', platform: 'Universities' },
  { q: 'deemed universities autonomous colleges India hiring mental health counsellor student support 2025',
    target_role: 'Dean of Students / Registrar', type: 'school', region: 'Pan India', platform: 'Universities' },
  { q: 'Hyderabad Bengaluru colleges hiring counsellor student mental health wellbeing 2025 naukri linkedin',
    target_role: 'Dean of Students / Principal', type: 'school', region: 'South India', platform: 'Universities' },
  { q: 'IIT NIT BITS private universities India hiring student counsellor mental health officer 2025',
    target_role: 'Dean of Students / Registrar', type: 'school', region: 'Pan India', platform: 'Universities' },
  // ── SCHOOLS — Social media
  { q: 'school India hiring counsellor vacancy 2025 instagram facebook linkedin post announcement',
    target_role: 'Principal', type: 'school', region: 'Pan India', platform: 'Social Media' },
  { q: 'school Hyderabad Bengaluru Chennai counsellor vacancy hiring 2025 social media post',
    target_role: 'Principal', type: 'school', region: 'South India', platform: 'Social Media' },
  // ── CORPORATES — EAP / Wellness
  { q: 'companies in Bengaluru Hyderabad hiring EAP counsellor OR employee wellness counsellor 2025',
    target_role: 'CHRO / HR Director', type: 'corporate', region: 'South India', platform: 'Job Boards' },
  { q: 'IT companies India hiring corporate mental health counsellor OR workplace wellness counsellor 2025',
    target_role: 'HR Business Partner / CHRO', type: 'corporate', region: 'IT Hubs', platform: 'Job Boards' },
  { q: 'companies in Delhi Gurugram Noida hiring EAP counsellor employee assistance 2025',
    target_role: 'CHRO / HR Director', type: 'corporate', region: 'Delhi NCR', platform: 'Job Boards' },
  { q: 'companies in Mumbai Pune hiring employee wellbeing manager OR corporate wellness counsellor 2025',
    target_role: 'HR Manager / L&D Head', type: 'corporate', region: 'Maharashtra', platform: 'Job Boards' },
  { q: 'India companies hiring mental health counsellor employee assistance programme EAP 2025',
    target_role: 'CHRO / HR Director', type: 'corporate', region: 'Pan India', platform: 'Job Boards' },
  // ── CORPORATES — Intent signals
  { q: 'Indian companies launching employee mental health program OR EAP initiative 2025',
    target_role: 'CHRO / VP People', type: 'corporate', region: 'Pan India', platform: 'News Signal' },
  { q: 'India startup Series A Series B funded 2025 hiring people team HR employee wellness',
    target_role: 'CHRO / Head of People', type: 'corporate', region: 'Pan India', platform: 'Funding Signal' },
  { q: 'Great Place to Work certified companies India 2025 employee wellbeing mental health',
    target_role: 'CHRO / HR Director', type: 'corporate', region: 'Pan India', platform: 'GPTW Signal' },
  { q: 'India companies with high employee burnout stress reviews 2025 Glassdoor Ambitionbox',
    target_role: 'CHRO / HR Director', type: 'corporate', region: 'Pan India', platform: 'Glassdoor Signal' },
  // ── CLINICS / NGOs / COACHING
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

// ── Extract readable platform name from a URL ──────────────────────────────
function platformFromUrl(url) {
  if (!url) return '';
  try {
    const host = new URL(url).hostname.replace('www.', '').toLowerCase();
    if (host.includes('naukri'))       return 'Naukri';
    if (host.includes('linkedin'))     return 'LinkedIn';
    if (host.includes('indeed'))       return 'Indeed';
    if (host.includes('timesjobs'))    return 'TimesJobs';
    if (host.includes('shine'))        return 'Shine';
    if (host.includes('monsterindia') || host.includes('foundit')) return 'Foundit';
    if (host.includes('glassdoor'))    return 'Glassdoor';
    if (host.includes('ambitionbox'))  return 'AmbitionBox';
    if (host.includes('internshala')) return 'Internshala';
    if (host.includes('hirist'))       return 'Hirist';
    if (host.includes('twitter') || host.includes('x.com')) return 'Twitter/X';
    if (host.includes('facebook'))     return 'Facebook';
    if (host.includes('instagram'))    return 'Instagram';
    if (host.includes('google'))       return '';   // suppress Google search fallbacks
    return host.split('.')[0].charAt(0).toUpperCase() + host.split('.')[0].slice(1);
  } catch { return ''; }
}

// ── Extract grounding source URLs from Gemini search response ─────────────
function extractGroundingUrls(response) {
  try {
    const candidates = response?.candidates || [];
    const chunks = candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    return chunks
      .map(c => c?.web?.uri || '')
      .filter(u => u && !u.includes('google.com/search'));
  } catch { return []; }
}

function buildSearchPrompt(query) {
  const orgLabel = query.platform === 'Universities'
    ? 'universities and colleges'
    : { school:'schools', corporate:'companies', clinic:'clinics/hospitals', ngo:'NGOs', coaching:'coaching institutes', rehab:'rehab centres' }[query.type] || 'organisations';

  return `You are a B2B sales intelligence agent for Cittaa, an AI mental health platform.

Find ${orgLabel} in India that are actively hiring counsellors, psychologists, or mental health / wellness professionals. These are hot leads for Cittaa.

Search query: ${query.q}

For each organisation found, provide:
1. Organisation name and city/state
2. Exact role being hired (or mental health signal found)
3. EXACT job posting URL from Naukri, LinkedIn, Indeed, TimesJobs, Shine, or other job boards
4. Which job board or website it was posted on (e.g., "Naukri", "LinkedIn", "Indeed")
5. Contact info if available (email, phone, website)
6. Organisation size (students or employees) if mentioned

Region focus: ${query.region}
Decision maker to reach: ${query.target_role}

List all real organisations you can find. Include the specific job board URL wherever available.`;
}

function buildExtractionPrompt(text, query, groundingUrls) {
  const urlContext = groundingUrls.length > 0
    ? `\n\nActual source URLs found during search (use these for source_url field):\n${groundingUrls.map((u, i) => `${i+1}. ${u}`).join('\n')}`
    : '';

  return `Extract all organisations from the text below that are hiring counsellors or need mental health support.

Return a JSON array only. Each item:
{
  "org_name": "Organisation name",
  "type": "${query.type}",
  "city": "City or empty string",
  "state": "State or empty string",
  "email": "",
  "phone": "",
  "notes": "Why they are a lead — mention which job board if known",
  "ai_score": <40-95>,
  "source_url": "Exact job posting URL from Naukri/LinkedIn/Indeed/etc if available, else empty string",
  "source_platform": "Name of job board: Naukri | LinkedIn | Indeed | TimesJobs | Shine | Foundit | Glassdoor | or empty",
  "target_role": "${query.target_role}",
  "job_title_hiring_for": "Role being hired for",
  "discovery_source": "${query.platform}",
  "discovery_query": "${query.q.replace(/"/g, '\\"')}"
}

Scoring: 85-95 = has real job board URL + contact; 70-84 = has real job board URL; 55-69 = name + city only; 40-54 = name only.
For source_url: prefer Naukri, LinkedIn, Indeed URLs over company websites. Use the provided source URLs list to match.
For source_platform: derive from the URL (e.g. naukri.com → "Naukri", linkedin.com → "LinkedIn").
Include orgs even without a URL. Skip only if org_name is unknown.
Return [] if nothing found.
${urlContext}

TEXT:
${text}

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
    if (!norm || norm.length < 3) return false;
    const safe = norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const [inPipeline, inQueue] = await Promise.all([
      Lead().findOne({ org_name: { $regex: new RegExp(safe, 'i') } }).select('_id').lean().catch(() => null),
      LeadQueue().findOne({ org_name: { $regex: new RegExp(safe, 'i') }, status: 'pending' }).select('_id').lean().catch(() => null),
    ]);
    return !!(inPipeline || inQueue);
  } catch { return false; }
}

async function saveLead(raw, query, groundingUrls) {
  if (!raw.org_name || raw.org_name.trim().length < 2) return null;
  if (await isDuplicate(raw.org_name)) return null;

  try {
    // ── Determine source URL ──────────────────────────────────────────────
    // Priority: extracted URL > grounding URL that mentions org name > Google fallback
    let sourceUrl = raw.source_url || '';

    // If no URL from extraction, try to find a relevant grounding URL
    if (!sourceUrl && groundingUrls.length > 0) {
      const orgWords = normalise(raw.org_name).split(' ').filter(w => w.length > 3);
      // Try to find a grounding URL that contains the org name words
      const matched = groundingUrls.find(u => {
        const ul = u.toLowerCase();
        return orgWords.some(w => ul.includes(w));
      });
      sourceUrl = matched || groundingUrls[0] || ''; // fallback to first grounding URL
    }

    // Last resort: Google search fallback
    if (!sourceUrl) {
      sourceUrl = `https://www.google.com/search?q=${encodeURIComponent(raw.org_name + ' counsellor hiring India')}`;
    }

    // ── Determine source platform ─────────────────────────────────────────
    const sourcePlatform = raw.source_platform || platformFromUrl(sourceUrl) || query.platform;

    // ── Build enriched notes ──────────────────────────────────────────────
    const platformNote = sourcePlatform && sourcePlatform !== query.platform
      ? `[Posted on ${sourcePlatform}] ` : '';
    const notes = platformNote + (raw.notes || '');

    return await LeadQueue().create({
      org_name:              raw.org_name.trim(),
      type:                  raw.type     || query.type,
      city:                  raw.city     || '',
      state:                 raw.state    || '',
      contact_name:          '',
      role:                  '',
      email:                 raw.email    || '',
      phone:                 raw.phone    || '',
      employees_or_students: Number(raw.employees_or_students) || 0,
      notes,
      ai_score:              Math.min(Math.max(Number(raw.ai_score) || 50, 0), 100),
      source_url:            sourceUrl,
      target_role:           raw.target_role          || query.target_role,
      job_title_hiring_for:  raw.job_title_hiring_for || '',
      discovery_source:      raw.discovery_source     || query.platform,
      discovery_query:       query.q,
      status:                'pending',
    });
  } catch(e) {
    if (e.code === 11000) return null;
    console.error('[Discovery] saveLead error:', e.message);
    return null;
  }
}

async function runQuery(query, ai) {
  const saved = [];
  try {
    console.log(`[Discovery] ${query.platform} | ${query.type} | ${query.region}`);

    // Step 1: Grounded search — captures source URLs from Google Search
    const searchResp = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: buildSearchPrompt(query),
      config: { tools: [{ googleSearch: {} }] },
    });
    const narrative = searchResp.text;

    // ── Extract actual source URLs from grounding metadata ────────────────
    const groundingUrls = extractGroundingUrls(searchResp);
    console.log(`[Discovery]   search: ${(narrative||'').length} chars | grounding URLs: ${groundingUrls.length}`);
    if (groundingUrls.length > 0) {
      groundingUrls.slice(0, 5).forEach(u => console.log(`[Discovery]     src: ${u}`));
    }

    if (!narrative || narrative.length < 60) {
      console.log(`[Discovery]   empty result — skipping`);
      return saved;
    }

    // Step 2: Extract JSON — pass grounding URLs so Gemini can match them
    const extractResp = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: buildExtractionPrompt(narrative, query, groundingUrls),
    });
    let rawText = (extractResp.text || '').trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    // Handle wrapped object
    if (rawText.startsWith('{')) {
      const m = rawText.match(/\[[\s\S]*\]/);
      if (m) rawText = m[0];
    }

    let leads;
    try { leads = JSON.parse(rawText); }
    catch(e) {
      console.log(`[Discovery]   parse fail: ${e.message} | raw: ${rawText.substring(0,200)}`);
      return saved;
    }

    if (!Array.isArray(leads)) return saved;
    console.log(`[Discovery]   extracted ${leads.length} orgs`);

    let sv = 0, dup = 0, skip = 0;
    for (const lead of leads.slice(0, 10)) {
      if (!lead.org_name) { skip++; continue; }
      const doc = await saveLead(lead, query, groundingUrls);
      if (doc) {
        saved.push(doc);
        sv++;
        const plat = platformFromUrl(doc.source_url);
        console.log(`[Discovery]   ✓ ${doc.org_name} | ${plat || 'no source'} | score:${doc.ai_score}`);
      }
      else if (await isDuplicate(lead.org_name)) { dup++; }
      else { skip++; }
    }
    console.log(`[Discovery]   saved:${sv} dup:${dup} skip:${skip}`);
  } catch(e) {
    console.error(`[Discovery] ERROR [${query.platform}/${query.type}]: ${e.message}`);
  }
  return saved;
}

async function runDiscovery(batch) {
  const ai = getAI();
  if (!ai) { console.warn('[Discovery] No GEMINI_API_KEY'); return []; }

  console.log(`[Discovery] === SCAN START — ${batch.length} queries ===`);
  const all = [];
  for (const q of batch) {
    const saved = await runQuery(q, ai);
    all.push(...saved);
    await new Promise(r => setTimeout(r, 2000));
  }
  try { await DiscoveryLog().create({ queries_run: batch.length, leads_found: all.length, ran_at: new Date() }); } catch {}
  console.log(`[Discovery] === SCAN DONE — ${all.length} leads ===`);
  return all;
}

let _scanCount = 0;
async function runTestDiscovery() {
  _scanCount++;
  const groups = [
    QUERIES.filter(q => q.type === 'school'    && q.region.includes('Hyderabad')),
    QUERIES.filter(q => q.type === 'school'    && q.region.includes('Bengaluru')),
    QUERIES.filter(q => q.type === 'school'    && q.region.includes('Delhi')),
    QUERIES.filter(q => q.type === 'school'    && q.region.includes('Pan India') && q.platform === 'Job Boards'),
    QUERIES.filter(q => q.platform === 'Universities'),
    QUERIES.filter(q => q.type === 'corporate' && q.platform === 'Job Boards'),
    QUERIES.filter(q => q.type === 'corporate' && q.platform === 'News Signal'),
    QUERIES.filter(q => q.type === 'corporate' && q.platform === 'Funding Signal'),
    QUERIES.filter(q => q.type === 'corporate' && q.platform === 'GPTW Signal'),
    QUERIES.filter(q => ['clinic','ngo','coaching','rehab'].includes(q.type)),
  ];
  const subset = groups.map(g => g.length ? g[(_scanCount - 1) % g.length] : null).filter(Boolean);
  console.log(`[Discovery] Manual scan #${_scanCount} — ${subset.length} queries`);
  return runDiscovery(subset);
}

function startDiscoveryJobs() {
  if (!cron) return;
  try {
    cron.schedule('0 1 * * 1', () => runDiscovery(QUERIES).catch(console.error), { timezone: 'Asia/Kolkata' });
    cron.schedule('0 2 * * 3', () => runDiscovery(QUERIES.filter(q => q.type === 'corporate' || SIGNAL_PLATFORMS.includes(q.platform))).catch(console.error), { timezone: 'Asia/Kolkata' });
    cron.schedule('0 3 * * 5', () => runDiscovery(QUERIES.filter(q => q.platform === 'Social Media')).catch(console.error), { timezone: 'Asia/Kolkata' });
    cron.schedule('0 4 * * 6', () => runDiscovery(QUERIES.filter(q => q.platform === 'Universities' || q.platform === 'GPTW Signal')).catch(console.error), { timezone: 'Asia/Kolkata' });
    console.log('[Discovery] Cron: Mon(full) Wed(corp) Fri(social) Sat(uni)');
  } catch(e) { console.error('[Discovery] Cron:', e.message); }
}

module.exports = { startDiscoveryJobs, runDiscovery, runTestDiscovery, QUERIES };
