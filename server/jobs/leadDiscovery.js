const cron = require('node-cron');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const LeadQueue = require('../models/LeadQueue');
const Lead = require('../models/Lead');
const DiscoveryLog = require('../models/DiscoveryLog');
const { sendRadarDiscoveryEmail } = require('../services/emailService');
const levenshtein = require('fast-levenshtein');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─── Query Bank ───────────────────────────────────────────────────────────────
// ALL queries target JOB POSTINGS on LinkedIn, Naukri, Indeed, Shine, Glassdoor
// Logic: if a company is HIRING for a counsellor / wellness role → they need Cittaa
// source_url = the actual job post = 100% authentic, verifiable lead
//
// target_role = person who APPROVED the job post (the decision-maker to approach)
// South India priority: Telangana, AP, Karnataka, Tamil Nadu, Kerala

const QUERIES = [
  // ── SCHOOLS — hiring school counsellor / psychologist ─────────────────────
  {
    q: 'site:naukri.com "school counsellor" OR "school psychologist" Hyderabad Telangana 2024 2025',
    target_role: 'Principal / Vice Principal',
    type: 'school', region: 'Telangana',
    platform: 'Naukri',
  },
  {
    q: 'site:linkedin.com/jobs "school counsellor" OR "student counsellor" Hyderabad Bangalore Chennai 2025',
    target_role: 'Principal / Vice Principal',
    type: 'school', region: 'South India',
    platform: 'LinkedIn Jobs',
  },
  {
    q: 'site:naukri.com "special educator" OR "special education teacher" Hyderabad Bangalore Chennai Pune 2025',
    target_role: 'Principal / Special Education Coordinator',
    type: 'school', region: 'South India',
    platform: 'Naukri',
  },
  {
    q: 'site:shine.com "school counsellor" OR "student wellbeing" Hyderabad Secunderabad Bangalore 2025',
    target_role: 'Principal / Counselling Coordinator',
    type: 'school', region: 'South India',
    platform: 'Shine',
  },
  {
    q: 'site:naukri.com "child psychologist" OR "counselling psychologist" school Hyderabad Chennai Bangalore 2025',
    target_role: 'Principal / Founder',
    type: 'school', region: 'South India',
    platform: 'Naukri',
  },
  {
    q: 'site:indeed.com "school counsellor" OR "student mental health" India 2025',
    target_role: 'Principal / Vice Principal',
    type: 'school', region: 'All India',
    platform: 'Indeed',
  },
  {
    q: 'site:naukri.com "school counsellor" OR "student counsellor" Chennai Tamil Nadu Kerala 2025',
    target_role: 'Principal / Counselling Head',
    type: 'school', region: 'Tamil Nadu / Kerala',
    platform: 'Naukri',
  },

  // ── COACHING INSTITUTES — hiring student wellness / psychologist ───────────
  {
    q: 'site:naukri.com "student counsellor" OR "psychologist" "coaching institute" OR "coaching center" Hyderabad Kota 2025',
    target_role: 'Centre Director / Academic Head',
    type: 'coaching', region: 'South India / Rajasthan',
    platform: 'Naukri',
  },
  {
    q: 'site:linkedin.com/jobs "student wellness" OR "student counsellor" coaching institute Hyderabad Bangalore 2025',
    target_role: 'Centre Director / Academic Head',
    type: 'coaching', region: 'South India',
    platform: 'LinkedIn Jobs',
  },

  // ── CORPORATES — hiring EAP / wellness / mental health counsellor ──────────
  {
    q: 'site:naukri.com "employee assistance program" OR "EAP counsellor" OR "employee wellness" Hyderabad 2025',
    target_role: 'HR Head / CHRO / People & Culture Head',
    type: 'corporate', region: 'Telangana',
    platform: 'Naukri',
  },
  {
    q: 'site:linkedin.com/jobs "employee wellness" OR "workplace mental health" OR "EAP" Hyderabad Bangalore 2025',
    target_role: 'CHRO / HR Director / Employee Experience Head',
    type: 'corporate', region: 'South India',
    platform: 'LinkedIn Jobs',
  },
  {
    q: 'site:naukri.com "wellbeing manager" OR "mental health counsellor" corporate Bangalore Hyderabad Chennai 2025',
    target_role: 'HR Head / Wellness Manager',
    type: 'corporate', region: 'South India',
    platform: 'Naukri',
  },
  {
    q: 'site:shine.com "employee counsellor" OR "HR wellness" OR "workplace counsellor" Hyderabad Bangalore 2025',
    target_role: 'HR Director / People Operations Head',
    type: 'corporate', region: 'South India',
    platform: 'Shine',
  },
  {
    q: 'site:naukri.com "employee assistance" OR "EAP" counsellor IT company Hyderabad Bangalore Pune 2025',
    target_role: 'CHRO / HR Head',
    type: 'corporate', region: 'South India / Maharashtra',
    platform: 'Naukri',
  },
  {
    q: 'site:glassdoor.com "mental health counsellor" OR "employee wellness" job India 2025',
    target_role: 'CHRO / HR Director',
    type: 'corporate', region: 'All India',
    platform: 'Glassdoor',
  },
  {
    q: 'site:naukri.com "wellness coordinator" OR "wellbeing lead" hospital healthcare Hyderabad Bangalore 2025',
    target_role: 'HR Head / Medical Director',
    type: 'corporate', region: 'South India',
    platform: 'Naukri',
  },
  {
    q: 'site:linkedin.com/jobs "mental health" OR "EAP" OR "employee wellbeing" Pune Mumbai Delhi 2025',
    target_role: 'CHRO / HR Director / Wellness Lead',
    type: 'corporate', region: 'North / West India',
    platform: 'LinkedIn Jobs',
  },

  // ── CLINICS & NGOs — hiring psychologist / therapist ─────────────────────
  {
    q: 'site:naukri.com "clinical psychologist" OR "counselling psychologist" clinic Hyderabad Bangalore Chennai 2025',
    target_role: 'Founder / Lead Psychologist / Clinical Director',
    type: 'clinic', region: 'South India',
    platform: 'Naukri',
  },
  {
    q: 'site:linkedin.com/jobs "psychologist" OR "therapist" NGO OR "non-profit" mental health Hyderabad Bangalore 2025',
    target_role: 'Programme Director / CEO / Founder',
    type: 'ngo', region: 'South India',
    platform: 'LinkedIn Jobs',
  },
  {
    q: 'site:naukri.com "occupational therapist" OR "special educator" rehabilitation centre Hyderabad Bangalore Chennai 2025',
    target_role: 'Centre Director / Head Therapist / Founder',
    type: 'rehab', region: 'South India',
    platform: 'Naukri',
  },
  {
    q: 'site:naukri.com "child psychologist" OR "ADHD" OR "autism therapist" clinic centre Hyderabad Bangalore Pune 2025',
    target_role: 'Founder / Lead Psychologist',
    type: 'clinic', region: 'South India',
    platform: 'Naukri',
  },
  {
    q: 'site:indeed.com "psychologist" OR "mental health counsellor" NGO rehab clinic India 2025',
    target_role: 'Founder / Programme Director',
    type: 'clinic', region: 'All India',
    platform: 'Indeed',
  },
];

// ─── Prompts ──────────────────────────────────────────────────────────────────

function buildSearchPrompt(queryObj) {
  return `You are a B2B lead researcher for Cittaa Health Services — mental health & special education technology.

Cittaa's insight: Any organisation ACTIVELY HIRING for a counsellor, psychologist, EAP manager, or wellness role is a HOT lead — they clearly need mental health support but are still building it manually. Cittaa's platform can scale and augment that.

SEARCH TASK: "${queryObj.q}"
PLATFORM: ${queryObj.platform || 'Job platforms (Naukri, LinkedIn Jobs, Indeed, Shine, Glassdoor)'}
REGION FOCUS: ${queryObj.region}
DECISION-MAKER TO APPROACH: ${queryObj.target_role}

Using Google Search, find REAL active job postings matching this search. For each job posting found:
1. Extract the HIRING COMPANY name (this is the lead)
2. Find the company's official website
3. Note the job title they are hiring for (proof they need Cittaa)
4. Find the decision-maker who would have approved this hire: ${queryObj.target_role}
5. Get their email/phone from LinkedIn company page, official website, JustDial, or Google Maps
6. Get the DIRECT URL of the job posting (Naukri/LinkedIn/Indeed link) — this is the source_url

For each verified lead report:
- Company name (official)
- Type: school / corporate / clinic / ngo / rehab / coaching
- City, State
- Size (approx students or employees)
- Job title being hired (e.g. "School Counsellor", "EAP Counsellor", "Wellness Manager")
- Decision-maker name + title (${queryObj.target_role}) if findable
- Email + phone (from their official website or directory)
- The job posting URL
- Why this makes them a perfect Cittaa lead

RULES:
- Only real job postings — skip anything you cannot verify
- The source_url MUST be the actual job post URL (naukri.com/..., linkedin.com/jobs/..., etc.)
- Region priority: ${queryObj.region}
- Find 4-5 real verified leads`;
}

function buildExtractionPrompt(searchText, queryObj) {
  return `Extract B2B leads from these job posting search results as a JSON array.

Job postings found:
"""
${searchText}
"""

CONTEXT: Each job posting = a company that needs Cittaa's mental health / special education tech.
Platform searched: ${queryObj.platform || 'Job platforms'}
Decision-maker to approach: ${queryObj.target_role}

Types: "school" | "corporate" | "clinic" | "ngo" | "rehab" | "coaching"
Annual value: school<500=150000, 500-2000=300000, 2000+=600000; corp200-500=250000, 500-2000=500000, 2000+=1200000; clinic/ngo/rehab=120000

Return ONLY a JSON array. Each item EXACTLY:
{
  "org_name": "hiring company official name",
  "type": "school|corporate|clinic|ngo|rehab|coaching",
  "city": "city",
  "state": "state",
  "job_title_hiring_for": "exact job title they posted (e.g. School Counsellor, EAP Manager)",
  "contact_name": "decision-maker name or null",
  "role": "contact's actual job title or null",
  "target_role": "${queryObj.target_role}",
  "email": "email or null",
  "phone": "phone or null",
  "employees_or_students": <number or null>,
  "estimated_annual_value_inr": <number>,
  "why_good_lead": "they are actively hiring for [job_title] — proof they need mental health support but building it manually; Cittaa can scale this",
  "source_url": "direct URL of the job posting on Naukri/LinkedIn/Indeed/Shine — mandatory",
  "discovery_query": "${queryObj.q}"
}

CRITICAL:
- source_url = the actual job post URL (e.g. naukri.com/job-listings/..., linkedin.com/jobs/view/...)
- target_role always = "${queryObj.target_role}"
- why_good_lead must mention the job title they're hiring for
- Start [, end ]. No markdown. If no verified postings found: []`;
}

function buildScoringPrompt(lead) {
  return `Score this B2B lead for Cittaa Health Services (0-100).

${lead.type} — ${lead.org_name}, ${lead.city}, ${lead.state}
Size: ${lead.employees_or_students || 'unknown'} | Contract: Rs.${lead.estimated_annual_value_inr || 0}
Target role: ${lead.target_role} | Contact: ${lead.contact_name || 'none'}
Email: ${lead.email ? 'yes' : 'no'} | Phone: ${lead.phone ? 'yes' : 'no'}
Source: ${lead.source_url ? 'verified' : 'unverified'}
Reason: ${lead.why_good_lead || 'unknown'}

Scoring:
+30 South India (Telangana/AP/Karnataka/Tamil Nadu/Kerala)
+15 special ed / autism / ADHD
+15 no counsellor / actively seeking MH support
+10 large (2000+ students or 500+ employees)
+10 high value (Rs.5L+)
+10 verified source URL
+5 email or phone found
+5 contact name found
-10 outside South India
-20 irrelevant to mental health

Respond ONLY: {"score": <0-100>, "reasoning": "<one sentence>"}`;
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parseLeadsFromResponse(text) {
  if (!text) return [];
  const clean = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
                    .replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  for (const s of [clean, text]) {
    const si = s.indexOf('['), ei = s.lastIndexOf(']');
    if (si !== -1 && ei > si) {
      try { const p = JSON.parse(s.slice(si, ei + 1)); if (Array.isArray(p)) return p; } catch {}
    }
  }
  const objs = []; const re = /\{[^{}]*"org_name"[^{}]*\}/g; let m;
  while ((m = re.exec(clean)) !== null) { try { objs.push(JSON.parse(m[0])); } catch {} }
  return objs;
}

function parseScore(text) {
  if (!text) return { score: 50, reasoning: 'error' };
  const clean = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
                    .replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try { const s = clean.indexOf('{'), e = clean.lastIndexOf('}'); if (s !== -1) return JSON.parse(clean.slice(s, e + 1)); } catch {}
  const m = clean.match(/"score"\s*:\s*(\d+)/);
  return { score: m ? parseInt(m[1]) : 50, reasoning: 'extracted' };
}

// ─── Dedup ────────────────────────────────────────────────────────────────────

async function isDuplicate(orgName) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [q, l] = await Promise.all([
    LeadQueue.find({ discovered_at: { $gte: since } }).select('org_name').lean(),
    Lead.find({ created_at: { $gte: since } }).select('org_name').lean(),
  ]);
  const all = [...q, ...l].map(x => x.org_name.toLowerCase().trim());
  const name = orgName.toLowerCase().trim();
  return all.some(n => levenshtein.get(n, name) < 4);
}

// ─── Run single query ─────────────────────────────────────────────────────────

async function runQuery(queryObj) {
  const searchModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', tools: [{ googleSearch: {} }], generationConfig: { temperature: 0.2 } });
  const extractModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { temperature: 0.1 } });
  const scoreModel   = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { temperature: 0.1 } });

  console.log(`[Radar] Query → role:${queryObj.target_role} | region:${queryObj.region}`);
  console.log(`[Radar]   "${queryObj.q.slice(0,80)}"`);

  const sr = await searchModel.generateContent(buildSearchPrompt(queryObj));
  const searchText = sr.response.text();
  if (!searchText || searchText.length < 80) { console.log('[Radar] Empty result'); return []; }

  const er = await extractModel.generateContent(buildExtractionPrompt(searchText, queryObj));
  const rawLeads = parseLeadsFromResponse(er.response.text());
  console.log(`[Radar] ${rawLeads.length} leads parsed`);

  const saved = [];
  for (const lead of rawLeads) {
    if (!lead.org_name || lead.org_name.length < 3) continue;
    if (!lead.source_url) { console.log(`[Radar] Skip (no source_url): ${lead.org_name}`); continue; }
    if (await isDuplicate(lead.org_name)) { console.log(`[Radar] Duplicate: ${lead.org_name}`); continue; }

    const scr = await scoreModel.generateContent(buildScoringPrompt(lead));
    const { score, reasoning } = parseScore(scr.response.text());
    if (score < 30) { console.log(`[Radar] Low score (${score}): ${lead.org_name}`); continue; }

    try {
      const item = await LeadQueue.create({
        org_name: lead.org_name,
        type: lead.type || 'corporate',
        city: lead.city || null,
        state: lead.state || null,
        contact_name: lead.contact_name || null,
        role: lead.role || null,
        target_role: lead.target_role || queryObj.target_role,
        job_title_hiring_for: lead.job_title_hiring_for || null,
        email: lead.email || null,
        phone: lead.phone || null,
        employees_or_students: lead.employees_or_students || null,
        estimated_value: lead.estimated_annual_value_inr || 0,
        ai_score: score,
        ai_reasoning: reasoning,
        why_good_lead: lead.why_good_lead || null,
        source_url: lead.source_url || null,
        discovery_query: queryObj.q,
        discovery_source: queryObj.platform ? `${queryObj.platform} job posting` : 'google_search',
        status: 'pending',
        discovered_at: new Date(),
      });
      saved.push(item);
      console.log(`[Radar] Saved: ${lead.org_name} | score:${score} | role:${lead.target_role || queryObj.target_role}`);
      console.log(`[Radar]   source: ${lead.source_url}`);
    } catch (e) { if (e.code !== 11000) console.error('[Radar] Save error:', e.message); }
  }
  return saved;
}

// ─── Full run ─────────────────────────────────────────────────────────────────

async function runDiscovery(batch) {
  const queries = batch || QUERIES;
  const allSaved = [];
  console.log(`[Radar] Starting — ${queries.length} queries`);
  for (const q of queries) {
    try { const s = await runQuery(q); allSaved.push(...s); await new Promise(r => setTimeout(r, 4000)); }
    catch (e) { console.error('[Radar] Query error:', e.message); }
  }
  try { await DiscoveryLog.create({ queries_run: queries.length, leads_found: allSaved.length, timestamp: new Date() }); } catch {}
  if (allSaved.length > 0) sendRadarDiscoveryEmail(allSaved).catch(e => console.error('[Radar] Email:', e.message));
  console.log(`[Radar] Done — ${allSaved.length} saved`);
  return allSaved;
}

// ─── Debug ────────────────────────────────────────────────────────────────────

async function runTestDiscovery() {
  const q = QUERIES[0];
  const sm = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', tools: [{ googleSearch: {} }], generationConfig: { temperature: 0.2 } });
  const em = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { temperature: 0.1 } });
  const sr = await sm.generateContent(buildSearchPrompt(q));
  const searchText = sr.response.text();
  const er = await em.generateContent(buildExtractionPrompt(searchText, q));
  const extractText = er.response.text();
  return { query: q, raw_search: searchText.slice(0, 2000), raw_extract: extractText.slice(0, 2000), parsed: parseLeadsFromResponse(extractText) };
}

// ─── Cron ─────────────────────────────────────────────────────────────────────

function startDiscoveryJobs() {
  cron.schedule('0 */6 * * *', async () => {
    const south = QUERIES.filter(q => ['Telangana','Karnataka','Tamil Nadu','Kerala','South India','AP'].some(r => q.region.includes(r)));
    const rest  = QUERIES.filter(q => !south.includes(q));
    const batch = [...south.sort(() => Math.random()-0.5).slice(0,3), ...rest.sort(() => Math.random()-0.5).slice(0,1)];
    await runDiscovery(batch);
  });
  cron.schedule('0 1 * * 1', () => runDiscovery(QUERIES), { timezone: 'Asia/Kolkata' });
  console.log('[Radar] Jobs scheduled (6h scan + Monday full scan)');
}

module.exports = { startDiscoveryJobs, runDiscovery, runTestDiscovery };
