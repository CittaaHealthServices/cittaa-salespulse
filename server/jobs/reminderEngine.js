/**
 * Cittaa SalesPulse — Reminder Engine
 * Runs scheduled cron jobs for:
 *   - 8:00 AM daily digest (overdue + due today + visits tomorrow)
 *   - Every 30 min: site visit pre-alerts (2h before)
 *   - 6:00 PM: end-of-day overdue summary
 */

const cron = require('node-cron');
const Followup = require('../models/Followup');
const {
  sendDailyDigestEmail,
  sendVisitReminderEmail,
  sendOverdueAlertEmail,
} = require('../services/emailService');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function startOfDay(d = new Date()) {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}
function endOfDay(d = new Date()) {
  const s = new Date(d);
  s.setHours(23, 59, 59, 999);
  return s;
}

// ─── 1. Daily Morning Digest (8:00 AM IST) ───────────────────────────────────
async function runMorningDigest() {
  console.log('[Reminder] Running morning digest...');
  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [overdueItems, dueTodayItems, visitsTomorrow] = await Promise.all([
      // Overdue (due before today, still pending)
      Followup.find({
        status: 'pending',
        due_date: { $lt: todayStart },
      })
        .populate('lead_id', 'org_name type city contact_name')
        .sort({ due_date: 1 })
        .limit(20),

      // Due today
      Followup.find({
        status: 'pending',
        due_date: { $gte: todayStart, $lte: todayEnd },
      })
        .populate('lead_id', 'org_name type city contact_name')
        .sort({ due_date: 1 })
        .limit(20),

      // Site visits tomorrow
      Followup.find({
        status: 'pending',
        channel: 'visit',
        due_date: { $gte: startOfDay(tomorrow), $lte: endOfDay(tomorrow) },
      })
        .populate('lead_id', 'org_name type city contact_name phone')
        .sort({ due_date: 1 }),
    ]);

    await sendDailyDigestEmail(overdueItems, dueTodayItems, visitsTomorrow);
    console.log(
      `[Reminder] Morning digest sent — Overdue: ${overdueItems.length}, Today: ${dueTodayItems.length}, Visits: ${visitsTomorrow.length}`
    );
  } catch (err) {
    console.error('[Reminder] Morning digest failed:', err.message);
  }
}

// ─── 2. Visit Pre-Alert (runs every 30 min — checks for visits in ~2h) ───────
// Tracks which visit IDs we've already alerted for (resets on server restart — that's fine)
const alertedVisits = new Set();

async function runVisitPreAlert() {
  try {
    const now = new Date();
    // Window: visits starting 1h45m → 2h15m from now
    const windowStart = new Date(now.getTime() + 1 * 60 * 60 * 1000 + 45 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000 + 15 * 60 * 1000);

    const upcomingVisits = await Followup.find({
      status: 'pending',
      channel: 'visit',
      due_date: { $gte: windowStart, $lte: windowEnd },
    }).populate('lead_id', 'org_name type city contact_name phone role');

    for (const visit of upcomingVisits) {
      const key = visit._id.toString();
      if (alertedVisits.has(key)) continue;
      alertedVisits.add(key);
      const hoursAway = Math.round((new Date(visit.due_date) - now) / (1000 * 60 * 60));
      await sendVisitReminderEmail(visit, visit.lead_id, hoursAway);
      console.log(`[Reminder] Visit alert sent for ${visit.lead_id?.org_name} in ~${hoursAway}h`);
    }

    // Also check for visits tomorrow (run once around 8pm)
    const tomorrowStart = startOfDay(new Date(now.getTime() + 24 * 60 * 60 * 1000));
    const tomorrowEnd = endOfDay(new Date(now.getTime() + 24 * 60 * 60 * 1000));
    const visitsTomorrow = await Followup.find({
      status: 'pending',
      channel: 'visit',
      due_date: { $gte: tomorrowStart, $lte: tomorrowEnd },
    }).populate('lead_id', 'org_name type city contact_name phone role');

    for (const visit of visitsTomorrow) {
      const key = `tomorrow-${visit._id}`;
      if (alertedVisits.has(key)) continue;
      alertedVisits.add(key);
      await sendVisitReminderEmail(visit, visit.lead_id, 24);
      console.log(`[Reminder] Tomorrow visit alert sent for ${visit.lead_id?.org_name}`);
    }
  } catch (err) {
    console.error('[Reminder] Visit pre-alert failed:', err.message);
  }
}

// ─── 3. Evening Overdue Summary (6:00 PM IST) ────────────────────────────────
async function runEveningOverdueSummary() {
  console.log('[Reminder] Running evening overdue summary...');
  try {
    const todayStart = startOfDay();

    const overdueItems = await Followup.find({
      status: 'pending',
      due_date: { $lt: todayStart },
    })
      .populate('lead_id', 'org_name type city contact_name')
      .sort({ due_date: 1 })
      .limit(20);

    if (overdueItems.length > 0) {
      await sendOverdueAlertEmail(overdueItems);
      console.log(`[Reminder] Evening overdue summary sent — ${overdueItems.length} items`);
    } else {
      console.log('[Reminder] No overdue items — evening summary skipped');
    }
  } catch (err) {
    console.error('[Reminder] Evening summary failed:', err.message);
  }
}

// ─── Schedule all reminder jobs ───────────────────────────────────────────────
function startReminderJobs() {
  // 8:00 AM daily digest (IST = UTC+5:30 → 2:30 UTC)
  cron.schedule('30 2 * * *', () => {
    console.log('[Reminder] Cron: morning digest');
    runMorningDigest().catch(console.error);
  });

  // Every 30 min — check for upcoming visits in 2h
  cron.schedule('*/30 * * * *', () => {
    runVisitPreAlert().catch(console.error);
  });

  // 6:00 PM evening overdue summary (IST = 12:30 UTC)
  cron.schedule('30 12 * * *', () => {
    console.log('[Reminder] Cron: evening overdue summary');
    runEveningOverdueSummary().catch(console.error);
  });

  console.log('[Reminder] Reminder engine started (8am digest · 30min visit alerts · 6pm overdue)');
}

module.exports = { startReminderJobs, runMorningDigest, runEveningOverdueSummary, runVisitPreAlert };
