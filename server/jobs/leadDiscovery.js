const cron = require('node-cron');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const LeadQueue = require('../models/LeadQueue');
const Lead = require('../models/Lead');
const DiscoveryLog = require('../models/DiscoveryLog');
const { sendRadarDiscoveryEmail } = require('../services/emailService');
const levenshtein = require('fast-levenshtein');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─── Discovery Queries ────────────────────────────────────────────────────────
// Tightly focused on: psychology, mental health, special education, student
// wellbeing, and corporate EAP/wellness — Cittaa's exact domain

// ── SCHOOL / EDUCATION queries ────────────────────────────────────────────────
// Targets schools that NEED a counsellor (no program yet) or are scaling one

const SCHOOL_QUERIES = [
  // Schools actively seeking mental health support
  'schools Hyderabad Telangana hiring school counsellor psychologist 2025 mental health vacancy',
  'CBSE ICSE schools Hyderabad student mental health wellbeing program NEP 2020 compliance',

  // Special education — core Cittaa target segment
  'special education schools Hyderabad Telangana autism ADHD learning disability centre 2025',
  'inclusive education schools Hyderabad special needs students psychologist support',
  'schools Hyderabad Secunderabad special educator child psychologist contact principal',

  // Residential / boarding — high-stress environment, strong ROI for Cittaa
  'residential boarding schools Hyderabad Telangana 500+ students student counselling',
  'Navodaya Vidyalaya KV Kendriya Vidyalaya Hyderabad Telangana school psychologist program',

  // Stress / exam pressure — pain point Cittaa directly addresses
  'schools Hyderabad student anxiety exam stress mental health counselling program 2025',
  'IIT JEE NEET coaching institutes Hyderabad student psychology wellness mental health',

  // Child psychology referral network
  'child psychology centre Hyderabad Telangana ADHD autism assessment therapy contact',

  // Schools in growth corridors — likely scaling, no counsellor yet
  'new CBSE schools Hyderabad Kompally Bachupally Kokapet Shadnagar 2024 2025 admissions',

  // Play therapy / early childhood
  'preschool montessori early childhood development centre Hyderabad psychologist wellness',
];

// ── CORPORATE / ORGANISATION queries ─────────────────────────────────────────
// Targets organisations with high-stress workforces and no EAP yet

const CORP_QUERIES = [
  // Direct EAP / employee mental health search
  'companies Hyderabad implementing employee assistance program EAP mental health 2025',
  'corporates Hyderabad hiring workplace mental health counsellor wellbeing manager 2025',

  // High-burnout sectors — IT, BPO, healthcare workers
  'IT BPO companies Hyderabad employee burnout stress mental health support program',
  'hospitals healthcare organisations Hyderabad nurse doctor mental health wellbeing program',

  // NGOs and social sector — mental health mission alignment
  'NGOs Hyderabad Telangana mental health psychology child welfare special education',
  'disability rehabilitation centres Hyderabad psychologist occupational therapist contact',

  // Psychology clinics and networks — potential referral / partnership leads
  'clinical psychology practice Hyderabad psychologist psychiatrist clinic private 2025',
  'mental health startups Hyderabad Telangana psychology app platform wellness 2025',

  // Corporate wellness mandates — post-COVID push
  'Telangana companies won mental health wellbeing award employee wellness initiative 2024 2025',
  'GCC global capability centres Hyderabad employee mental health EAP program HR head',

  // Pharma and manufacturing — shift workers, high-stress
  'pharmaceutical manufacturing companies Hyderabad Genome Valley employee counselling EAP',

  // Govt / PSU — new mandates
  'government PSU organisations Hyderabad Telangana employee mental health wellness initiative',
];

// ─── Step 1: Search prompt (grounded — returns descriptive text) ──────────────

function buildSearchPrompt(query) {
  return `You are a B2B sales research assistant for Cittaa Health Services.

Cittaa provides AI-powered mental health and wellbeing technology to:
- Schools: student mental health assessments, counsellor dashboards, NEP 2020 compliance, special education support
- Corporates: employee mental health (EAP), burnout prevention, anonymous check-ins, manager dashboards
- Clinics / NGOs: psychology platform, assessment tools, therapy management

Using Google Search, find real organisations matching: "${query}"

Write a detailed research report. For each organisation found include:
- Full organisation name
- Category (school / corporate / clinic / NGO / rehab centre / coaching institute)
- City and state in India
- Approximate size (students or employees or patients served)
- Decision-maker contact: name + title (Principal / HR Head / Director / Founder / CHRO)
- EMAIL address — check official website, LinkedIn, JustDial, IndiaMART, Google Maps listing
- PHONE number — check Google Maps, JustDial, official website contact page
- Specific reason this org needs Cittaa (e.g. no counsellor, NEP gap, high burnout, special ed students)

IMPORTANT: Always try to find email and phone. Check the official website contact page, Google Maps listing, and JustDial profile.
- Specific reason this org needs Cittaa's mental health platform (e.g. no counsellor, high burnout, NEP compliance gap, special ed students, etc.)

Prioritise Hyderabad and Telangana. List up to 5 real organisations. Use specific names, not generic examples.`;
}

// ─── Step 2: Extraction prompt (no grounding — converts text to JSON) ─────────

function buildExtractionPrompt(searchText, query) {
  return `Extract organisations from the research report below as a JSON array.

Research report:
"""
${searchText}
"""

Cittaa Health Services sells mental health + special education technology to:
- Schools (student counselling, NEP compliance, special ed)
- Corporates (employee EAP, burnout prevention)
- Clinics, NGOs, rehab centres, coaching institutes (psychology platform)

For the "type" field use one of: "school", "corporate", "clinic", "ngo", "rehab", "coaching"
For estimated_annual_value_inr, estimate what Cittaa could charge annually:
  - Small school (<500 students): 150000
  - Medium school (500-2000): 300000
  - Large school (2000+): 600000
  - Corporate 200-500 employees: 250000
  - Corporate 500-2000: 500000
  - Corporate 2000+: 1200000
  - Clinic/NGO/Rehab: 120000

Return a JSON array. Each item must have EXACTLY these fields:
{
  "org_name": "full organisation name",
  "type": "school|corporate|clinic|ngo|rehab|coaching",
  "city": "city",
  "state": "state",
  "contact_name": "name or null",
  "role": "Principal/HR Head/Director/Founder etc or null",
  "email": "email or null",
  "phone": "phone or null",
  "employees_or_students": <integer or null>,
  "estimated_annual_value_inr": <integer>,
  "why_good_lead": "specific one-sentence reason they need Cittaa (e.g. no counsellor, NEP gap, high burnout)",
  "source_url": "URL or null"
}

CRITICAL: Respond with ONLY the JSON array. Start with [ end with ]. No markdown, no explanation. If nothing found: []`;
}

// ─── Scoring prompt ───────────────────────────────────────────────────────────

function buildScoringPrompt(lead) {
  return `Score this lead for Cittaa Health Services — a mental health & special education technology company (0–100).

Lead: ${lead.type} — ${lead.org_name}, ${lead.city || 'India'}
Size: ${lead.employees_or_students || 'unknown'}
Est. contract: ₹${lead.estimated_annual_value_inr || 0}
Contact found: ${lead.contact_name ? `yes — ${lead.contact_name} (${lead.role || ''})` : 'no'}
Email available: ${lead.email ? 'yes' : 'no'}
Phone available: ${lead.phone ? 'yes' : 'no'}
Why a lead: ${lead.why_good_lead || 'unknown'}

Scoring criteria:
+25 Hyderabad/Telangana based (priority market)
+15 special education / autism / ADHD / learning disability focus (core Cittaa segment)
+15 explicitly no counsellor or seeking mental health support
+10 large institution (2000+ students or 500+ employees)
+10 high value (₹5L+ contract)
+10 decision-maker email OR phone found
+5 decision-maker name + role found
-15 outside Telangana / Andhra Pradesh
-20 no mental health / wellbeing relevance

Respond with ONLY: {"score": <0-100>, "reasoning": "<one sentence explaining score>"}`;
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

          // Map extended types: clinic/ngo/rehab/coaching → corporate slot in pipeline
          const validTypes = ['school', 'corporate', 'clinic', 'ngo', 'rehab', 'coaching'];
          const leadType = validTypes.includes(lead.type) ? lead.type : 'corporate';

          await LeadQueue.create({
            type: leadType,
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
