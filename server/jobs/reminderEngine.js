// reminderEngine.js — safe version
// All cron jobs are wrapped in try-catch so a missing env var or DB issue
// never crashes the server on startup.

let cron;
try { cron = require('node-cron'); } catch (e) {
  console.warn('[Reminder] node-cron not available:', e.message);
}

const { sendFollowupReminderEmail } = require('../services/emailService');

// ── helpers ────────────────────────────────────────────────────────────────
function todayRange() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end   = new Date(); end.setHours(23, 59, 59, 999);
  return { start, end };
}

// ── daily follow-up digest ─── runs at 8:00 AM IST every weekday ──────────
async function sendDailyReminders() {
  try {
    const Followup = require('../models/Followup');
    const { start, end } = todayRange();

    const due = await Followup.find({
      scheduled_at: { $gte: start, $lte: end },
      completed:    { $ne: true },
    }).populate('lead_id').lean();

    if (!due.length) {
      console.log('[Reminder] No follow-ups due today');
      return;
    }

    // Group by owner
    const byOwner = {};
    for (const f of due) {
      const owner = f.owner || 'S';
      if (!byOwner[owner]) byOwner[owner] = [];
      byOwner[owner].push(f);
    }

    for (const [owner, items] of Object.entries(byOwner)) {
      await sendFollowupReminderEmail(items, owner);
    }

    console.log(`[Reminder] Sent reminders for ${due.length} follow-up(s)`);
  } catch (err) {
    console.error('[Reminder] sendDailyReminders error:', err.message);
  }
}

// ── overdue alert ─── runs at 9:00 AM IST every day ───────────────────────
async function checkOverdue() {
  try {
    const Followup = require('../models/Followup');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const overdue = await Followup.countDocuments({
      scheduled_at: { $lt: yesterday },
      completed:    { $ne: true },
    });

    if (overdue > 0) {
      console.log(`[Reminder] ⚠️  ${overdue} overdue follow-up(s) — consider reviewing`);
    }
  } catch (err) {
    console.error('[Reminder] checkOverdue error:', err.message);
  }
}

// ── start all jobs ─────────────────────────────────────────────────────────
function start() {
  if (!cron) {
    console.warn('[Reminder] node-cron unavailable — skipping reminder jobs');
    return;
  }

  try {
    // 8:00 AM IST (UTC+5:30 → 2:30 AM UTC) weekdays
    cron.schedule('30 2 * * 1-5', () => {
      console.log('[Reminder] Running daily follow-up digest…');
      sendDailyReminders().catch(e => console.error('[Reminder] Daily digest error:', e.message));
    }, { timezone: 'Asia/Kolkata' });

    // 9:00 AM IST every day — overdue check
    cron.schedule('30 3 * * *', () => {
      console.log('[Reminder] Checking overdue follow-ups…');
      checkOverdue().catch(e => console.error('[Reminder] Overdue check error:', e.message));
    }, { timezone: 'Asia/Kolkata' });

    console.log('[Reminder] Engine started — 2 jobs scheduled');
  } catch (err) {
    console.error('[Reminder] Failed to schedule jobs:', err.message);
  }
}

module.exports = { start, sendDailyReminders };
