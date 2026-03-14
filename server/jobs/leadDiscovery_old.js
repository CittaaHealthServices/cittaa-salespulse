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

  // ── SCHOOLS – LINKEDIN POSTS (organic vacancy announcements, not job listings)
  // Schools, govt institutions, HR teams post vacancies as regular LinkedIn posts
  // with hashtags like #CounsellorJobs #SchoolCounsellor #JobAlert
  { q: 'site:linkedin.com/posts "school counsellor" vacancy OR hiring India 2025 #CounsellorJobs OR #SchoolCounsellor',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Pan India', platform: 'LinkedIn Posts' },
  { q: 'site:linkedin.com/posts "counsellor vacancy" school India 2025 #JobAlert OR #SchoolJobs',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Pan India', platform: 'LinkedIn Posts' },
  { q: 'site:linkedin.com/posts "school counsellor" OR "school psychologist" vacancy apply 2025 India',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Pan India', platform: 'LinkedIn Posts' },
  { q: 'site:linkedin.com/posts "Sainik school" OR "Kendriya Vidyalaya" OR "Navodaya" counsellor vacancy 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Pan India', platform: 'LinkedIn Posts' },
  { q: 'site:linkedin.com/posts school "hiring counsellor" OR "counsellor required" OR "counsellor post" India 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Pan India', platform: 'LinkedIn Posts' },

  // ── CORPORATES – LINKEDIN POSTS (HR teams announcing EAP / wellness hires)
  { q: 'site:linkedin.com/posts "EAP counsellor" OR "employee assistance" vacancy hiring India 2025 #HRJobs',
    target_role: 'CHRO / HR Director', type: 'corporate', region: 'Pan India', platform: 'LinkedIn Posts' },
  { q: 'site:linkedin.com/posts "corporate wellness" OR "mental health counsellor" vacancy India 2025 #JobAlert',
    target_role: 'HR Manager / L&D Head', type: 'corporate', region: 'Pan India', platform: 'LinkedIn Posts' },

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

  // ══════════════════════════════════════════════════════════════
  // FACEBOOK HIRING POSTS
  // School admins and HR teams post vacancies in FB groups/pages.
  // Often the only digital trace for smaller tier-2/3 city schools.
  // ══════════════════════════════════════════════════════════════
  { q: 'site:facebook.com school "counsellor vacancy" OR "hiring counsellor" OR "school counsellor" India 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Pan India', platform: 'Facebook' },
  { q: 'site:facebook.com "we are hiring" "counsellor" school OR college India 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Pan India', platform: 'Facebook' },
  { q: 'site:facebook.com "EAP counsellor" OR "employee wellness" OR "corporate counsellor" vacancy India 2025',
    target_role: 'CHRO / HR Director', type: 'corporate', region: 'Pan India', platform: 'Facebook' },

  // ══════════════════════════════════════════════════════════════
  // TWITTER / X VACANCY TWEETS
  // HR professionals and school admins tweet vacancies with
  // hashtags like #CounsellorJobs #Hiring #JobAlert
  // ══════════════════════════════════════════════════════════════
  { q: 'site:twitter.com "school counsellor" vacancy OR hiring India 2025 #CounsellorJobs OR #JobAlert',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Pan India', platform: 'Twitter/X' },
  { q: 'site:twitter.com "EAP counsellor" OR "corporate wellness" hiring India 2025 #HRJobs OR #Hiring',
    target_role: 'CHRO / HR Director', type: 'corporate', region: 'Pan India', platform: 'Twitter/X' },

  // ══════════════════════════════════════════════════════════════
  // FOUNDIT (Monster India) & INTERNSHALA
  // Foundit catches mid-size orgs; Internshala catches NGOs,
  // smaller schools and coaching institutes not on Naukri.
  // ══════════════════════════════════════════════════════════════
  { q: 'site:foundit.in "school counsellor" OR "student counsellor" India 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Pan India', platform: 'Foundit' },
  { q: 'site:foundit.in "EAP counsellor" OR "employee wellness" OR "corporate counsellor" India 2025',
    target_role: 'HR Manager / L&D Head', type: 'corporate', region: 'Pan India', platform: 'Foundit' },
  { q: 'site:internshala.com "counsellor" school OR college OR NGO India 2025',
    target_role: 'Director / Principal', type: 'school', region: 'Pan India', platform: 'Internshala' },

  // ══════════════════════════════════════════════════════════════
  // GOVERNMENT PORTALS
  // Govt schools (Sainik, Kendriya Vidyalaya, Navodaya, state govt)
  // post counsellor vacancies on official portals — zero competition,
  // high contract value, long tenure.
  // ══════════════════════════════════════════════════════════════
  { q: 'site:gem.gov.in "counselling" OR "mental health" school services 2025',
    target_role: 'Principal / Welfare Officer', type: 'school', region: 'Pan India', platform: 'GeM Portal' },
  { q: '"Kendriya Vidyalaya" OR "Navodaya Vidyalaya" OR "Sainik School" counsellor vacancy recruitment 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Pan India', platform: 'Govt Portal' },
  { q: 'site:sarkariresult.com OR site:govtjobguru.in "school counsellor" OR "counsellor" recruitment 2025',
    target_role: 'Principal / Vice Principal', type: 'school', region: 'Pan India', platform: 'Govt Portal' },
  { q: '"state government" school counsellor recruitment 2025 Telangana OR Karnataka OR Tamil Nadu OR Maharashtra',
    target_role: 'District Education Officer / Principal', type: 'school', region: 'South India', platform: 'Govt Portal' },

  // ══════════════════════════════════════════════════════════════
  // NEWS-BASED INTENT SIGNALS
  // Companies in the news for launching wellness programs,
  // signing EAP partnerships, or winning mental health awards
  // are actively INVESTING — perfect time to reach them.
  // ══════════════════════════════════════════════════════════════
  { q: 'site:economictimes.com OR site:livemint.com "employee mental health" OR "workplace wellness" program launch India 2025',
    target_role: 'CHRO / VP People', type: 'corporate', region: 'Pan India', platform: 'News Signal' },
  { q: 'site:businessline.com OR site:thehindu.com "EAP" OR "employee assistance programme" India company 2025',
    target_role: 'CHRO / HR Director', type: 'corporate', region: 'Pan India', platform: 'News Signal' },
  { q: '"mental health" "employee wellbeing" initiative launched OR announced India company 2025',
    target_role: 'CHRO / VP People', type: 'corporate', region: 'Pan India', platform: 'News Signal' },

  // ══════════════════════════════════════════════════════════════
  // GREAT PLACE TO WORK & BEST EMPLOYER SIGNALS
  // Companies certified as "Great Place to Work" or winning
  // "Best Employer" awards invest heavily in employee wellbeing.
  // They have budget AND motivation — ideal Cittaa customers.
  // ══════════════════════════════════════════════════════════════
  { q: '"Great Place to Work" certified India 2025 company employees mental health OR wellness',
    target_role: 'CHRO / HR Director', type: 'corporate', region: 'Pan India', platform: 'GPTW Signal' },
  { q: '"Best Employer" OR "Top Employer" award India 2025 employee wellbeing OR mental health',
    target_role: 'CHRO / VP People', type: 'corporate', region: 'Pan India', platform: 'GPTW Signal' },

  // ══════════════════════════════════════════════════════════════
  // HIGH EMPLOYEE STRESS SIGNALS (Glassdoor / Ambitionbox)
  // Companies with negative mental health reviews are in urgent
  // need — employees are vocal about burnout and poor support.
  // ══════════════════════════════════════════════════════════════
  { q: 'site:glassdoor.com OR site:ambitionbox.com "mental health" "no support" OR "burnout" OR "high stress" India company 2025',
    target_role: 'CHRO / HR Director', type: 'corporate', region: 'Pan India', platform: 'Glassdoor Signal' },

  // ══════════════════════════════════════════════════════════════
  // FRESHLY FUNDED STARTUPS
  // Post-funding companies aggressively hire and scale culture —
  // employee count spikes, stress spikes, EAP becomes urgent.
  // ══════════════════════════════════════════════════════════════
  { q: '"Series A" OR "Series B" OR "Series C" funding India startup 2025 employees "mental health" OR "HR" OR "people team"',
    target_role: 'CHRO / Head of People', type: 'corporate', region: 'Pan India', platform: 'Funding Signal' },
  { q: 'site:yourstory.com OR site:inc42.com raised funding India startup 2025 employees 100 OR 200 OR 500',
    target_role: 'CHRO / Head of People', type: 'corporate', region: 'Pan India', platform: 'Funding Signal' },

  // ══════════════════════════════════════════════════════════════
  // SCHOOL CBSE / NAAC ACCREDITATION SIGNALS
  // Schools getting fresh CBSE/ICSE affiliation need to build
  // student wellness infrastructure from scratch — no existing
  // vendor, receptive to a first-mover pitch.
  // ══════════════════════════════════════════════════════════════
  { q: '"CBSE affiliation" OR "ICSE affiliation" new school 2024 2025 India counsellor wellness',
    target_role: 'Principal / Director', type: 'school', region: 'Pan India', platform: 'Affiliation Signal' },
  { q: 'new school opened OR inaugurated 2024 2025 India CBSE OR ICSE OR IB counsellor',
    target_role: 'Principal / Director', type: 'school', region: 'Pan India', platform: 'Affiliation Signal' },

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

const SIGNAL_PLATFORMS = ['News Signal', 'GPTW Signal', 'Glassdoor Signal', 'Funding Signal', 'Affiliation Signal'];
const SOCIAL_PLATFORMS = ['Instagram', 'Facebook', 'Twitter/X'];
const GOVT_PLATFORMS   = ['GeM Portal', 'Govt Portal'];

function buildSearchPrompt(query) {
  // ── Intent / news signals ────────────────────────────────────────────────
  if (SIGNAL_PLATFORMS.includes(query.platform)) {
    const intentMap = {
      'News Signal':        'launching employee wellness / mental health programs',
      'GPTW Signal':        'certified as great places to work — they actively invest in employee wellbeing',
      'Glassdoor Signal':   'receiving negative mental health reviews — employees citing burnout, no support',
      'Funding Signal':     'recently funded and rapidly scaling headcount — EAP becomes urgent at scale',
      'Affiliation Signal': 'newly accredited or opened schools that need to build student wellness from scratch',
    };
    return `You are a B2B sales intelligence agent for Cittaa, an AI mental health platform for organisations.

Find organisations that are ${intentMap[query.platform] || 'showing strong buying intent for mental health services'}.

Search for: "${query.q}"

For each organisation you find, extract:
1. Organisation name and location (city, state)
2. Why they are a hot lead — what signal was found (news story, award, review, funding round, affiliation)
3. A direct URL to the source (news article, Glassdoor page, funding announcement, etc.)
4. Company/school size if mentioned
5. Any contact information visible (website, LinkedIn, email)

Focus on REAL organisations with VERIFIABLE signals — include the source URL.

Region: ${query.region}
Decision maker to approach: ${query.target_role}`;
  }

  // ── Government portals ───────────────────────────────────────────────────
  if (GOVT_PLATFORMS.includes(query.platform)) {
    return `You are a B2B sales intelligence agent for Cittaa, an AI mental health platform for organisations.

Government schools (Kendriya Vidyalaya, Navodaya Vidyalaya, Sainik Schools, state govt schools) post counsellor vacancies on official government portals. These are zero-competition, high-value, long-tenure contracts.

Search for: "${query.q}"

For each government school counsellor vacancy you find, extract:
1. The school/institution name and location
2. The exact post advertised (counsellor, psychologist, welfare officer)
3. A direct URL to the recruitment notification or portal listing
4. Contact details (address, email, phone) if in the notification
5. Pay scale / salary if mentioned
6. Application deadline if mentioned

Region: ${query.region}
Decision maker to approach: ${query.target_role}`;
  }

  // ── Social media (Facebook, Twitter/X) ──────────────────────────────────
  if (SOCIAL_PLATFORMS.includes(query.platform)) {
    const platform = query.platform;
    return `You are a B2B sales intelligence agent for Cittaa, an AI mental health platform for organisations.

Schools and companies post counsellor vacancy announcements on ${platform} — often with full details that don't appear anywhere else.

Search for: "${query.q}"

For each hiring post you find on ${platform}, extract:
1. The organisation's name and city/state
2. The role they are hiring for
3. The ${platform} post or profile URL
4. Contact info in the post or bio (email, phone, website)
5. Any salary, qualification, or deadline details mentioned

Focus on REAL organisations — not job aggregator accounts resharing.
The source_url must be a real ${platform} link.

Region: ${query.region}
Decision maker to approach: ${query.target_role}`;
  }

  if (query.platform === 'LinkedIn Posts') {
    return `You are a B2B sales intelligence agent for Cittaa, an AI mental health platform for organisations.

Schools and companies in India post counsellor vacancy announcements as regular LinkedIn posts — NOT job listings. These posts often include hashtags like #CounsellorJobs #SchoolCounsellor #JobAlert and have full details: salary, qualification, location, last date to apply.

Search for: "${query.q}"

For each vacancy post you find on LinkedIn, extract:
1. The hiring organisation's name and city/state
2. The exact role they are hiring for (counsellor, psychologist, etc.)
3. The LinkedIn post URL (linkedin.com/posts/...)
4. Any contact info in the post (email, phone, website)
5. Details mentioned: salary, qualification required, last date to apply
6. Organisation type (school, government school, corporate, NGO)

Focus on REAL posts from actual organisations — not reshares by job aggregator accounts.
The source_url must be an actual linkedin.com/posts link.

Region: ${query.region}
Decision maker to approach: ${query.target_role}`;
  }

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
  const isIG      = query.platform === 'Instagram';
  const isLIPost  = query.platform === 'LinkedIn Posts';
  const isFB      = query.platform === 'Facebook';
  const isTwitter = query.platform === 'Twitter/X';
  const isSignal  = SIGNAL_PLATFORMS.includes(query.platform);
  const isGovt    = GOVT_PLATFORMS.includes(query.platform);

  const urlNote = isIG      ? 'must be an instagram.com link. Omit if no real IG URL.'
                : isLIPost  ? 'must be a linkedin.com/posts/... link. Omit if no real post URL.'
                : isFB      ? 'must be a facebook.com link. Omit if no real FB URL.'
                : isTwitter ? 'must be a twitter.com or x.com link. Omit if no real tweet URL.'
                : isSignal  ? 'must be a URL to the news article, Glassdoor page, funding announcement, or award page. Omit if no real URL.'
                : isGovt    ? 'must be a URL to the official recruitment notification or govt portal page. Omit if no real URL.'
                : `must be a direct URL to the job post on ${query.platform}. Omit if no real URL.`;

  const sourceLabel = isIG      ? 'Instagram hiring post'
                    : isLIPost  ? 'LinkedIn post'
                    : isFB      ? 'Facebook hiring post'
                    : isTwitter ? 'Twitter/X hiring post'
                    : isGovt    ? 'Government recruitment portal'
                    : isSignal  ? `${query.platform.replace(' Signal', '').toLowerCase()} signal`
                    : `${query.platform} job posting`;

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
  "discovery_source": "${sourceLabel}",
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

// Balanced test set — one query per major source type
async function runTestDiscovery() {
  const subset = [
    // Job boards
    QUERIES.find(q => q.type === 'school'    && q.platform === 'Naukri'),
    QUERIES.find(q => q.type === 'corporate' && q.platform === 'Naukri'),
    QUERIES.find(q => q.type === 'corporate' && q.platform === 'LinkedIn Jobs'),
    // Organic social posts
    QUERIES.find(q => q.type === 'school'    && q.platform === 'LinkedIn Posts'),
    QUERIES.find(q => q.type === 'school'    && q.platform === 'Instagram'),
    QUERIES.find(q => q.type === 'school'    && q.platform === 'Facebook'),
    // Intent signals
    QUERIES.find(q => q.platform === 'News Signal'),
    QUERIES.find(q => q.platform === 'Funding Signal'),
    QUERIES.find(q => q.platform === 'GPTW Signal'),
    // Govt
    QUERIES.find(q => q.platform === 'Govt Portal'),
  ].filter(Boolean);
  return runDiscovery(subset);
}

function startDiscoveryJobs() {
  if (!cron) return;
  try {
    // Monday 1 AM — full scan (all sources)
    cron.schedule('0 1 * * 1', () => runDiscovery(QUERIES).catch(console.error), { timezone: 'Asia/Kolkata' });
    // Wednesday 2 AM — corporate job boards + intent signals
    cron.schedule('0 2 * * 3', () => runDiscovery(QUERIES.filter(q => q.type === 'corporate' || SIGNAL_PLATFORMS.includes(q.platform))).catch(console.error), { timezone: 'Asia/Kolkata' });
    // Friday 3 AM — social signals (Instagram, Facebook, Twitter, LinkedIn Posts)
    cron.schedule('0 3 * * 5', () => runDiscovery(QUERIES.filter(q => [...SOCIAL_PLATFORMS, 'LinkedIn Posts'].includes(q.platform))).catch(console.error), { timezone: 'Asia/Kolkata' });
    // Saturday 4 AM — government portals + affiliation/GPTW signals
    cron.schedule('0 4 * * 6', () => runDiscovery(QUERIES.filter(q => GOVT_PLATFORMS.includes(q.platform) || ['GPTW Signal', 'Affiliation Signal'].includes(q.platform))).catch(console.error), { timezone: 'Asia/Kolkata' });
    console.log('[Discovery] Jobs: Mon (full), Wed (corporate+signals), Fri (social), Sat (govt+GPTW)');
  } catch (e) { console.error('[Discovery] Cron setup:', e.message); }
}

module.exports = { startDiscoveryJobs, runDiscovery, runTestDiscovery, QUERIES };
