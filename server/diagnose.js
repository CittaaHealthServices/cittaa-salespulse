// Run: node diagnose.js  (from inside cittaa-salespulse/server/)
require('dotenv').config();
const path = require('path');

console.log('\n══════════════════════════════════════════');
console.log('  Cittaa SalesPulse — Discovery Diagnostics');
console.log('══════════════════════════════════════════\n');

// 1. Env vars
const envChecks = {
  GEMINI_API_KEY:   process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY,
  MONGO_URI:        process.env.MONGO_URI       || process.env.MONGODB_URI,
  RESEND_API_KEY:   process.env.RESEND_API_KEY,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
};
console.log('── Env Vars ───────────────────────────────');
for (const [k, v] of Object.entries(envChecks))
  console.log(`  ${v ? '✅' : '❌'} ${k}: ${v ? v.slice(0,16)+'…' : 'MISSING'}`);

// 2. Module loads
console.log('\n── Module Loads ───────────────────────────');
for (const [name, p] of [
  ['leadDiscovery.js',  './jobs/leadDiscovery'],
  ['radar.js',          './routes/radar'],
  ['emailService.js',   './services/emailService'],
  ['reminderEngine.js', './jobs/reminderEngine'],
  ['calendarService.js','./services/calendarService'],
]) {
  try {
    const m = require(p);
    if (name === 'leadDiscovery.js') {
      const qs = m.QUERIES || [];
      const platforms = [...new Set(qs.map(q => q.platform))];
      const types     = [...new Set(qs.map(q => q.type))];
      console.log(`  ✅ ${name} — ${qs.length} queries`);
      console.log(`     platforms: ${platforms.join(', ')}`);
      console.log(`     types:     ${types.join(', ')}`);
    } else {
      console.log(`  ✅ ${name}`);
    }
  } catch(e) {
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

// 3. Gemini ping
console.log('\n── Gemini API ─────────────────────────────');
const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
if (!key) {
  console.log('  ❌ No GEMINI_API_KEY');
} else {
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    new GoogleGenerativeAI(key)
      .getGenerativeModel({ model: 'gemini-1.5-flash' })
      .generateContent('Reply with just OK')
      .then(r => console.log('  ✅ Gemini reachable:', r.response.text().trim()))
      .catch(e => console.log('  ❌ Gemini error:', e.message));
  } catch(e) { console.log('  ❌ Gemini SDK:', e.message); }
}

// 4. MongoDB + counts
console.log('\n── MongoDB ────────────────────────────────');
const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!uri) {
  console.log('  ❌ No MONGO_URI');
  setTimeout(() => process.exit(0), 5000);
} else {
  require('mongoose').connect(uri).then(async () => {
    console.log('  ✅ Connected');
    try {
      const LQ = require('./models/LeadQueue');
      const [p,a,r] = await Promise.all([
        LQ.countDocuments({status:'pending'}),
        LQ.countDocuments({status:'approved'}),
        LQ.countDocuments({status:'rejected'}),
      ]);
      console.log(`  ✅ LeadQueue — pending:${p}  approved:${a}  rejected:${r}`);
    } catch(e) { console.log('  ❌ LeadQueue:', e.message); }
    try {
      const L = require('./models/Lead');
      console.log(`  ✅ Pipeline leads: ${await L.countDocuments()}`);
    } catch(e) { console.log('  ❌ Lead:', e.message); }
    setTimeout(() => { require('mongoose').disconnect(); process.exit(0); }, 500);
  }).catch(e => { console.log('  ❌ MongoDB:', e.message); process.exit(1); });
}

setTimeout(() => { console.log('\n══ Done ══\n'); process.exit(0); }, 12000);
