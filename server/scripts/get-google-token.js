/**
 * Cittaa SalesPulse — Google Calendar OAuth Setup
 *
 * Run this ONCE on your local machine to get a refresh token.
 * Then paste the token into Railway as GOOGLE_REFRESH_TOKEN.
 *
 * Usage:
 *   1. Install deps:  npm install (in /server)
 *   2. Run:           node scripts/get-google-token.js
 *   3. Open the URL shown in your browser
 *   4. Sign in with sairam@cittaa.in or abhijay@cittaa.in
 *   5. Copy the code from the redirect URL
 *   6. Paste the code into the terminal
 *   7. Copy the printed GOOGLE_REFRESH_TOKEN into Railway env vars
 */

const { google } = require('googleapis');
const readline = require('readline');

// ── Paste your Google Cloud Console credentials here ──────────────────────────
// Get from: https://console.cloud.google.com/ → APIs & Services → Credentials
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID_HERE';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'YOUR_CLIENT_SECRET_HERE';
const REDIRECT_URI = 'https://developers.google.com/oauthplayground';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

async function main() {
  if (CLIENT_ID === 'YOUR_CLIENT_ID_HERE') {
    console.error('\n❌ Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars first.');
    console.error('   export GOOGLE_CLIENT_ID="your_client_id"');
    console.error('   export GOOGLE_CLIENT_SECRET="your_client_secret"');
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force to get refresh_token every time
  });

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Cittaa SalesPulse — Google Calendar OAuth Setup');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('Step 1: Open this URL in your browser:\n');
  console.log('  ' + authUrl);
  console.log('\nStep 2: Sign in with sairam@cittaa.in (or any Google account)');
  console.log('Step 3: You will be redirected to a page that shows a code.');
  console.log('        Copy the "code" parameter from the URL.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  rl.question('Step 4: Paste the authorization code here → ', async (code) => {
    rl.close();
    try {
      const { tokens } = await oauth2Client.getToken(code.trim());

      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('  ✅ Success! Add these to Railway environment variables:');
      console.log('═══════════════════════════════════════════════════════════════\n');
      console.log(`GOOGLE_CLIENT_ID=${CLIENT_ID}`);
      console.log(`GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`);
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log(`GOOGLE_CALENDAR_ID=primary`);
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('  Copy the GOOGLE_REFRESH_TOKEN value above into Railway!');
      console.log('═══════════════════════════════════════════════════════════════\n');
    } catch (err) {
      console.error('\n❌ Failed to get token:', err.message);
    }
  });
}

main();
