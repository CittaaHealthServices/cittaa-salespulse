// emailService.js — safe version with lazy Resend initialisation
// Resend is only instantiated inside each function call, so a missing
// RESEND_API_KEY won't crash the server on startup.

const FROM_ADDRESS = 'Cittaa SalesPulse <noreply@cittaa.in>';
const TEAM_EMAILS  = ['sairam@cittaa.in', 'abhijay@cittaa.in', 'pratya@cittaa.in'];

// ── helper: get Resend instance (null-safe) ────────────────────────────────
function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log('[Email] Skipping — RESEND_API_KEY not set');
    return null;
  }
  try {
    const { Resend } = require('resend');
    return new Resend(key);
  } catch (e) {
    console.error('[Email] Failed to init Resend:', e.message);
    return null;
  }
}

// ── owner label ────────────────────────────────────────────────────────────
function ownerLabel(code) {
  if (code === 'S') return 'Sairam';
  if (code === 'A') return 'Abhijay';
  if (code === 'P') return 'Pratya';
  return code || 'Team';
}

// ── colour helpers ─────────────────────────────────────────────────────────
const TYPE_COLOURS = {
  school:    '#4F46E5',
  corporate: '#0EA5E9',
  clinic:    '#10B981',
  ngo:       '#F59E0B',
  rehab:     '#EF4444',
  coaching:  '#8B5CF6',
};
function typeColour(t) { return TYPE_COLOURS[t] || '#64748B'; }

// ═══════════════════════════════════════════════════════════════════════════
// sendLeadApprovedEmail — fired when a Radar lead is approved
// ═══════════════════════════════════════════════════════════════════════════
async function sendLeadApprovedEmail(lead, approverName) {
  const resend = getResend();
  if (!resend) return null;

  try {
    const colour     = typeColour(lead.type);
    const targetRole = lead.target_role || lead.role || '—';
    const sourceLink = lead.source_url
      ? `<a href="${lead.source_url}" style="color:#4F46E5;">View Job Post →</a>`
      : '—';

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,${colour},${colour}CC);padding:32px 40px;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">🎯 New Lead Approved</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">
              Approved by <strong>${approverName || 'Team'}</strong> · Cittaa SalesPulse
            </p>
          </td>
        </tr>

        <!-- Lead details -->
        <tr>
          <td style="padding:32px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:24px;">
                  <h2 style="margin:0 0 4px;font-size:24px;color:#1E293B;">${lead.org_name}</h2>
                  <span style="display:inline-block;background:${colour}20;color:${colour};padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;text-transform:uppercase;">${lead.type || 'lead'}</span>
                </td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">
              ${row('📍 Location',     [lead.city, lead.state].filter(Boolean).join(', ') || '—')}
              ${row('🎯 Target Role',  targetRole)}
              ${row('👤 Contact',      lead.contact_name || 'To find')}
              ${lead.email ? row('📧 Email', lead.email) : ''}
              ${lead.phone ? row('📞 Phone', lead.phone) : ''}
              ${lead.employees_or_students ? row('👥 Size', `${lead.employees_or_students.toLocaleString()} employees/students`) : ''}
              ${lead.contract_value ? row('💰 Est. Value', `₹${lead.contract_value.toLocaleString()}`) : ''}
              ${row('🤖 AI Score',     `${lead.ai_score || 50}/100`)}
              ${row('📋 Source',       sourceLink)}
            </table>

            ${lead.notes ? `
            <div style="margin-top:20px;padding:16px;background:#F8FAFC;border-radius:8px;border-left:4px solid ${colour};">
              <p style="margin:0;font-size:13px;color:#64748B;line-height:1.6;">${lead.notes}</p>
            </div>` : ''}

            <div style="margin-top:28px;padding:20px;background:#F0FDF4;border-radius:12px;border:1px solid #BBF7D0;">
              <p style="margin:0;color:#166534;font-size:14px;font-weight:600;">✅ Next Step</p>
              <p style="margin:8px 0 0;color:#166534;font-size:13px;">
                A calendar reminder has been created 2 business days from now to plan your first outreach.
              </p>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;background:#F8FAFC;border-top:1px solid #E2E8F0;">
            <p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;">
              Cittaa SalesPulse · AI-powered sales intelligence
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const res = await resend.emails.send({
      from:    FROM_ADDRESS,
      to:      TEAM_EMAILS,
      subject: `🎯 New Lead: ${lead.org_name} (${lead.type}) · Approved by ${approverName || 'Team'}`,
      html,
    });
    console.log('[Email] Lead approved email sent:', res?.data?.id);
    return res;
  } catch (err) {
    console.error('[Email] sendLeadApprovedEmail error:', err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// sendFollowupReminderEmail — daily digest of due follow-ups
// ═══════════════════════════════════════════════════════════════════════════
async function sendFollowupReminderEmail(followups, ownerCode) {
  const resend = getResend();
  if (!resend || !followups?.length) return null;

  try {
    const ownerEmail = ownerCode === 'S' ? 'sairam@cittaa.in'
                     : ownerCode === 'A' ? 'abhijay@cittaa.in'
                     : ownerCode === 'P' ? 'pratya@cittaa.in'
                     : null;
    if (!ownerEmail) return null;

    const rows = followups.map(f => {
      const lead = f.lead_id || {};
      return `
        <tr style="border-bottom:1px solid #E2E8F0;">
          <td style="padding:12px 16px;">
            <strong style="color:#1E293B;">${lead.org_name || '—'}</strong>
            <div style="font-size:12px;color:#64748B;margin-top:2px;">${lead.type || ''} · ${lead.city || ''}</div>
          </td>
          <td style="padding:12px 16px;text-align:center;">
            <span style="background:#EFF6FF;color:#3B82F6;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600;">
              ${(f.channel || 'call').toUpperCase()}
            </span>
          </td>
          <td style="padding:12px 16px;color:#64748B;font-size:13px;">${f.notes || '—'}</td>
        </tr>`;
    }).join('');

    const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#F59E0B,#D97706);padding:28px 40px;">
            <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">⏰ Follow-up Reminders</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">
              Hi ${ownerLabel(ownerCode)}, you have ${followups.length} follow-up${followups.length > 1 ? 's' : ''} due today
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr style="background:#F8FAFC;">
                <th style="padding:10px 16px;text-align:left;font-size:12px;color:#64748B;font-weight:600;">ORGANISATION</th>
                <th style="padding:10px 16px;text-align:center;font-size:12px;color:#64748B;font-weight:600;">CHANNEL</th>
                <th style="padding:10px 16px;text-align:left;font-size:12px;color:#64748B;font-weight:600;">NOTES</th>
              </tr>
              ${rows}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px;background:#F8FAFC;border-top:1px solid #E2E8F0;">
            <p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;">Cittaa SalesPulse · Daily Follow-up Digest</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const res = await resend.emails.send({
      from:    FROM_ADDRESS,
      to:      ownerEmail,
      subject: `⏰ ${followups.length} Follow-up${followups.length > 1 ? 's' : ''} Due Today — Cittaa SalesPulse`,
      html,
    });
    console.log('[Email] Reminder sent to', ownerEmail, res?.data?.id);
    return res;
  } catch (err) {
    console.error('[Email] sendFollowupReminderEmail error:', err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// sendStageChangedEmail — optional notification when lead stage changes
// ═══════════════════════════════════════════════════════════════════════════
async function sendStageChangedEmail(lead, oldStage, newStage, changedBy) {
  const resend = getResend();
  if (!resend) return null;

  // Only notify on Won/Lost
  if (!['Won', 'Lost'].includes(newStage)) return null;

  try {
    const isWon   = newStage === 'Won';
    const colour  = isWon ? '#10B981' : '#EF4444';
    const emoji   = isWon ? '🏆' : '❌';

    const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:${colour};padding:28px 40px;">
            <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">${emoji} Lead ${newStage}: ${lead.org_name}</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">
              ${oldStage} → ${newStage} · by ${ownerLabel(changedBy)}
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">
              ${row('🏢 Organisation', lead.org_name)}
              ${row('📂 Type',         lead.type || '—')}
              ${row('📍 City',         lead.city || '—')}
              ${row('👤 Contact',      lead.contact_name || '—')}
              ${lead.contract_value ? row('💰 Value', `₹${lead.contract_value.toLocaleString()}`) : ''}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;background:#F8FAFC;border-top:1px solid #E2E8F0;">
            <p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;">Cittaa SalesPulse</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const res = await resend.emails.send({
      from:    FROM_ADDRESS,
      to:      TEAM_EMAILS,
      subject: `${emoji} Lead ${newStage}: ${lead.org_name} · Cittaa SalesPulse`,
      html,
    });
    console.log('[Email] Stage change email sent:', res?.data?.id);
    return res;
  } catch (err) {
    console.error('[Email] sendStageChangedEmail error:', err.message);
    return null;
  }
}

// ── reusable table row template ────────────────────────────────────────────
function row(label, value) {
  if (!value || value === '—' && label !== '📍 Location') return '';
  return `
    <tr>
      <td style="padding:10px 16px;font-size:13px;color:#64748B;white-space:nowrap;border-bottom:1px solid #F1F5F9;background:#FAFAFA;font-weight:500;width:160px;">${label}</td>
      <td style="padding:10px 16px;font-size:13px;color:#1E293B;border-bottom:1px solid #F1F5F9;">${value}</td>
    </tr>`;
}

module.exports = {
  sendLeadApprovedEmail,
  sendFollowupReminderEmail,
  sendStageChangedEmail,
};
