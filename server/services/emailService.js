/**
 * Cittaa SalesPulse — Email Service
 * Uses Resend (https://resend.com) for transactional emails.
 *
 * Recipients: Sairam (sairam@cittaa.in), Abhijay (abhijay@cittaa.in), Pratya (pratya@cittaa.in)
 * Set RESEND_API_KEY and RESEND_FROM in Railway environment variables.
 */

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.RESEND_FROM || 'SalesPulse <no-reply@cittaa.in>';
const TEAM = ['sairam@cittaa.in', 'abhijay@cittaa.in', 'pratya@cittaa.in'];

// ─── Brand constants ──────────────────────────────────────────────────────────
const PURPLE = '#8B5A96';
const TEAL = '#7BB3A8';
const INK = '#1a1625';
const APP_URL = process.env.APP_URL || 'https://cittaa-salespulse.up.railway.app';

// ─── Base HTML wrapper ────────────────────────────────────────────────────────
function baseTemplate(title, bodyContent) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f3f9;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3f9;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(139,90,150,0.10);">
          <!-- Header -->
          <tr>
            <td style="background:${INK};padding:24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-family:'Georgia',serif;font-size:22px;color:${TEAL};letter-spacing:1px;">Cittaa</span>
                    <span style="font-size:12px;color:#a0a0b0;margin-left:8px;vertical-align:middle;">SalesPulse</span>
                  </td>
                  <td align="right">
                    <span style="font-size:11px;color:#6b6880;">${new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9f7fc;padding:20px 32px;border-top:1px solid #ede8f4;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <a href="${APP_URL}" style="color:${PURPLE};font-size:13px;text-decoration:none;">Open SalesPulse →</a>
                  </td>
                  <td align="right">
                    <span style="font-size:11px;color:#b0a8be;">Cittaa Health Services, Hyderabad</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function badge(text, color = PURPLE) {
  return `<span style="display:inline-block;background:${color}20;color:${color};font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;letter-spacing:0.5px;">${text}</span>`;
}

function pill(label, value) {
  return `
  <td style="padding:8px 12px;background:#f9f7fc;border-radius:8px;text-align:center;min-width:80px;">
    <div style="font-size:20px;font-weight:700;color:${PURPLE};">${value}</div>
    <div style="font-size:11px;color:#888;margin-top:2px;">${label}</div>
  </td>`;
}

function sectionTitle(text, emoji = '') {
  return `<h2 style="font-size:16px;font-weight:700;color:${INK};margin:0 0 16px 0;">${emoji ? emoji + ' ' : ''}${text}</h2>`;
}

function divider() {
  return `<hr style="border:none;border-top:1px solid #ede8f4;margin:24px 0;">`;
}

function ctaButton(text, url) {
  return `<a href="${url}" style="display:inline-block;background:${PURPLE};color:#ffffff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:8px;">${text}</a>`;
}

function infoRow(label, value) {
  if (!value) return '';
  return `
  <tr>
    <td style="padding:6px 0;font-size:13px;color:#888;width:140px;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;font-size:13px;color:${INK};font-weight:500;">${value}</td>
  </tr>`;
}

function formatINR(amount) {
  if (!amount) return '—';
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(0)}K`;
  return `₹${amount}`;
}

// ─── Target role label per lead type ─────────────────────────────────────────
// Shows WHO at the organisation Cittaa should be talking to
function targetRoleLabel(lead) {
  // If the lead already has a known contact role, use it
  if (lead.role) return lead.role;
  // Otherwise infer from type
  const defaults = {
    school:    'Principal / Vice Principal / Counselling Coordinator',
    coaching:  'Centre Director / Academic Head',
    corporate: 'HR Head / CHRO / Wellness Manager',
    clinic:    'Founder / Lead Psychologist / Director',
    ngo:       'Programme Director / CEO',
    rehab:     'Centre Director / Head Therapist',
  };
  return defaults[lead.type] || 'Decision Maker';
}

// Type → readable label with emoji
function typeLabel(type) {
  const map = {
    school:    '🏫 School',
    coaching:  '📚 Coaching Institute',
    corporate: '🏢 Corporate',
    clinic:    '🧠 Psychology Clinic',
    ngo:       '🤝 NGO',
    rehab:     '♿ Rehab / Special Needs',
  };
  return map[type] || '🏢 Organisation';
}

// ─── Safe send wrapper ────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[Email] RESEND_API_KEY not set — skipping email: "${subject}"`);
    return;
  }
  try {
    const recipients = Array.isArray(to) ? to : [to];
    await resend.emails.send({ from: FROM, to: recipients, subject, html });
    console.log(`[Email] Sent "${subject}" → ${recipients.join(', ')}`);
  } catch (err) {
    console.error(`[Email] Failed to send "${subject}":`, err.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  EMAIL TEMPLATES
// ══════════════════════════════════════════════════════════════════════════════

// ─── 1. New Lead Created (manual) ─────────────────────────────────────────────
async function sendNewLeadEmail(lead) {
  const tLabel = typeLabel(lead.type);
  const targetRole = targetRoleLabel(lead);
  const sizeUnit = ['school', 'coaching'].includes(lead.type) ? 'students' : 'employees / patients';

  const html = baseTemplate(
    `New Lead: ${lead.org_name}`,
    `
    ${sectionTitle('New Lead Added', '🎯')}
    <p style="color:#555;font-size:14px;margin:0 0 20px 0;">A new lead has been added to Cittaa SalesPulse and is ready for outreach.</p>

    <div style="background:#f9f7fc;border-left:4px solid ${PURPLE};border-radius:0 8px 8px 0;padding:20px;margin-bottom:16px;">
      <div style="font-size:18px;font-weight:700;color:${INK};margin-bottom:6px;">${lead.org_name}</div>
      <div style="margin-bottom:14px;">${badge(tLabel)} ${lead.city ? badge(lead.city, TEAL) : ''}</div>

      <!-- Target Role Banner -->
      <div style="background:${PURPLE}12;border:1px solid ${PURPLE}30;border-radius:8px;padding:10px 14px;margin-bottom:14px;">
        <span style="font-size:11px;color:${PURPLE};font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">🎯 Target Role for Outreach</span>
        <div style="font-size:14px;font-weight:600;color:${INK};margin-top:4px;">${targetRole}</div>
      </div>

      <table cellpadding="0" cellspacing="0">
        ${infoRow('Contact Found', lead.contact_name ? `${lead.contact_name}${lead.role ? ` · ${lead.role}` : ''}` : '—')}
        ${infoRow('📧 Email', lead.email || '—')}
        ${infoRow('📞 Phone', lead.phone || '—')}
        ${infoRow('Size', lead.employees_or_students ? `${lead.employees_or_students.toLocaleString('en-IN')} ${sizeUnit}` : null)}
        ${infoRow('Est. Value', formatINR(lead.contract_value))}
        ${infoRow('Priority', lead.priority?.toUpperCase())}
        ${infoRow('AI Score', lead.ai_score ? `${lead.ai_score}/100` : null)}
      </table>
    </div>

    ${ctaButton('View Lead in SalesPulse', `${APP_URL}/leads`)}
    `
  );
  await sendEmail({ to: TEAM, subject: `🎯 New Lead: ${lead.org_name} · ${tLabel} · ${lead.city || 'India'}`, html });
}

// ─── 2. New Lead Auto-discovered (Lead Radar — new items in queue) ────────────
async function sendRadarDiscoveryEmail(leads) {
  if (!leads || leads.length === 0) return;
  const topLeads = leads.slice(0, 5);

  const leadRows = topLeads.map((l) => {
    const tLabel = typeLabel(l.type);
    const roleTarget = l.role || targetRoleLabel(l);
    const scoreColor = l.ai_score >= 70 ? '#16a34a' : l.ai_score >= 45 ? '#d97706' : '#dc2626';
    const scoreBg = l.ai_score >= 70 ? '#22c55e' : l.ai_score >= 45 ? '#f59e0b' : '#ef4444';
    const contactLine = l.contact_name
      ? `${l.contact_name} · ${l.role || roleTarget}`
      : `Target: ${roleTarget}`;
    return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #ede8f4;">
        <div style="font-weight:600;color:${INK};font-size:14px;">${l.org_name}</div>
        <div style="font-size:11px;color:#888;margin-top:3px;">${tLabel} ${l.city ? '· ' + l.city : ''}</div>
        <div style="font-size:12px;color:${PURPLE};font-weight:500;margin-top:4px;">🎯 ${contactLine}</div>
        ${l.email ? `<div style="font-size:12px;color:#555;margin-top:2px;">📧 ${l.email}</div>` : ''}
        ${l.phone ? `<div style="font-size:12px;color:#555;margin-top:2px;">📞 ${l.phone}</div>` : ''}
        ${l.ai_reasoning ? `<div style="font-size:11px;color:#777;margin-top:4px;font-style:italic;">${l.ai_reasoning}</div>` : ''}
      </td>
      <td style="padding:12px 0;border-bottom:1px solid #ede8f4;text-align:right;vertical-align:top;min-width:80px;">
        <span style="display:inline-block;background:${scoreBg}20;color:${scoreColor};font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px;">${l.ai_score}/100</span>
        <div style="font-size:11px;color:#999;margin-top:4px;">${formatINR(l.estimated_value)}</div>
      </td>
    </tr>
  `}).join('');

  const html = baseTemplate(
    `Lead Radar: ${leads.length} New Leads Found`,
    `
    ${sectionTitle('Lead Radar Discovery', '📡')}
    <p style="color:#555;font-size:14px;margin:0 0 20px 0;">Cittaa's AI just discovered <strong>${leads.length} new potential leads</strong> in Hyderabad. ${leads.length > 5 ? `Showing top 5 — <a href="${APP_URL}/radar" style="color:${PURPLE};">view all in Lead Radar</a>.` : 'Review and approve them in Lead Radar.'}</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${leadRows}
    </table>

    ${ctaButton('Review Leads in Lead Radar', `${APP_URL}/radar`)}
    `
  );
  await sendEmail({
    to: TEAM,
    subject: `📡 Lead Radar: ${leads.length} new leads discovered in Hyderabad`,
    html,
  });
}

// ─── 3. Lead Approved from Radar ─────────────────────────────────────────────
async function sendLeadApprovedEmail(lead, approvedBy) {
  const approverName = approvedBy === 'S' ? 'Sairam' : approvedBy === 'A' ? 'Abhijay' : approvedBy === 'P' ? 'Pratya' : approvedBy;
  const tLabel = typeLabel(lead.type);
  const targetRole = targetRoleLabel(lead);
  const sizeUnit = ['school', 'coaching'].includes(lead.type) ? 'students' : 'employees / patients';

  const html = baseTemplate(
    `Lead Approved: ${lead.org_name}`,
    `
    ${sectionTitle('Lead Approved & Added to Pipeline', '✅')}
    <p style="color:#555;font-size:14px;margin:0 0 20px 0;"><strong>${approverName}</strong> approved a discovered lead. It's now live in the pipeline.</p>

    <div style="background:#f0fdf4;border-left:4px solid #22c55e;border-radius:0 8px 8px 0;padding:20px;margin-bottom:16px;">
      <div style="font-size:18px;font-weight:700;color:${INK};margin-bottom:6px;">${lead.org_name}</div>
      <div style="margin-bottom:14px;">${badge(tLabel, '#16a34a')} ${lead.city ? badge(lead.city, TEAL) : ''}</div>

      <!-- Target Role Banner -->
      <div style="background:${PURPLE}12;border:1px solid ${PURPLE}30;border-radius:8px;padding:10px 14px;margin-bottom:14px;">
        <span style="font-size:11px;color:${PURPLE};font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">🎯 Target Role for Outreach</span>
        <div style="font-size:14px;font-weight:600;color:${INK};margin-top:4px;">${targetRole}</div>
      </div>

      <table cellpadding="0" cellspacing="0">
        ${infoRow('Contact Found', lead.contact_name ? `${lead.contact_name}${lead.role ? ` · ${lead.role}` : ''}` : 'None found')}
        ${infoRow('📧 Email', lead.email || '—')}
        ${infoRow('📞 Phone', lead.phone || '—')}
        ${infoRow('Size', lead.employees_or_students ? `${lead.employees_or_students.toLocaleString('en-IN')} ${sizeUnit}` : null)}
        ${infoRow('Est. Value', formatINR(lead.contract_value))}
        ${infoRow('AI Score', lead.ai_score ? `${lead.ai_score}/100` : null)}
        ${infoRow('Pipeline Stage', lead.stage)}
      </table>
    </div>

    ${ctaButton('Open in Lead Hub', `${APP_URL}/leads`)}
    `
  );
  await sendEmail({
    to: TEAM,
    subject: `✅ Lead Approved: ${lead.org_name} · ${tLabel} — Ready for Outreach`,
    html,
  });
}

// ─── 4. Follow-up Scheduled ───────────────────────────────────────────────────
async function sendFollowupScheduledEmail(followup, lead) {
  const dueDate = new Date(followup.due_date);
  const formattedDue = dueDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const channelEmoji = { email: '📧', whatsapp: '💬', call: '📞', linkedin: '🔗', visit: '🏢', meeting: '🤝' }[followup.channel] || '📋';

  const html = baseTemplate(
    `Follow-up Scheduled: ${lead?.org_name || 'Lead'}`,
    `
    ${sectionTitle('Follow-up Scheduled', '📅')}
    <p style="color:#555;font-size:14px;margin:0 0 20px 0;">A follow-up task has been scheduled. Don't let this one slip!</p>

    <div style="background:#f5f3f9;border-radius:10px;padding:20px;margin-bottom:24px;">
      <div style="font-size:16px;font-weight:700;color:${INK};margin-bottom:4px;">${channelEmoji} ${followup.action}</div>
      <div style="margin:8px 0;">${badge(followup.channel?.toUpperCase())} ${badge(followup.owner === 'S' ? 'Sairam' : followup.owner === 'A' ? 'Abhijay' : followup.owner === 'P' ? 'Pratya' : (followup.owner || 'Team'), TEAL)}</div>
      <table cellpadding="0" cellspacing="0" style="margin-top:12px;">
        ${infoRow('Lead', lead?.org_name)}
        ${infoRow('Due', formattedDue)}
        ${infoRow('Channel', followup.channel)}
        ${followup.notes ? infoRow('Notes', followup.notes) : ''}
      </table>
    </div>

    ${ctaButton('Open Follow-up Engine', `${APP_URL}/followups`)}
    `
  );
  await sendEmail({
    to: TEAM,
    subject: `📅 Follow-up Scheduled: ${followup.channel} · ${lead?.org_name || 'Lead'} — Due ${formattedDue}`,
    html,
  });
}

// ─── 5. Daily Reminder Digest ─────────────────────────────────────────────────
async function sendDailyDigestEmail(overdueItems, dueTodayItems, visitsTomorrow) {
  const totalUrgent = overdueItems.length + dueTodayItems.length;
  if (totalUrgent === 0 && visitsTomorrow.length === 0) return;

  function renderFollowupList(items, color, label) {
    if (!items.length) return '';
    const rows = items.map((f) => {
      const channelEmoji = { email: '📧', whatsapp: '💬', call: '📞', linkedin: '🔗', visit: '🏢', meeting: '🤝' }[f.channel] || '📋';
      const dueStr = f.due_date ? new Date(f.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
      return `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #ede8f4;">
          <div style="font-weight:600;color:${INK};font-size:13px;">${f.lead_id?.org_name || 'Lead'}</div>
          <div style="font-size:12px;color:#666;margin-top:2px;">${channelEmoji} ${f.action}</div>
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #ede8f4;text-align:right;vertical-align:top;">
          <span style="font-size:11px;color:${color};font-weight:600;">${dueStr}</span>
          <br><span style="font-size:11px;color:#999;">${f.owner === 'S' ? 'Sairam' : f.owner === 'A' ? 'Abhijay' : f.owner === 'P' ? 'Pratya' : (f.owner || 'Team')}</span>
        </td>
      </tr>`;
    }).join('');
    return `
    <div style="margin-bottom:20px;">
      <div style="font-size:13px;font-weight:700;color:${color};margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">${label}</div>
      <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    </div>`;
  }

  const html = baseTemplate(
    'Daily Sales Digest',
    `
    ${sectionTitle('Good Morning! Your Sales Digest', '☀️')}
    <p style="color:#555;font-size:14px;margin:0 0 20px 0;">Here's what needs your attention today, ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}.</p>

    <!-- Stats pills -->
    <table cellpadding="0" cellspacing="8" style="margin-bottom:24px;">
      <tr>
        ${pill('Overdue', overdueItems.length)}
        <td width="8"></td>
        ${pill('Due Today', dueTodayItems.length)}
        <td width="8"></td>
        ${pill('Visits Tomorrow', visitsTomorrow.length)}
      </tr>
    </table>

    ${divider()}

    ${renderFollowupList(overdueItems, '#ef4444', '🔴 Overdue')}
    ${renderFollowupList(dueTodayItems, '#f59e0b', '🟡 Due Today')}
    ${renderFollowupList(visitsTomorrow, '#3b82f6', '🔵 Site Visits Tomorrow')}

    ${ctaButton('Open Follow-up Engine', `${APP_URL}/followups`)}
    `
  );
  await sendEmail({
    to: TEAM,
    subject: `☀️ Daily Digest: ${overdueItems.length} overdue · ${dueTodayItems.length} due today · ${visitsTomorrow.length} visits tomorrow`,
    html,
  });
}

// ─── 6. Visit Reminder (1 day before) ────────────────────────────────────────
async function sendVisitReminderEmail(followup, lead, hoursAway) {
  const dueDate = new Date(followup.due_date);
  const formattedDue = dueDate.toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

  const html = baseTemplate(
    `Site Visit Reminder: ${lead?.org_name}`,
    `
    ${sectionTitle(`Site Visit ${hoursAway <= 2 ? 'In 2 Hours!' : 'Tomorrow'}`, '🏢')}
    <p style="color:#555;font-size:14px;margin:0 0 20px 0;">${hoursAway <= 2 ? '⚠️ Your site visit is in <strong>2 hours</strong>. Make sure you\'re prepared!' : 'You have a <strong>site visit scheduled for tomorrow</strong>. Time to prep!'}</p>

    <div style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:0 8px 8px 0;padding:20px;margin-bottom:24px;">
      <div style="font-size:18px;font-weight:700;color:${INK};margin-bottom:4px;">🏢 ${lead?.org_name}</div>
      <div style="margin-bottom:12px;">${badge(lead?.city || '', '#3b82f6')} ${badge(lead?.type === 'school' ? 'School' : 'Corporate', TEAL)}</div>
      <table cellpadding="0" cellspacing="0">
        ${infoRow('When', formattedDue)}
        ${infoRow('Contact', lead?.contact_name ? `${lead.contact_name}${lead.role ? ` · ${lead.role}` : ''}` : null)}
        ${infoRow('Phone', lead?.phone)}
        ${infoRow('Address', lead?.city)}
        ${infoRow('Purpose', followup.action)}
        ${followup.notes ? infoRow('Notes', followup.notes) : ''}
      </table>
    </div>

    <div style="background:#fef3c7;border-radius:8px;padding:12px 16px;font-size:13px;color:#92400e;margin-bottom:20px;">
      💡 <strong>Quick prep:</strong> Review lead history, check last AI-composed message, and confirm the contact details above before heading out.
    </div>

    ${ctaButton('View Lead Details', `${APP_URL}/leads`)}
    `
  );
  await sendEmail({
    to: TEAM,
    subject: `🏢 ${hoursAway <= 2 ? '⚠️ Visit in 2hrs:' : 'Visit Tomorrow:'} ${lead?.org_name} — ${formattedDue}`,
    html,
  });
}

// ─── 7. Overdue Call/Email Alert ──────────────────────────────────────────────
async function sendOverdueAlertEmail(items) {
  if (!items.length) return;
  const rows = items.slice(0, 8).map((f) => {
    const daysLate = Math.floor((Date.now() - new Date(f.due_date)) / (1000 * 60 * 60 * 24));
    const channelEmoji = { email: '📧', whatsapp: '💬', call: '📞', linkedin: '🔗', visit: '🏢', meeting: '🤝' }[f.channel] || '📋';
    return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #ede8f4;">
        <div style="font-weight:600;color:${INK};font-size:14px;">${f.lead_id?.org_name || 'Lead'}</div>
        <div style="font-size:12px;color:#888;margin-top:2px;">${channelEmoji} ${f.action} · ${f.owner === 'S' ? 'Sairam' : f.owner === 'A' ? 'Abhijay' : f.owner === 'P' ? 'Pratya' : (f.owner || 'Team')}</div>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #ede8f4;text-align:right;vertical-align:top;">
        <span style="display:inline-block;background:#fef2f2;color:#dc2626;font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px;">${daysLate}d late</span>
      </td>
    </tr>`;
  }).join('');

  const html = baseTemplate(
    `${items.length} Overdue Follow-ups`,
    `
    ${sectionTitle(`${items.length} Overdue Follow-up${items.length > 1 ? 's' : ''}`, '🚨')}
    <p style="color:#555;font-size:14px;margin:0 0 20px 0;">These follow-ups are past due. Every day without contact reduces conversion probability significantly.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${rows}
    </table>

    ${ctaButton('Handle Overdue Follow-ups', `${APP_URL}/followups`)}
    `
  );
  await sendEmail({
    to: TEAM,
    subject: `🚨 ${items.length} Overdue Follow-up${items.length > 1 ? 's' : ''} — Action Needed`,
    html,
  });
}

module.exports = {
  sendNewLeadEmail,
  sendRadarDiscoveryEmail,
  sendLeadApprovedEmail,
  sendFollowupScheduledEmail,
  sendDailyDigestEmail,
  sendVisitReminderEmail,
  sendOverdueAlertEmail,
};
