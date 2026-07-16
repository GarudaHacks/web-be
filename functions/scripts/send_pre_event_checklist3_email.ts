/**
 * Send the final "Garuda Hacks 7.0 is tomorrow" reminder email (MAC address,
 * ID card, on-site registration, participant handbook, overnight essentials)
 * to every user whose application status is "accepted" or "confirmed rsvp".
 *
 * Talks to the PRODUCTION Firestore project directly via prod-key.json
 * (bypasses .env PROJECT_ID / emulator settings), and sends through the
 * real AWS SES SMTP relay configured in .env, pooled and rate-limited so
 * a large recipient list doesn't trip SES's max-sending-rate throttling.
 * Throttled/transient sends are retried with backoff instead of dropped.
 *
 * Each successful send stamps the user's doc with reminderEmail3Sent=true and
 * reminderEmail3SentAt (server timestamp); subsequent runs skip anyone already
 * marked, so it's safe to re-run for stragglers without double-emailing. This is
 * a separate flag from the earlier checklist emails' reminderEmailSent /
 * reminderEmail2Sent, so this script sends independently of who already got
 * checklist 1 or 2.
 *
 * Dry-run by default - only counts/lists recipients, sends nothing.
 *
 * To run (from functions/):
 *   npx tsx scripts/send_pre_event_checklist3_email.ts                    # dry-run
 *   npx tsx scripts/send_pre_event_checklist3_email.ts --send --test-email you@x.com  # smoke test
 *   npx tsx scripts/send_pre_event_checklist3_email.ts --send             # send to everyone not yet sent
 *   npx tsx scripts/send_pre_event_checklist3_email.ts --send --limit 25  # first 25 only
 *   npx tsx scripts/send_pre_event_checklist3_email.ts --send --force     # resend to everyone, ignoring reminderEmail3Sent
 *
 * Env overrides:
 *   SES_SEND_RATE        max messages/sec through the SES relay (default 10)
 *   SES_MAX_CONNECTIONS  pooled SMTP connections (default 5)
 *   SES_MAX_RETRIES      retries per message on throttling/transient errors (default 5)
 */

import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import nodemailer from "nodemailer";
import * as serviceAccount from "../prod-key.json";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = admin.initializeApp(
  { credential: admin.credential.cert(serviceAccount as admin.ServiceAccount) },
  "send-pre-event-checklist3-email"
);
const db = app.firestore();

const SUBJECT = "The Wait Is Over! Garuda Hacks 7.0 Is Tomorrow";
const TARGET_STATUSES = ["accepted", "confirmed rsvp"];

const RATE_LIMIT = Number(process.env.SES_SEND_RATE ?? 10);
const MAX_CONNECTIONS = Number(process.env.SES_MAX_CONNECTIONS ?? 5);
const MAX_RETRIES = Number(process.env.SES_MAX_RETRIES ?? 5);

const transporter = nodemailer.createTransport({
  host: process.env.SES_SMTP_HOST,
  port: Number(process.env.SES_SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SES_SMTP_USERNAME,
    pass: process.env.SES_SMTP_PASSWORD,
  },
  pool: true,
  maxConnections: MAX_CONNECTIONS,
  rateDelta: 1000,
  rateLimit: RATE_LIMIT,
});

interface ParsedArgs {
  send: boolean;
  testEmail?: string;
  limit?: number;
  force: boolean;
}

interface Recipient {
  uid?: string; // absent for --test-email, which isn't tied to a user doc
  email: string;
}

/**
 * Parse --send, --test-email <addr>, --limit <n> and --force from argv.
 */
function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const send = args.includes("--send");
  const testIdx = args.indexOf("--test-email");
  const testEmail = testIdx >= 0 ? args[testIdx + 1] : undefined;
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : undefined;
  const force = args.includes("--force");
  return { send, testEmail, limit, force };
}

/**
 * Fetch deduped, lowercased {uid, email} pairs for users with an accepted/confirmed-rsvp
 * status, skipping anyone already marked reminderEmail3Sent unless `force` is set.
 */
async function getRecipients(force: boolean): Promise<Recipient[]> {
  const snap = await db.collection("users").where("status", "in", TARGET_STATUSES).get();
  const seen = new Set<string>();
  const recipients: Recipient[] = [];
  let alreadySent = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const email = data.email;
    if (typeof email !== "string" || !email.trim()) continue;
    if (!force && data.reminderEmail3Sent === true) {
      alreadySent++;
      continue;
    }
    const normalized = email.trim().toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    recipients.push({ uid: doc.id, email: normalized });
  }
  if (alreadySent > 0) {
    console.log(`Skipping ${alreadySent} user(s) already marked reminderEmail3Sent (pass --force to resend).`);
  }
  return recipients;
}

/**
 * Resolve after `ms` milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * True if the error looks like SES throttling or a transient network failure.
 */
function isRetryable(err: any): boolean {
  const msg = String(err?.response ?? err?.message ?? err);
  return (
    err?.responseCode === 454 ||
    /throttl/i.test(msg) ||
    /rate exceeded/i.test(msg) ||
    ["ETIMEDOUT", "ECONNRESET", "ESOCKET", "EAI_AGAIN"].includes(err?.code)
  );
}

/**
 * Send one email, retrying with exponential backoff on throttling/transient errors.
 */
async function sendWithRetry(to: string, html: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await transporter.sendMail({
        from: process.env.SES_FROM_EMAIL,
        to,
        subject: SUBJECT,
        html,
      });
      return;
    } catch (err) {
      if (attempt >= MAX_RETRIES || !isRetryable(err)) {
        throw err;
      }
      const backoff = Math.min(30000, 1000 * 2 ** attempt);
      console.warn(
        `  retrying ${to} after error (attempt ${attempt + 1}/${MAX_RETRIES}): ${(err as Error).message}. waiting ${backoff}ms`
      );
      await sleep(backoff);
    }
  }
}

/**
 * Run `worker` over `items` with at most `concurrency` in flight at once.
 */
async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let idx = 0;
  /**
   * Pull the next item off the shared queue and process it.
   */
  async function next(): Promise<void> {
    const current = idx++;
    if (current >= items.length) return;
    await worker(items[current]);
    return next();
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
}

/**
 * Entry point: resolve recipients, dry-run or send, and write a results log.
 */
async function main() {
  const { send, testEmail, limit, force } = parseArgs();

  const html = fs.readFileSync(path.resolve(__dirname, "../src/templates/emailReminder3.html"), "utf-8");

  let recipients: Recipient[] = testEmail ? [{ email: testEmail }] : await getRecipients(force);
  if (limit) recipients = recipients.slice(0, limit);

  console.log(`Subject: ${SUBJECT}`);
  console.log(`Recipients: ${recipients.length}`);

  if (!send) {
    console.log("DRY RUN - pass --send to actually deliver. Sample recipients:");
    recipients.slice(0, 20).forEach((r) => console.log(`  ${r.email}`));
    if (recipients.length > 20) console.log(`  ...and ${recipients.length - 20} more`);
    return;
  }

  const sent: string[] = [];
  const failed: { email: string; error: string }[] = [];

  await runPool(recipients, MAX_CONNECTIONS, async ({ uid, email }) => {
    try {
      await sendWithRetry(email, html);
      sent.push(email);
      console.log(`[${sent.length + failed.length}/${recipients.length}] sent -> ${email}`);
      if (uid) {
        try {
          await db.collection("users").doc(uid).set(
            { reminderEmail3SentAt: FieldValue.serverTimestamp(), reminderEmail3Sent: true },
            { merge: true }
          );
        } catch (err) {
          console.warn(`  ! sent to ${email} but failed to record reminderEmail3SentAt: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      failed.push({ email, error: (err as Error).message });
      console.error(`[${sent.length + failed.length}/${recipients.length}] FAILED -> ${email}: ${(err as Error).message}`);
    }
  });

  transporter.close();

  const logDir = path.resolve(__dirname, "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `pre_event_checklist3_${Date.now()}.json`);
  fs.writeFileSync(logPath, JSON.stringify({ sent, failed }, null, 2));

  console.log("---");
  console.log(`Sent: ${sent.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Log written to ${logPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
