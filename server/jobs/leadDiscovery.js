const cron = require('node-cron');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const LeadQueue = require('../models/LeadQueue');
const Lead = require('../models/Lead');
const DiscoveryLog = require('../models/DiscoveryLog');
const { sendRadarDiscoveryEmail } = require('../services/emailService');
const levenshtein = require('fast-levenshtein');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─── Query Bank ───────────────────────────────────────────────────────────────
// Each query tagged: target_role (who to approach), type, region
// South India = Telangana, AP, Karnataka, Tamil Nadu, Kerala — priority
// All India coverage included

const QUERIES = [
  // ── SCHOOLS / COACHING ──────────────────────────────────────────────────
  {
    q: 'site:schoolmykids.com OR site:cbse.gov.in CBSE schools Hyderabad Telangana student counsellor mental health 2025',
    target_role: 'Principal / Vice Principal',
    type: 'school', region: 'Telangana',
  },
  {
    q: 'site:justdial.com special education autism ADHD school Hyderabad Secunderabad contact principal phone',
    target_role: 'Principal / Special Education Coordinator',
    type: 'school', region: 'Telangana',
  },
  {
    q: 'CBSE ICSE schools Bangalore Karnataka NEP 2020 student wellbeing counsellor vacancy 2025',
    target_role: 'Principal / Counselling Coordinator',
    type: 'school', region: 'Karnataka',
  },
  {
    q: 'schools Chennai Tamil Nadu student mental health counsellor CBSE ICSE 2025 special education',
    target_role: 'Principal / Vice Principal',
    type: 'school', region: 'Tamil Nadu',
  },
  {
    q: 'schools Kerala Kochi Trivandrum student wellbeing counsellor NEP 2020 mental health program',
    target_role: 'Principal / Counselling Head',
    type: 'school', region: 'Kerala',
  },
  {
    q: 'residential boarding schools Hyderabad Pune Mumbai student mental health counselling 500+ students 2025',
    target_role: 'Principal / Dean of Students',
    type: 'school', region: 'South India / Maharashtra',
  },
  {
    q: 'IIT JEE NEET coaching institute Hyderabad Chennai Bangalore student psychology anxiety wellness 2025',
    target_role: 'Centre Director / Academic Head',
    type: 'coaching', region: 'South India',
  },
  {
    q: 'special education autism ADHD learning disability schools Bangalore Hyderabad Chennai 2025 psychologist',
    target_role: 'Founder / Special Education Director',
    type: 'school', region: 'South India',
  },
  {
    q: 'Navodaya Vidyalaya Kendriya Vidyalaya Telangana Andhra Pradesh Karnataka school counsellor program',
    target_role: 'Principal / Counselling Coordinator',
    type: 'school', region: 'South India',
  },
  {
    q: 'CBSE schools Delhi NCR Pune Mumbai student mental health wellbeing counsellor NEP 2020 2025',
    target_role: 'Principal / Vice Principal',
    type: 'school', region: 'North / West India',
  },

  // ── CORPORATES ──────────────────────────────────────────────────────────
  {
    q: 'site:linkedin.com/company IT companies Hyderabad HITEC City employee mental health EAP HR head 2025',
    target_role: 'HR Head / CHRO / People & Culture Head',
    type: 'corporate', region: 'Telangana',
  },
  {
    q: 'companies Hyderabad Bangalore employee assistance program EAP mental health wellbeing HR 2025',
    target_role: 'HR Head / CHRO / Wellness Manager',
    type: 'corporate', region: 'South India',
  },
  {
    q: 'BPO call center Hyderabad Bangalore Chennai employee burnout mental health counsellor wellness 2025',
    target_role: 'HR Director / People Operations Head',
    type: 'corporate', region: 'South India',
  },
  {
    q: 'hospitals healthcare organisations Hyderabad Bangalore nurse doctor mental health EAP program 2025',
    target_role: 'HR Head / Medical Director',
    type: 'corporate', region: 'South India',
  },
  {
    q: 'GCC global capability centre Hyderabad Bangalore employee mental health EAP CHRO wellness 2025',
    target_role: 'CHRO / HR Director / Employee Experience Head',
    type: 'corporate', region: 'South India',
  },
  {
    q: 'pharmaceutical manufacturing company Hyderabad Genome Valley employee counselling EAP HR 2025',
    target_role: 'HR Head / Plant HR Manager',
    type: 'corporate', region: 'Telangana',
  },
  {
    q: 'companies Pune Mumbai Delhi NCR employee mental health EAP CHRO wellbeing initiative 2025',
    target_role: 'CHRO / HR Director / Wellness Lead',
    type: 'corporate', region: 'North / West India',
  },

  // ── CLINICS & NGOs ──────────────────────────────────────────────────────
  {
    q: 'site:practo.com OR site:justdial.com psychology clinic Hyderabad Bangalore Chennai psychologist 2025',
    target_role: 'Founder / Lead Psychologist / Clinical Director',
    type: 'clinic', region: 'South India',
  },
  {
    q: 'NGO mental health child welfare special education Hyderabad Telangana Andhra Pradesh 2025',
    target_role: 'Programme Director / CEO / Founder',
    type: 'ngo', region: 'South India',
  },
  {
    q: 'rehabilitation centre disability special needs Hyderabad Bangalore Chennai therapist psychologist 2025',
    target_role: 'Centre Director / Head Therapist / Founder',
    type: 'rehab', region: 'South India',
  },
  {
    q: 'child psychology ADHD autism assessment therapy centre Hyderabad Bangalore Chennai Pune 2025',
    target_role: 'Founder / Lead Psychologist',
    type: 'clinic', region: 'South India',
  },
];

// ─── Prompts ──────────────────────────────────────────────────────────────────

function buildSearchPrompt(queryObj) {
  return `You are a verified B2B lead researcher for Cittaa Health Services — mental health & special education tech.

SEARCH: "${queryObj.q}"
REGION: ${queryObj.region}
ROLE TO APPROACH: ${queryObj.target_role}

Use Google Search to find REAL organisations. For each verified org include:
- Official name (as on their website)
- Category: school / corporate / clinic / ngo / rehab / coaching
- City, State (India)
- Size (students or employees)
- Decision-maker: name + title (${queryObj.target_role})
- EMAIL: from official contact page, LinkedIn, JustDial
- PHONE: from Google Maps, JustDial, official site
- EXACT URL of page you verified them on (official website or directory listing)
- Why they need Cittaa right now (specific gap: no counsellor, NEP compliance, EAP gap, burnout)

STRICT RULES:
- Only include orgs with a real verifiable URL
- Skip any org you cannot find online
- No made-up names
- Priority region: ${queryObj.region}
- Find 4-5 real verified organisations`;
}

function buildExtractionPrompt(searchText, queryObj) {
  return `Extract verified B2B leads as a JSON array.

Research:
"""
${searchText}
"""

Target role to approach: ${queryObj.target_role}
Lead type: ${queryObj.type}

Types: "school" | "corporate" | "clinic" | "ngo" | "rehab" | "coaching"
Annual value: school<500=150000, 500-2000=300000, 2000+=600000; corp200-500=250000, 500-2000=500000, 2000+=1200000; clinic/ngo/rehab=120000

Return ONLY JSON array. Each item EXACTLY:
{
  "org_name": "official name",
  "type": "school|corporate|clinic|ngo|rehab|coaching",
  "city": "city",
  "state": "state",
  "contact_name": "name or null",
  "role": "their actual job title or null",
  "target_role": "${queryObj.target_role}",
  "email": "email or null",
  "phone": "phone or null",
  "employees_or_students": <number or null>,
  "estimated_annual_value_inr": <number>,
  "why_good_lead": "specific reason they need Cittaa now",
  "source_url": "actual URL verifying this org — mandatory",
  "discovery_query": "${queryObj.q}"
}

RULES:
- target_role MUST be "${queryObj.target_role}"
- source_url is the real website/directory page
- Start [, end ]. No markdown. If none: []`;
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
        email: lead.email || null,
        phone: lead.phone || null,
        employees_or_students: lead.employees_or_students || null,
        estimated_value: lead.estimated_annual_value_inr || 0,
        ai_score: score,
        ai_reasoning: reasoning,
        why_good_lead: lead.why_good_lead || null,
        source_url: lead.source_url || null,
        discovery_query: queryObj.q,
        discovery_source: 'google_search',
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
