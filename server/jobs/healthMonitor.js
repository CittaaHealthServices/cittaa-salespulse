// jobs/healthMonitor.js — Periodic health checks + auto-alerts
// Runs every 5 minutes. Sends email the moment any component goes red.
// Sends recovery email when it comes back green.

const { sendAlert, sendRecovery } = require('../services/alertService');

let cron;
try { cron = require('node-cron'); } catch(e) {}

// ── Component state memory (green/red) ───────────────────────────────────
const _state = {
  mongodb:   null,  // null = unknown, true = healthy, false = down
  gemini:    null,
  email:     null,
  discovery: null,
};

// ── In-memory error log (last 20 errors, shown on dashboard) ─────────────
const _errorLog = [];

function logError(component, message, detail = '') {
  _errorLog.unshift({
    component,
    message,
    detail: (detail || '').substring(0, 500),
    time: new Date().toISOString(),
  });
  if (_errorLog.length > 20) _errorLog.pop();
}

function getErrorLog() { return [..._errorLog]; }

// ── Individual checks ─────────────────────────────────────────────────────
async function checkMongoDB() {
  try {
    const mongoose = require('mongoose');
    const state = mongoose.connection.readyState;
    if (state !== 1) throw new Error(`readyState=${state} (0=disc, 1=conn, 2=conn-ing, 3=disc-ing)`);
    // Ping
    await mongoose.connection.db.admin().ping();
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

async function checkGemini() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!key) return { ok: false, error: 'GEMINI_API_KEY not set in Railway variables' };
  try {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: key });
    const r  = await ai.models.generateContent({
      model:    'gemini-2.5-flash',
      contents: 'Reply with exactly one word: ok',
    });
    const text = (r.text || '').toLowerCase();
    if (!text) throw new Error('Empty response from Gemini');
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

async function checkEmail() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: 'RESEND_API_KEY not set in Railway variables' };
  return { ok: true };
}

async function checkDiscovery() {
  try {
    const DiscoveryLog = require('../models/DiscoveryLog');
    const last = await DiscoveryLog.findOne().sort({ ran_at: -1 }).lean();
    if (!last) return { ok: true, warning: 'No scans run yet — click Run Scan to start' };
    const ageHours = (Date.now() - new Date(last.ran_at)) / 3600000;
    if (ageHours > 48) return { ok: false, error: `Last scan was ${Math.round(ageHours)}h ago — discovery may be stalled` };
    return { ok: true, lastRan: last.ran_at, leadsFound: last.leads_found };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ── Main health check loop ─────────────────────────────────────────────────
async function runHealthCheck() {
  const results = {};

  const checks = [
    { name: 'mongodb',   fn: checkMongoDB   },
    { name: 'gemini',    fn: checkGemini    },
    { name: 'email',     fn: checkEmail     },
    { name: 'discovery', fn: checkDiscovery },
  ];

  for (const { name, fn } of checks) {
    try {
      const res = await fn();
      results[name] = res;

      const wasHealthy = _state[name];
      const isHealthy  = res.ok;

      if (isHealthy !== wasHealthy) {
        if (!isHealthy) {
          // Just went DOWN
          logError(name, res.error || 'Component unhealthy', res.error);
          await sendAlert(name, { error: res.error });
          console.log(`[HealthMonitor] ❌ ${name} went DOWN — alert sent`);
        } else if (wasHealthy === false) {
          // Just RECOVERED
          await sendRecovery(name);
          console.log(`[HealthMonitor] ✅ ${name} recovered — recovery email sent`);
        }
        _state[name] = isHealthy;
      }
    } catch(e) {
      results[name] = { ok: false, error: e.message };
      logError(name, e.message);
    }
  }

  return results;
}

// ── Expose current status (used by healthcheck route) ─────────────────────
function getCurrentStatus() {
  return { ..._state };
}

// ── Start cron ────────────────────────────────────────────────────────────
function startHealthMonitor() {
  if (!cron) {
    console.warn('[HealthMonitor] node-cron unavailable — health checks disabled');
    return;
  }
  // Run immediately on startup
  setTimeout(() => runHealthCheck().catch(console.error), 10000);
  // Then every 5 minutes
  cron.schedule('*/5 * * * *', () => runHealthCheck().catch(console.error));
  console.log('[HealthMonitor] Started — checking every 5 min');
}

module.exports = { startHealthMonitor, runHealthCheck, getCurrentStatus, getErrorLog, logError };
