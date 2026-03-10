const { google } = require('googleapis');

const TEAM_EMAILS = ['sairam@cittaa.in', 'abhijay@cittaa.in', 'pratya@cittaa.in'];

// Only initialise OAuth2 when credentials exist — prevents startup crash
function getOAuth2Client() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) return null;
  const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return client;
}

function addBusinessDays(date, days) {
  const d = new Date(date);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d;
}

const CHANNEL_CONFIG = {
  call:  { duration: 30,  color: '9', emoji: '📞' },
  email: { duration: 15,  color: '7', emoji: '📧' },
  visit: { duration: 120, color: '6', emoji: '🏢' },
  demo:  { duration: 60,  color: '2', emoji: '🖥️' },
  other: { duration: 30,  color: '1', emoji: '📋' },
};

async function createFollowupEvent(followup, lead) {
  try {
    const auth = getOAuth2Client();
    if (!auth) { console.log('[Calendar] Skipping — credentials not set'); return null; }
    const cal = google.calendar({ version: 'v3', auth });
    const cfg = CHANNEL_CONFIG[followup.channel] || CHANNEL_CONFIG.other;
    const start = new Date(followup.scheduled_at || Date.now());
    const end = new Date(start.getTime() + cfg.duration * 60 * 1000);
    const res = await cal.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      sendUpdates: 'all',
      resource: {
        summary: `${cfg.emoji} Cittaa: ${(followup.channel || 'Follow-up').toUpperCase()} with ${lead?.org_name || 'Lead'}`,
        description: [
          `Org: ${lead?.org_name}`, `Type: ${lead?.type}`,
          `Target Role: ${lead?.target_role || lead?.role || '—'}`,
          `Contact: ${lead?.contact_name || '—'}`,
          lead?.email ? `Email: ${lead.email}` : '',
          lead?.phone ? `Phone: ${lead.phone}` : '',
          lead?.source_url ? `Job Post: ${lead.source_url}` : '',
          followup.notes ? `Notes: ${followup.notes}` : '',
        ].filter(Boolean).join('\n'),
        start: { dateTime: start.toISOString(), timeZone: 'Asia/Kolkata' },
        end:   { dateTime: end.toISOString(),   timeZone: 'Asia/Kolkata' },
        colorId: cfg.color,
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }, { method: 'email', minutes: 60 }] },
        attendees: TEAM_EMAILS.map(e => ({ email: e })),
      },
    });
    console.log('[Calendar] Follow-up created:', res.data.htmlLink);
    return res.data;
  } catch (err) { console.error('[Calendar] createFollowupEvent:', err.message); return null; }
}

async function createLeadApprovedEvent(lead) {
  try {
    const auth = getOAuth2Client();
    if (!auth) { console.log('[Calendar] Skipping — credentials not set'); return null; }
    const cal = google.calendar({ version: 'v3', auth });
    const start = addBusinessDays(new Date(), 2);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const res = await cal.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      sendUpdates: 'all',
      resource: {
        summary: `🎯 Plan Outreach: ${lead.org_name}`,
        description: [
          `New lead approved — plan first outreach.`, '',
          `Org: ${lead.org_name}`, `Type: ${lead.type}`, `City: ${lead.city || '—'}`,
          `Target Role: ${lead.target_role || lead.role || '—'}`,
          `Contact: ${lead.contact_name || 'To find'}`,
          lead.email ? `Email: ${lead.email}` : '',
          lead.phone ? `Phone: ${lead.phone}` : '',
          lead.source_url ? `Job Post: ${lead.source_url}` : '',
          lead.notes ? `Notes: ${lead.notes}` : '',
        ].filter(Boolean).join('\n'),
        start: { dateTime: start.toISOString(), timeZone: 'Asia/Kolkata' },
        end:   { dateTime: end.toISOString(),   timeZone: 'Asia/Kolkata' },
        colorId: '9',
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] },
        attendees: TEAM_EMAILS.map(e => ({ email: e })),
      },
    });
    console.log('[Calendar] Lead approved event created:', res.data.htmlLink);
    return res.data;
  } catch (err) { console.error('[Calendar] createLeadApprovedEvent:', err.message); return null; }
}

module.exports = { createFollowupEvent, createLeadApprovedEvent };
