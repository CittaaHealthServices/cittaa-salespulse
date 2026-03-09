/**
 * Cittaa SalesPulse — Google Calendar Service
 *
 * Creates calendar events automatically when follow-ups are scheduled.
 *
 * Setup (one time):
 *   1. Run: node scripts/get-google-token.js
 *   2. Paste the printed GOOGLE_REFRESH_TOKEN into Railway env vars
 *
 * Required Railway env vars:
 *   GOOGLE_CLIENT_ID      — from Google Cloud Console OAuth2 credentials
 *   GOOGLE_CLIENT_SECRET  — from Google Cloud Console OAuth2 credentials
 *   GOOGLE_REFRESH_TOKEN  — from running scripts/get-google-token.js
 *   GOOGLE_CALENDAR_ID    — optional, defaults to "primary"
 */

const { google } = require('googleapis');

// ─── Channel config ───────────────────────────────────────────────────────────
const CHANNEL_EMOJI = {
  email: '📧',
  whatsapp: '💬',
  call: '📞',
  linkedin: '🔗',
  visit: '🏢',
  meeting: '🤝',
};

// Google Calendar colour IDs (1-11)
const CHANNEL_COLOR = {
  visit: '6',    // Tangerine — site visits stand out
  meeting: '9',  // Blueberry — in-person meetings
  call: '5',     // Banana — quick calls
  email: '1',    // Lavender
  whatsapp: '2', // Sage
  linkedin: '3', // Grape
};

// Duration by channel (minutes)
const CHANNEL_DURATION = {
  visit: 120,
  meeting: 60,
  call: 30,
  email: 15,
  whatsapp: 15,
  linkedin: 15,
};

const TEAM_EMAILS = ['sairam@cittaa.in', 'abhijay@cittaa.in', 'pratya@cittaa.in'];

// ─── OAuth2 client (lazily initialised) ──────────────────────────────────────

function getOAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) return null;

  const client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
  );
  client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return client;
}

// ─── Create a calendar event for a follow-up ─────────────────────────────────

async function createFollowupEvent(followup, lead) {
  const auth = getOAuthClient();
  if (!auth) {
    console.log('[Calendar] Not configured — set GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN to enable');
    return null;
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth });

    const dueDate = new Date(followup.due_date);
    const durationMin = CHANNEL_DURATION[followup.channel] || 30;
    const endDate = new Date(dueDate.getTime() + durationMin * 60 * 1000);

    const emoji = CHANNEL_EMOJI[followup.channel] || '📋';
    const ownerName = followup.owner === 'S' ? 'Sairam' : followup.owner === 'A' ? 'Abhijay' : followup.owner || 'Team';
    const orgName = lead?.org_name || 'Lead';
    const contact = lead?.contact_name
      ? `${lead.contact_name}${lead.role ? ` (${lead.role})` : ''}`
      : null;

    const description = [
      `📋 Follow-up: ${followup.action}`,
      `🏢 Organisation: ${orgName}`,
      contact ? `👤 Contact: ${contact}` : null,
      lead?.phone ? `📞 Phone: ${lead.phone}` : null,
      lead?.email ? `📧 Email: ${lead.email}` : null,
      lead?.city ? `📍 Location: ${lead.city}` : null,
      `📺 Channel: ${followup.channel}`,
      `👤 Owner: ${ownerName}`,
      followup.notes ? `📝 Notes: ${followup.notes}` : null,
      '',
      '─────────────────',
      'Created by Cittaa SalesPulse',
    ]
      .filter(Boolean)
      .join('\n');

    const event = {
      summary: `${emoji} ${followup.action} · ${orgName}`,
      description,
      start: {
        dateTime: dueDate.toISOString(),
        timeZone: 'Asia/Kolkata',
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: 'Asia/Kolkata',
      },
      attendees: TEAM_EMAILS.map((email) => ({ email })),
      colorId: CHANNEL_COLOR[followup.channel] || '1',
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 },
          { method: 'email', minutes: 60 },
          // Extra reminder for visits
          ...(followup.channel === 'visit'
            ? [{ method: 'popup', minutes: 1440 }] // 24h before
            : []),
        ],
      },
      source: {
        title: 'Cittaa SalesPulse',
        url: process.env.APP_URL || 'https://cittaa-salespulse.up.railway.app',
      },
    };

    const response = await calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      resource: event,
      sendUpdates: 'all', // sends invite to both Sairam + Abhijay
    });

    console.log(`[Calendar] ✅ Event created: "${event.summary}" — ${response.data.htmlLink}`);
    return { eventId: response.data.id, htmlLink: response.data.htmlLink };
  } catch (err) {
    console.error('[Calendar] ❌ Failed to create event:', err.message);
    return null;
  }
}

// ─── Create a "New Lead — First Contact" placeholder event when lead approved ─

async function createLeadApprovedEvent(lead) {
  const auth = getOAuthClient();
  if (!auth) return null;

  try {
    const calendar = google.calendar({ version: 'v3', auth });

    // Schedule a "first contact" planning block 2 business days from now
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 2);
    startDate.setHours(10, 0, 0, 0); // 10:00 AM IST

    // Skip weekends
    const day = startDate.getDay();
    if (day === 6) startDate.setDate(startDate.getDate() + 2); // Saturday → Monday
    if (day === 0) startDate.setDate(startDate.getDate() + 1); // Sunday → Monday

    const endDate = new Date(startDate.getTime() + 30 * 60 * 1000); // +30 min

    const typeEmoji = lead.type === 'school' ? '🏫' : '🏢';
    const contact = lead.contact_name
      ? `\n👤 Contact: ${lead.contact_name}${lead.role ? ` (${lead.role})` : ''}`
      : '';
    const value = lead.contract_value
      ? `\n💰 Est. Value: ₹${(lead.contract_value / 100000).toFixed(1)}L`
      : '';

    const description = [
      `${typeEmoji} New lead added to pipeline from Lead Radar.`,
      '',
      `🏢 Organisation: ${lead.org_name}`,
      lead.city ? `📍 Location: ${lead.city}` : null,
      lead.phone ? `📞 Phone: ${lead.phone}` : null,
      lead.email ? `📧 Email: ${lead.email}` : null,
      contact,
      value,
      lead.notes ? `\n📝 Notes: ${lead.notes}` : null,
      '',
      '─────────────────',
      'Review lead and plan first outreach. Created by Cittaa SalesPulse Lead Radar.',
    ]
      .filter((x) => x !== null)
      .join('\n');

    const event = {
      summary: `🎯 New Lead: ${lead.org_name} — Plan First Outreach`,
      description,
      start: { dateTime: startDate.toISOString(), timeZone: 'Asia/Kolkata' },
      end: { dateTime: endDate.toISOString(), timeZone: 'Asia/Kolkata' },
      attendees: TEAM_EMAILS.map((email) => ({ email })),
      colorId: '9', // Blueberry — new leads
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: 15 }],
      },
    };

    const response = await calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      resource: event,
      sendUpdates: 'all',
    });

    console.log(`[Calendar] ✅ Lead event created: "${event.summary}"`);
    return { eventId: response.data.id, htmlLink: response.data.htmlLink };
  } catch (err) {
    console.error('[Calendar] ❌ Failed to create lead event:', err.message);
    return null;
  }
}

module.exports = { createFollowupEvent, createLeadApprovedEvent };
