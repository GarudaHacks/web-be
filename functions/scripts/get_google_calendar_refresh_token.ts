/**
 * One-time helper: obtain a long-lived Google OAuth refresh token for a single
 * Google account (personal or Workspace), so the backend can create Calendar
 * events with auto-generated Google Meet links on that account's behalf.
 *
 * Setup (once, in Google Cloud Console, same or new project):
 *   1. APIs & Services > Library: enable "Google Calendar API".
 *   2. APIs & Services > OAuth consent screen: User type "External", publish
 *      status "In production" (NOT "Testing" - testing-mode refresh tokens
 *      expire after 7 days, which would break mid-event). You'll see an
 *      "unverified app" warning when you consent below - that's expected for
 *      your own app authorizing your own account; click through it.
 *   3. APIs & Services > Credentials > Create Credentials > OAuth client ID.
 *      Application type: "Desktop app". Note the Client ID and Client Secret.
 *
 * Run:
 *   GOOGLE_CALENDAR_CLIENT_ID=... GOOGLE_CALENDAR_CLIENT_SECRET=... \
 *     npx tsx scripts/get_google_calendar_refresh_token.ts
 *
 * It prints an auth URL - open it, sign in with the Google account you want
 * mentorship Meet events created under, and approve. The script catches the
 * redirect locally and prints GOOGLE_CALENDAR_REFRESH_TOKEN to paste into .env.
 */

import * as http from "http";
import { URL } from "url";
import { google } from "googleapis";

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = ["https://www.googleapis.com/auth/calendar"];

/**
 * Runs the local OAuth loopback flow and prints the resulting refresh token.
 */
async function main() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET env vars before running this script.");
    process.exit(1);
  }

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // forces a refresh_token even if you've authorized this app before
    scope: SCOPES,
  });

  console.log("\n1. Open this URL and approve access with the Google account you want to use:\n");
  console.log(authUrl);
  console.log("\n2. Waiting for the redirect back to localhost...\n");

  const code: string = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url) return;
      const url = new URL(req.url, REDIRECT_URI);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        res.end("Authorization failed. You can close this tab.");
        server.close();
        reject(new Error(error));
        return;
      }
      if (code) {
        res.end("Authorization successful! You can close this tab and return to the terminal.");
        server.close();
        resolve(code);
      }
    });
    server.listen(PORT);
  });

  const { tokens } = await oAuth2Client.getToken(code);

  if (!tokens.refresh_token) {
    console.error("\nNo refresh_token was returned. This usually means the account already granted");
    console.error("consent before without `prompt=consent`. Revoke access at");
    console.error("https://myaccount.google.com/permissions and re-run this script.");
    process.exit(1);
  }

  console.log("\nSuccess! Add these to functions/.env:\n");
  console.log(`GOOGLE_CALENDAR_CLIENT_ID=${clientId}`);
  console.log(`GOOGLE_CALENDAR_CLIENT_SECRET=${clientSecret}`);
  console.log(`GOOGLE_CALENDAR_REFRESH_TOKEN=${tokens.refresh_token}`);
}

main().catch((err) => {
  console.error("Failed to obtain refresh token:", err);
  process.exit(1);
});
