const cron = require('node-cron');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const LeadQueue = require('../models/LeadQueue');
const Lead = require('../models/Lead');
const DiscoveryLog = require('../models/DiscoveryLog');
const { sendRadarDiscoveryEmail } = require('../services/emailService');
const levenshtein = require('fast-levenshtein');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─── Discovery Queries ────────────────────────────────────────────────────────
// Covers: school directories, LinkedIn-style, job boards (hiring counsellors/wellness =
// no program yet), corporate HR databases, GCCs, pharma, startups

const SCHOOL_QUERIES = [
  'top private CBSE ICSE schools Hyderabad Telangana 2025 with 1000+ students list',
  'new schools opening Hyderabad Telangana 2025 admissions principal contact',
  'international baccalaureate IB schools Hyderabad Secunderabad 2025',
  'DPS Delhi Public School affiliated Hyderabad Telangana student strength',
  'CBSE schools Gachibowli Kompally Bachupally Kokapet Hyderabad 2025',
  'schools Hyderabad hiring school counsellor psychologist 2025 job vacancy',
  'best private schools Hyderabad CBSE ICSE 2000+ students mental health program',
  'Hyderabad schools NEP 2020 student wellness counselling program requirement',
  'ICSE schools Secunderabad Begumpet Banjara Hills Jubilee Hills contact details 2025',
  'residential boarding schools Hyderabad Telangana 500+ students 2025',
];

const CORP_QUERIES = [
  'IT companies Hyderabad HITEC City Cyberabad 500+ employees HR contact 2025',
  'GCC global capability centres Hyderabad Telangana 2025 employee count HR head',
  'pharmaceutical companies Hyderabad Genome Valley 1000+ employees HR wellness',
  'companies Hyderabad hiring employee wellness EAP mental health manager 2025',
  'T-Hub WE-Hub TASK funded startups Hyderabad 200+ employees 2025',
  'MNC companies Hyderabad SEZ Cyberabad HR head employee strength 2025',
  'Telangana companies won best employer award employee wellbeing 2024 2025',
  'manufacturing companies Hyderabad 1000+ employees HR CHRO contact 2025',
  'Hyderabad companies employee burnout attrition mental health program initiative',
  'Indian IT services companies Hyderabad employee mental health wellness 2025',
];

// ─── Step 1: Search prompt (grounded — returns descriptive text) ──────────────

function buildSearchPrompt(query) {
  return `You are a B2B sales research assistant for Cittaa Health Services, a mental health technology company in Hyderabad, India.

Using Google Search, find real organisations matching this search: "${query}"

Provide a detailed report of what you found. For each organisation include:
- Organisation name
- Type (school or corporate)
- City and state
- Approximate size (number of students or employees)
- Any contact person found (name and role)
- Email or phone if publicly visible
- Why this is relevant to a mental health service provider

Focus on Hyderabad/Telangana. List up to 5 organisations. Be specific with real names.`;
}

// ─── Step 2: Extraction prompt (no grounding — converts text to JSON) ─────────

function buildExtractionPrompt(searchText, query) {
  return `Extract organisations from the following research report and return them as a JSON array.

Research report:
"""
${searchText}
"""

Return a JSON array. Each item must have these exact fields:
{
  "org_name": "full organisation name (string)",
  "type": "school" or "corporate",
  "city": "city name",
  "state": "state name",
  "contact_name": "name or null",
  "role": "job title or null",
  "email": "email or null",
  "phone": "phone or null",
  "employees_or_students": <integer or null>,
  "estimated_annual_value_inr": <integer, estimated Cittaa contract value>,
  "why_good_lead": "one sentence",
  "source_url": "URL or null"
}

CRITICAL RULES:
- Your ENTIRE response must be ONLY the JSON array — nothing else
- Start with [ and end with ]
- No markdown, no code fences, no explanation
- If no organisations found, return []
- Only India-based organisations
- Schools must have 500+ students, corporates 200+ employees`;
}

// ─── Scoring prompt ───────────────────────────────────────────────────────────

function buildScoringPrompt(lead) {
  return `Score this B2B lead for Cittaa Health Services (0–100).

Lead: ${lead.type} — ${lead.org_name}, ${lead.city || 'India'}
Size: ${lead.employees_or_students || 'unknown'}
Est. contract: ₹${lead.estimated_annual_value_inr || 0}
Contact found: ${lead.contact_name ? 'yes' : 'no'}
Email/phone: ${(lead.email || lead.phone) ? 'yes' : 'no'}

Scoring:
+20 Hyderabad/Telangana based
+15 large (3000+ students or 1000+ employees)
+10 well-known brand
+10 high value (₹10L+)
+10 decision-maker contact found
+5 email or phone available
-10 outside Telangana
-20 too small (under 300 students or 100 employees)

Respond with ONLY this JSON: {"score": <0-100>, "reasoning": "<one sentence>"}`;
}

// ─── JSON parsers (multi-strategy) ───────────────────────────────────────────

function parseLeadsFromResponse(text) {
  if (!text || typeof text !== 'string') return [];

  // Strip Gemini thinking tags if present
  const noThinking = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();

  // Strategy 1: Try parsing the whole cleaned response
  const strategies = [
    noThinking,
    noThinking.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim(),
  ];

  for (const candidate of strategies) {
    const s = candidate.indexOf('[');
    const e = candidate.lastIndexOf(']');
    if (s !== -1 && e !== -1 && e > s) {
      try {
        const parsed = JSON.parse(candidate.slice(s, e + 1));
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
  }

  // Strategy 2: Extract individual JSON objects with org_name field
  const objRegex = /\{[^{}]*"org_name"[^{}]*\}/g;
  const matches = noThinking.match(objRegex);
  if (matches) {
    const parsed = [];
    for (const m of matches) {
      try { parsed.push(JSON.parse(m)); } catch {}
    }
    if (parsed.length > 0) return parsed;
  }

  console.warn('[Lead Discovery] JSON parse failed. Response snippet:', text.substring(0, 300));
  return [];
}

function parseScoreFromResponse(text) {
  if (!text) return { score: 50, reasoning: 'No response' };
  const noThinking = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
  const cleaned = noThinking.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const s = cleaned.indexOf('{');
  const e = cleaned.lastIndexOf('}');
  if (s === -1 || e === -1) return { score: 50, reasoning: 'Parse failed' };
  try {
    return JSON.parse(cleaned.slice(s, e + 1));
  } catch {
    return { score: 50, reasoning: 'Parse error' };
  }
}

// ─── Deduplication ────────────────────────────────────────────────────────────

async function isDuplicate(orgName) {
  if (!orgName) return false;
  const norm = orgName.trim().toLowerCase();
  const [existing1, existing2] = await Promise.all([
    Lead.find({}, 'org_name').lean(),
    LeadQueue.find({ status: { $in: ['pending', 'approved'] } }, 'org_name').lean(),
  ]);
  const allOrgs = [...existing1, ...existing2].map((d) => d.org_name?.toLowerCase().trim()).filter(Boolean);
  for (const existing of allOrgs) {
    if (existing.includes(norm) || norm.includes(existing)) return true;
    if (levenshtein.get(norm, existing) <= 3) return true;
  }
  return false;
}

// ─── Core Discovery Function ──────────────────────────────────────────────────

async function runDiscovery(queries = null) {
  const startTime = Date.now();
  const allQueries = queries || [...SCHOOL_QUERIES, ...CORP_QUERIES];
  const selectedQueries = [...allQueries].sort(() => Math.random() - 0.5).slice(0, 4);

  const log = await DiscoveryLog.create({
    run_at: new Date(),
    queries_run: selectedQueries,
    status: 'running',
  });

  let totalFound = 0;
  let totalAdded = 0;
  let totalSkipped = 0;

  try {
    // Step 1 model: grounded search (returns descriptive text)
    const searchModel = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      tools: [{ googleSearch: {} }],
      generationConfig: { temperature: 0.3 },
    });

    // Step 2 model: JSON extraction from search text (no grounding)
    const extractModel = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.1 },
    });

    // Scoring model
    const scoreModel = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.1 },
    });

    for (const query of selectedQueries) {
      console.log(`[Lead Discovery] Query: "${query}"`);
      try {
        // ── Step 1: Search with grounding ──────────────────────────────────
        let searchText = '';
        try {
          const searchResult = await searchModel.generateContent(buildSearchPrompt(query));
          searchText = searchResult.response.text();
          console.log(`[Lead Discovery] Search response (${searchText.length} chars)`);
        } catch (searchErr) {
          console.error('[Lead Discovery] Search step failed:', searchErr.message);
          continue;
        }

        if (!searchText || searchText.trim().length < 20) {
          console.warn('[Lead Discovery] Empty search response, skipping');
          continue;
        }

        // ── Step 2: Extract JSON from search text ──────────────────────────
        let leads = [];
        try {
          const extractResult = await extractModel.generateContent(
            buildExtractionPrompt(searchText, query)
          );
          const extractText = extractResult.response.text();
          leads = parseLeadsFromResponse(extractText);
          console.log(`[Lead Discovery] Extracted ${leads.length} leads from "${query}"`);
        } catch (extractErr) {
          console.error('[Lead Discovery] Extraction step failed:', extractErr.message);
          continue;
        }

        totalFound += leads.length;

        for (const lead of leads) {
          if (!lead.org_name || !lead.type) continue;

          const dup = await isDuplicate(lead.org_name);
          if (dup) {
            totalSkipped++;
            continue;
          }

          // Score
          let score = 50;
          let reasoning = lead.why_good_lead || '';
          try {
            const scoreResult = await scoreModel.generateContent(buildScoringPrompt(lead));
            const scored = parseScoreFromResponse(scoreResult.response.text());
            score = Math.min(100, Math.max(0, scored.score || 50));
            reasoning = scored.reasoning || reasoning;
          } catch (scoreErr) {
            console.warn('[Lead Discovery] Scoring failed for', lead.org_name, '— using default 50');
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
          console.log(`[Lead Discovery] ✅ Added: ${lead.org_name} (score: ${score})`);
        }

        // Respect rate limits
        await new Promise((r) => setTimeout(r, 3000));
      } catch (queryErr) {
        console.error(`[Lead Discovery] Query pipeline failed: "${query}"`, queryErr.message);
      }
    }

    await DiscoveryLog.findByIdAndUpdate(log._id, {
      leads_found: totalFound,
      leads_added_to_queue: totalAdded,
      duplicates_skipped: totalSkipped,
      status: 'success',
      duration_seconds: Math.round((Date.now() - startTime) / 1000),
    });

    console.log(
      `[Lead Discovery] ✅ Complete — Found: ${totalFound}, Added: ${totalAdded}, Skipped: ${totalSkipped}`
    );

    // Notify Sairam + Abhijay
    if (totalAdded > 0) {
      try {
        const newItems = await LeadQueue.find({ status: 'pending' })
          .sort({ _id: -1 })
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
    console.error('[Lead Discovery] ❌ Critical error:', err.message);
    throw err;
  }
}

// ─── Weekly deep scan ─────────────────────────────────────────────────────────

async function runWeeklyDeepScan() {
  console.log('[Lead Discovery] 🔍 Weekly deep scan — all queries');
  await runDiscovery([...SCHOOL_QUERIES, ...CORP_QUERIES]);
}

// ─── Single-query debug run (for test endpoint) ───────────────────────────────

async function runTestDiscovery() {
  const testQuery = 'top CBSE private schools Hyderabad Gachibowli 2025 student counsellor';

  const searchModel = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    tools: [{ googleSearch: {} }],
    generationConfig: { temperature: 0.3 },
  });

  const extractModel = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.1 },
  });

  const searchResult = await searchModel.generateContent(buildSearchPrompt(testQuery));
  const searchText = searchResult.response.text();

  const extractResult = await extractModel.generateContent(
    buildExtractionPrompt(searchText, testQuery)
  );
  const extractText = extractResult.response.text();
  const leads = parseLeadsFromResponse(extractText);

  return {
    query: testQuery,
    searchResponseLength: searchText.length,
    searchResponsePreview: searchText.substring(0, 500),
    extractionResponse: extractText.substring(0, 1000),
    parsedLeads: leads,
    parsedCount: leads.length,
  };
}

// ─── Cron schedule ────────────────────────────────────────────────────────────

function startCronJobs() {
  cron.schedule('0 */6 * * *', () => {
    console.log('[Lead Discovery] ⏰ Cron: every-6h run');
    runDiscovery().catch(console.error);
  });

  cron.schedule('0 9 * * 1', () => {
    console.log('[Lead Discovery] ⏰ Cron: Monday deep scan');
    runWeeklyDeepScan().catch(console.error);
  });

  console.log('[Lead Discovery] Cron jobs scheduled (6h + Monday 9am deep scan)');
}

module.exports = { runDiscovery, runWeeklyDeepScan, runTestDiscovery, startCronJobs };
