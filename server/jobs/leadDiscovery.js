const cron = require('node-cron');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const LeadQueue = require('../models/LeadQueue');
const Lead = require('../models/Lead');
const DiscoveryLog = require('../models/DiscoveryLog');
const { sendRadarDiscoveryEmail } = require('../services/emailService');

const levenshtein = require('fast-levenshtein');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─── Discovery Queries ───────────────────────────────────────────────────────
// Covers: school websites, LinkedIn-style people searches, job boards,
//         corporate HR databases, and general web search

const SCHOOL_QUERIES = [
  // Direct school website / directory sources
  'site:schoolmykids.com OR site:cbse.gov.in schools Hyderabad Telangana 1000+ students',
  'site:indiaschoolinfo.com OR site:schoolserp.com CBSE ICSE schools Hyderabad list',
  'list of private CBSE ICSE schools Hyderabad with 1000+ students 2024 2025',
  'new schools opening Hyderabad Telangana 2024 2025 admissions',
  'top international schools Hyderabad Secunderabad contact principal',
  'DPS affiliated schools Hyderabad Telangana site:dpsbharat.com OR site:dps.in',
  'CBSE schools Hyderabad student strength above 2000 school counsellor vacant',
  'private schools Hyderabad not yet using student mental health wellness program',
  // Job-board sourced: schools hiring counsellors = no counsellor yet
  'site:naukri.com OR site:shine.com school counsellor psychologist Hyderabad hiring 2024 2025',
  'site:linkedin.com/jobs school counsellor Hyderabad principal HR contact',
  'CBSE ICSE schools Gachibowli Kompally Bachupally Kokapet Hyderabad 2024',
  'international baccalaureate IB schools Hyderabad Telangana 2024',
];

const CORP_QUERIES = [
  // LinkedIn company search style queries
  'site:linkedin.com/company HR head CHRO wellness Hyderabad Telangana 500+ employees',
  'site:linkedin.com HR Manager employee wellness program Hyderabad hiring 2024',
  // Job boards sourced: companies hiring wellness/EAP roles = no program yet
  'site:naukri.com OR site:shine.com employee wellness mental health Hyderabad 2024 2025',
  'site:instahyre.com OR site:foundit.in CHRO HR director Hyderabad corporate wellness',
  // General company databases
  'IT companies Hyderabad HITEC City Cyberabad 500+ employees HR contact 2024 2025',
  'Telangana companies employee wellness EAP mental health program 2024',
  'T-Hub TASK WE-Hub funded startups Hyderabad 200+ employees 2024 2025',
  'MNCs Hyderabad SEZ special economic zone employee strength HR head',
  'pharmaceutical manufacturing companies Hyderabad Genome Valley 1000+ employees',
  'Hyderabad companies best employer award 2024 employee wellbeing',
  'GCCs global capability centres Hyderabad Telangana 2024 HR head wellness',
  'site:ambitionbox.com OR site:glassdoor.com companies Hyderabad employee wellbeing reviews',
];

// ─── Discovery Prompt ────────────────────────────────────────────────────────

function buildDiscoveryPrompt(query) {
  return `You are a B2B sales intelligence agent for Cittaa Health Services, a mental health technology company based in Hyderabad, India.

Search the web for: "${query}"

Return a JSON array of leads found. For each lead return:
{
  "org_name": "exact organisation name",
  "type": "school or corporate",
  "city": "city name",
  "state": "state name",
  "contact_name": "decision maker name if found, else null",
  "role": "Principal / HR Head / CHRO etc",
  "email": "if publicly available, else null",
  "phone": "if publicly available, else null",
  "employees_or_students": estimated number as integer,
  "estimated_annual_value_inr": estimated Cittaa contract value in rupees,
  "why_good_lead": "1-2 sentence reason this is a good prospect for Cittaa",
  "source_url": "URL where this was found"
}

Rules:
- Only return organisations in India, preferably Hyderabad/Telangana
- For schools: must have 500+ students
- For corporates: must have 200+ employees
- Return maximum 5 leads per query
- Return ONLY valid JSON array, no explanation text`;
}

// ─── Scoring Prompt ──────────────────────────────────────────────────────────

function buildScoringPrompt(lead) {
  return `Score this lead for Cittaa Health Services (0–100). Higher = better prospect.

Lead: ${lead.type} - ${lead.org_name}, ${lead.city}
Size: ${lead.employees_or_students || 'unknown'}
Estimated contract value: ₹${lead.estimated_annual_value_inr || 0}

Scoring criteria:
+20 if Hyderabad/Telangana based
+15 if large institution (3000+ students or 1000+ employees)
+10 if known/reputable brand
+10 if high contract value (₹10L+)
+10 if decision-maker contact found
+5 if email/phone available
-10 if outside Telangana
-20 if very small (under 300 students / 100 employees)

Return ONLY a JSON object: {"score": <number>, "reasoning": "<one sentence>"}`;
}

// ─── Deduplication ───────────────────────────────────────────────────────────

async function isDuplicate(orgName) {
  const norm = orgName.trim().toLowerCase();
  const allNames = await Promise.all([
    Lead.find({}, 'org_name').lean(),
    LeadQueue.find({ status: { $in: ['pending', 'approved'] } }, 'org_name').lean(),
  ]);
  const allOrgs = [...allNames[0], ...allNames[1]].map((d) => d.org_name?.toLowerCase().trim());

  for (const existing of allOrgs) {
    if (!existing) continue;
    // Exact substring match
    if (existing.includes(norm) || norm.includes(existing)) return true;
    // Levenshtein distance
    if (levenshtein.get(norm, existing) <= 3) return true;
  }
  return false;
}

// ─── Parse JSON from Gemini response ─────────────────────────────────────────

function parseLeadsFromResponse(text) {
  try {
    // Strip markdown code fences if present
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start === -1 || end === -1) return [];
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return [];
  }
}

function parseScoreFromResponse(text) {
  try {
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) return { score: 50, reasoning: 'Unable to score' };
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return { score: 50, reasoning: 'Parse error' };
  }
}

// ─── Core Discovery Function ─────────────────────────────────────────────────

async function runDiscovery(queries = null) {
  const startTime = Date.now();
  const allQueries = queries || [...SCHOOL_QUERIES, ...CORP_QUERIES];
  // Pick 4 random queries to avoid hitting rate limits every run
  const selectedQueries = allQueries.sort(() => Math.random() - 0.5).slice(0, 4);

  const log = await DiscoveryLog.create({
    run_at: new Date(),
    queries_run: selectedQueries,
    status: 'running',
  });

  let totalFound = 0;
  let totalAdded = 0;
  let totalSkipped = 0;

  try {
    // Use Gemini with Google Search grounding
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      tools: [{ googleSearch: {} }],
    });

    const scoreModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    for (const query of selectedQueries) {
      console.log(`[Lead Discovery] Running query: ${query}`);
      try {
        const result = await model.generateContent(buildDiscoveryPrompt(query));
        const text = result.response.text();
        const leads = parseLeadsFromResponse(text);
        totalFound += leads.length;

        for (const lead of leads) {
          if (!lead.org_name || !lead.type) continue;

          // Dedup check
          const dup = await isDuplicate(lead.org_name);
          if (dup) {
            totalSkipped++;
            continue;
          }

          // Score the lead
          let score = 50;
          let reasoning = '';
          try {
            const scoreResult = await scoreModel.generateContent(buildScoringPrompt(lead));
            const scored = parseScoreFromResponse(scoreResult.response.text());
            score = Math.min(100, Math.max(0, scored.score || 50));
            reasoning = scored.reasoning || lead.why_good_lead || '';
          } catch (scoreErr) {
            reasoning = lead.why_good_lead || '';
          }

          await LeadQueue.create({
            type: lead.type === 'school' ? 'school' : 'corporate',
            org_name: lead.org_name,
            contact_name: lead.contact_name || null,
            role: lead.role || null,
            city: lead.city || '',
            state: lead.state || '',
            email: lead.email || null,
            phone: lead.phone || null,
            employees_or_students: lead.employees_or_students || null,
            estimated_value: lead.estimated_annual_value_inr || 0,
            ai_score: score,
            ai_reasoning: reasoning,
            discovery_source: 'google_search',
            discovery_query: query,
            source_url: lead.source_url || null,
            status: 'pending',
          });

          totalAdded++;
        }

        // Small delay between queries to be respectful of rate limits
        await new Promise((r) => setTimeout(r, 2000));
      } catch (queryErr) {
        console.error(`[Lead Discovery] Query failed: ${query}`, queryErr.message);
      }
    }

    await DiscoveryLog.findByIdAndUpdate(log._id, {
      leads_found: totalFound,
      leads_added_to_queue: totalAdded,
      duplicates_skipped: totalSkipped,
      status: 'success',
      duration_seconds: Math.round((Date.now() - startTime) / 1000),
    });

    console.log(`[Lead Discovery] Done — Found: ${totalFound}, Added: ${totalAdded}, Skipped: ${totalSkipped}`);

    // Email Sairam + Abhijay if new leads were added to the queue
    if (totalAdded > 0) {
      try {
        const newItems = await LeadQueue.find({ status: 'pending' })
          .sort({ discovered_at: -1 })
          .limit(totalAdded);
        await sendRadarDiscoveryEmail(newItems);
      } catch (emailErr) {
        console.error('[Lead Discovery] Email notification failed:', emailErr.message);
      }
    }
  } catch (err) {
    await DiscoveryLog.findByIdAndUpdate(log._id, {
      leads_found: totalFound,
      leads_added_to_queue: totalAdded,
      duplicates_skipped: totalSkipped,
      status: 'failed',
      error: err.message,
      duration_seconds: Math.round((Date.now() - startTime) / 1000),
    });
    console.error('[Lead Discovery] Critical error:', err);
  }
}

// ─── Weekly deep scan (all queries) ──────────────────────────────────────────

async function runWeeklyDeepScan() {
  console.log('[Lead Discovery] Running weekly deep scan with all queries...');
  await runDiscovery([...SCHOOL_QUERIES, ...CORP_QUERIES]);
}

// ─── Schedule ────────────────────────────────────────────────────────────────

function startCronJobs() {
  // Every 6 hours
  cron.schedule('0 */6 * * *', () => {
    console.log('[Lead Discovery] Cron triggered — every 6h');
    runDiscovery().catch(console.error);
  });

  // Every Monday at 9am (deep scan)
  cron.schedule('0 9 * * 1', () => {
    console.log('[Lead Discovery] Weekly deep scan triggered');
    runWeeklyDeepScan().catch(console.error);
  });

  console.log('[Lead Discovery] Cron jobs scheduled (6h interval + Monday 9am deep scan)');
}

module.exports = { runDiscovery, runWeeklyDeepScan, startCronJobs };
