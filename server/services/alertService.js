// services/alertService.js — System down alerts with fix instructions
// Sends immediate email to team when any component fails

const FROM_ADDRESS = 'Cittaa SalesPulse Alerts <noreply@cittaa.in>';
const ALERT_EMAILS = ['sairam@cittaa.in', 'abhijay@cittaa.in', 'pratya@cittaa.in'];
const APP_URL      = 'https://cittaa-salespulse-production.up.railway.app';

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  try { const { Resend } = require('resend'); return new Resend(key); }
  catch(e) { return null; }
}

// ── Fix instructions for each component ──────────────────────────────────
const FIX_STEPS = {
  mongodb: {
    title: 'MongoDB / Database is down',
    emoji: '🗄️',
    steps: [
      'Go to Railway dashboard → Your project → Variables',
      'Check that <b>MONGO_URI</b> is set correctly',
      'Open MongoDB Atlas → Network Access → confirm Railway IP is whitelisted (or set 0.0.0.0/0)',
      'Check Atlas cluster is not paused (free tier pauses after 60 days inactivity)',
      'Redeploy on Railway to reconnect',
    ],
  },
  gemini: {
    title: 'Gemini AI (Lead Discovery) is down',
    emoji: '🤖',
    steps: [
      'Go to Railway → Variables → confirm <b>GEMINI_API_KEY</b> is set',
      'Check Google AI Studio quota at <a href="https://aistudio.google.com">aistudio.google.com</a>',
      'Verify the key is for the correct Google account',
      'If quota exceeded, wait until midnight (Pacific Time) for reset',
    ],
  },
  email: {
    title: 'Email Service (Resend) is down',
    emoji: '📧',
    steps: [
      'Go to Railway → Variables → confirm <b>RESEND_API_KEY</b> is set',
      'Check Resend dashboard at <a href="https://resend.com">resend.com</a> for errors',
      'Verify the sending domain cittaa.in is verified in Resend',
      'Check if you have exceeded Resend free tier (100 emails/day)',
    ],
  },
  discovery: {
    title: 'Lead Discovery has stalled',
    emoji: '🔍',
    steps: [
      `Visit <a href="${APP_URL}/api/radar/debug-scan">Debug Scan</a> to diagnose`,
      `Click "Run Scan" on <a href="${APP_URL}">Lead Radar</a> to manually trigger`,
      'Check Railway logs for [Discovery] ERROR messages',
      'Ensure GEMINI_API_KEY and MONGO_URI are both set in Railway variables',
    ],
  },
  server: {
    title: 'Server / App is down',
    emoji: '🖥️',
    steps: [
      `Visit <a href="${APP_URL}/api/health">${APP_URL}/api/health</a> — if it loads, app is up`,
      'Check Railway dashboard → Deployments for any failed builds',
      'Go to Railway → Logs to see crash details',
      'Redeploy from Railway dashboard if latest deploy failed',
      'Check if Railway free tier usage limit was hit',
    ],
  },
  unhandled_error: {
    title: 'Unhandled Server Error',
    emoji: '💥',
    steps: [
      'Check Railway → Logs for the full error stack trace',
      'The error details are in this email below',
      'If the server is still running, it auto-recovered',
      'If the app is unreachable, redeploy from Railway dashboard',
    ],
  },
};

function buildEmailHtml(component, details = {}) {
  const info  = FIX_STEPS[component] || FIX_STEPS.server;
  const now   = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'medium' });
  const steps = info.steps.map((s, i) => `
    <tr>
      <td style="padding:8px 12px;vertical-align:top;color:#6b7280;font-size:13px;">${i+1}.</td>
      <td style="padding:8px 4px;font-size:14px;color:#1f2937;">${s}</td>
    </tr>`).join('');

  const errorBlock = details.error ? `
    <div style="margin:20px 0;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;">
      <p style="margin:0 0 8px;font-weight:600;color:#dc2626;">Error details:</p>
      <pre style="margin:0;font-size:12px;color:#7f1d1d;white-space:pre-wrap;word-break:break-word;">${details.error}</pre>
    </div>` : '';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

    <!-- Header -->
    <div style="background:#dc2626;padding:24px 28px;">
      <p style="margin:0;font-size:13px;color:#fca5a5;letter-spacing:.05em;text-transform:uppercase;">Cittaa SalesPulse Alert</p>
      <h1 style="margin:6px 0 0;font-size:20px;color:#fff;">${info.emoji} ${info.title}</h1>
    </div>

    <!-- Body -->
    <div style="padding:24px 28px;">
      <p style="margin:0 0 4px;font-size:13px;color:#9ca3af;">Detected at</p>
      <p style="margin:0 0 20px;font-size:15px;font-weight:600;color:#111827;">${now} IST</p>

      ${errorBlock}

      <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#111827;">How to fix it:</p>
      <table style="width:100%;border-collapse:collapse;">
        ${steps}
      </table>

      <div style="margin-top:24px;padding-top:20px;border-top:1px solid #e5e7eb;">
        <a href="${APP_URL}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;">
          Open SalesPulse →
        </a>
        <a href="${APP_URL}/api/healthcheck" style="display:inline-block;margin-left:12px;color:#4f46e5;text-decoration:none;font-size:13px;">
          View health status
        </a>
      </div>
    </div>

    <div style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">Cittaa SalesPulse auto-monitor · Reply to this email to get help</p>
    </div>
  </div>
</body>
</html>`;
}

// ── Track which alerts have already been sent (avoid spam) ────────────────
const _alertedAt = {};
const COOLDOWN_MS = 30 * 60 * 1000; // 30 min between repeat alerts

async function sendAlert(component, details = {}) {
  const now = Date.now();
  if (_alertedAt[component] && (now - _alertedAt[component]) < COOLDOWN_MS) {
    console.log(`[Alert] Skipping ${component} alert (cooldown active)`);
    return;
  }

  const resend = getResend();
  if (!resend) {
    console.warn(`[Alert] Cannot send ${component} alert — RESEND_API_KEY not set`);
    return;
  }

  const info    = FIX_STEPS[component] || FIX_STEPS.server;
  const subject = `🚨 ${info.title} — Cittaa SalesPulse`;

  try {
    await resend.emails.send({
      from:    FROM_ADDRESS,
      to:      ALERT_EMAILS,
      subject,
      html:    buildEmailHtml(component, details),
    });
    _alertedAt[component] = now;
    console.log(`[Alert] ✉️  Sent ${component} alert to team`);
  } catch(e) {
    console.error('[Alert] Failed to send alert email:', e.message);
  }
}

// ── Recovery email ────────────────────────────────────────────────────────
async function sendRecovery(component) {
  const resend = getResend();
  if (!resend) return;
  const info  = FIX_STEPS[component] || { title: component, emoji: '✅' };
  const now   = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'medium' });
  try {
    await resend.emails.send({
      from:    FROM_ADDRESS,
      to:      ALERT_EMAILS,
      subject: `✅ Recovered: ${info.title} — Cittaa SalesPulse`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <h2 style="color:#16a34a;">✅ ${info.title} — Recovered</h2>
          <p>The issue was resolved at <strong>${now} IST</strong>.</p>
          <p>SalesPulse is back to normal operation.</p>
          <a href="${APP_URL}" style="color:#4f46e5;">Open SalesPulse →</a>
        </div>`,
    });
    delete _alertedAt[component];
    console.log(`[Alert] ✅ Sent recovery email for ${component}`);
  } catch(e) {
    console.error('[Alert] Recovery email failed:', e.message);
  }
}

module.exports = { sendAlert, sendRecovery, APP_URL };
